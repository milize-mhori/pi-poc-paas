"use client";
import { useRef, useState, useCallback } from "react";

interface TranscriptResult {
  text: string;
  isFinal: boolean;
  timestamp: string;
}

interface DifyResponse {
  answer: string;
  conversation_id?: string;
  message_id?: string;
}

export default function RealtimeVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptResult[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Dify連携用の状態
  const [difyResponses, setDifyResponses] = useState<DifyResponse[]>([]);
  const [isDifyEnabled, setIsDifyEnabled] = useState(false);
  const [isDifyProcessing, setIsDifyProcessing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  
  // 文章終了検知用の状態
  const [silenceTimer, setSilenceTimer] = useState<NodeJS.Timeout | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [lastSpeechTime, setLastSpeechTime] = useState<number>(0);
  
  // 最新のpendingTextの値を参照するためのRef
  const pendingTextRef = useRef("");
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isStreamingRef = useRef(false);

  // Dify APIへのリクエスト送信
  const sendToDify = useCallback(async (message: string) => {
    if (!isDifyEnabled || !message.trim()) return;
    
    setIsDifyProcessing(true);
    try {
      const response = await fetch('/api/dify-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: message.trim(),
          conversation_id: conversationId 
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Dify API error: ${response.status}`);
      }
      
      const difyResult: DifyResponse = await response.json();
      
      // Dify応答を記録
      setDifyResponses(prev => [...prev, difyResult]);
      
      // 会話IDを保存（セッション継続のため）
      if (difyResult.conversation_id) {
        setConversationId(difyResult.conversation_id);
      }
      
      console.log('🤖 Dify応答:', difyResult.answer);
      
    } catch (error) {
      console.error('❌ Dify送信エラー:', error);
      setError(`Dify連携エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDifyProcessing(false);
    }
  }, [isDifyEnabled, conversationId]);

  // 文章終了検知：無音タイマーベース
  const handleSilenceDetection = useCallback((hasVoiceActivity: boolean) => {
    const now = Date.now();
    
    if (hasVoiceActivity) {
      // 音声活動あり：タイマーをリセット
      setLastSpeechTime(now);
      if (silenceTimer) {
        console.log('🔇 無音タイマーをリセット');
        clearTimeout(silenceTimer);
        setSilenceTimer(null);
      }
    } else {
      // 音声活動なし：無音タイマー開始
      const currentPendingText = pendingTextRef.current;
      console.log('🔇 無音検知:', { 
        silenceTimer: !!silenceTimer, 
        pendingText: `"${currentPendingText}"`, 
        timeSinceLastSpeech: now - lastSpeechTime,
        isDifyEnabled 
      });
      if (!silenceTimer && currentPendingText.trim() && (now - lastSpeechTime > 500)) {
        console.log('⏰ 無音タイマー開始（2秒）');
        const timer = setTimeout(() => {
          // 2秒間の無音で文章終了と判定
          const finalPendingText = pendingTextRef.current;
          if (finalPendingText.trim()) {
            console.log('🔚 文章終了検知:', finalPendingText);
            
            // Difyに送信
            if (isDifyEnabled) {
              sendToDify(finalPendingText);
            }
            
            // 確定結果として記録
            const finalResult: TranscriptResult = {
              text: finalPendingText.trim(),
              isFinal: true,
              timestamp: new Date().toISOString()
            };
            setTranscript(prev => [...prev, finalResult]);
            
            // ペンディングテキストをクリア
            setPendingText("");
            pendingTextRef.current = "";
            setCurrentText("");
          }
          setSilenceTimer(null);
        }, 2000); // 2秒間の無音
        
        setSilenceTimer(timer);
      }
    }
  }, [silenceTimer, lastSpeechTime, isDifyEnabled, sendToDify]);

  // 音声データをサーバーに送信する関数
  const sendAudioChunk = useCallback(async (audioData: Float32Array) => {
    if (!isStreamingRef.current) return;
    
    try {
      // Float32Array を PCM 16-bit に変換
      const pcmBuffer = new ArrayBuffer(audioData.length * 2);
      const pcmView = new DataView(pcmBuffer);
      
      for (let i = 0; i < audioData.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioData[i]));
        const intSample = Math.round(sample * 32767);
        pcmView.setInt16(i * 2, intSample, true);
      }
      
      const base64Audio = Buffer.from(pcmBuffer).toString('base64');
      console.log('📡 音声データ送信:', {
        samplesLength: audioData.length,
        base64Length: base64Audio.length,
        timestamp: new Date().toISOString()
      });
      
      // リアルタイム送信（統合API POST リクエスト）
      const response = await fetch('/api/transcribe-unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          audioChunk: base64Audio,
          timestamp: new Date().toISOString()
        }),
      });
      
      if (!response.ok) {
        console.error('❌ サーバーエラー:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ エラー詳細:', errorText);
      } else {
        const responseData = await response.json();
        console.log('✅ 音声データ送信成功:', {
          results: responseData.results?.length || 0,
          sseClients: responseData.sseClients,
          timestamp: responseData.timestamp
        });
      }
      
    } catch (err) {
      console.error('❌ 音声送信エラー:', err);
    }
  }, []);

  // Server-Sent Events による結果受信
  const startTranscriptionStream = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        setIsConnected(false);
        eventSourceRef.current = new EventSource('/api/transcribe-unified');
        
        eventSourceRef.current.onopen = () => {
          console.log('✅ SSE接続が開かれました');
          setIsConnected(true);
          setError(null);
          resolve(); // 接続が確立されたことを通知
        };
        
        eventSourceRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.error) {
              setError(data.error);
              return;
            }
            
            if (data.end) {
              console.log('🔚 転写ストリーム終了');
              return;
            }
            
            if (data.text) {
              console.log('📝 リアルタイム結果:', data.text, 'isFinal:', data.isFinal);
              
              // 音声活動検知：新しいテキストが来た = 話している
              handleSilenceDetection(true);
              
              if (data.isFinal) {
                // Amazon Transcribeの確定結果
                // ただし、これを直接Difyに送らず、無音検知と組み合わせる
                console.log('📋 Transcribe確定:', data.text);
                
                // ペンディングテキストに蓄積（文章全体を構築）
                setPendingText(prev => {
                  const newText = prev ? `${prev} ${data.text}` : data.text;
                  const trimmedText = newText.trim();
                  console.log('🔄 pendingText更新:', `"${prev}" → "${trimmedText}"`);
                  // Refも同時に更新して最新値を保持
                  pendingTextRef.current = trimmedText;
                  return trimmedText;
                });
                
                setCurrentText(""); // 部分結果をクリア
              } else {
                // 部分的結果を現在のテキストとして表示
                setCurrentText(data.text);
              }
            }
            
          } catch (parseError) {
            console.error('❌ SSEデータ解析エラー:', parseError);
          }
        };
        
        eventSourceRef.current.onerror = (error) => {
          console.error('❌ SSE接続エラー:', error);
          setError('リアルタイム接続でエラーが発生しました');
          setIsConnected(false);
          reject(error);
        };
        
      } catch (err) {
        console.error('❌ SSE初期化エラー:', err);
        setError('リアルタイム機能の初期化に失敗しました');
        reject(err);
      }
    });
  }, [handleSilenceDetection]);

  const startRealtimeRecording = useCallback(async () => {
    try {
      setError(null);
      
      // 1. 最初にSSE接続を確立
      console.log('🔌 SSE接続を開始します...');
      await startTranscriptionStream();
      console.log('✅ SSE接続が確立されました');
      
      // 2. SSE接続後にマイクアクセス
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      mediaStreamRef.current = stream;
      
      // 3. Web Audio API 設定
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // 4. 音声処理設定（SSE接続確立後）
      processorRef.current.onaudioprocess = (event) => {
        if (!isStreamingRef.current) return;
        
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // VAD (Voice Activity Detection): 音声レベル計算
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const voiceThreshold = 0.005; // 音声活動の閾値（調整可能）
        const hasVoiceActivity = rms > voiceThreshold;
        
        // デバッグログ追加
        if (Math.random() < 0.01) { // 1%の確率でログ出力（スパム防止）
          console.log('🎵 音声レベル:', { rms: rms.toFixed(4), hasVoice: hasVoiceActivity, threshold: voiceThreshold });
        }
        
        // 音声活動状態を検知システムに通知
        handleSilenceDetection(hasVoiceActivity);
        
        // データをキューに追加
        const chunk = new Float32Array(inputData.length);
        chunk.set(inputData);
        audioQueueRef.current.push(chunk);
        
        // バッファがたまったら送信（約0.5秒分）
        if (audioQueueRef.current.length >= 6) { // 4096 * 6 ≈ 0.5秒
          const combinedLength = audioQueueRef.current.reduce((sum, arr) => sum + arr.length, 0);
          const combined = new Float32Array(combinedLength);
          
          let offset = 0;
          for (const chunk of audioQueueRef.current) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          
          // リアルタイム送信
          sendAudioChunk(combined);
          
          // キューをクリア
          audioQueueRef.current = [];
        }
      };
      
      // オーディオグラフ接続
      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      
      isStreamingRef.current = true;
      setIsRecording(true);
      
      console.log('✅ リアルタイム録音開始');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`録音開始エラー: ${errorMessage}`);
    }
  }, [startTranscriptionStream, sendAudioChunk, handleSilenceDetection]);

  const stopRealtimeRecording = useCallback(async () => {
    try {
      isStreamingRef.current = false;
      
      // 残りの音声データを送信
      if (audioQueueRef.current.length > 0) {
        const combinedLength = audioQueueRef.current.reduce((sum, arr) => sum + arr.length, 0);
        const combined = new Float32Array(combinedLength);
        
        let offset = 0;
        for (const chunk of audioQueueRef.current) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        
        await sendAudioChunk(combined);
        audioQueueRef.current = [];
      }
      
      // オーディオリソースのクリーンアップ
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      
      // SSE接続終了
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      setIsRecording(false);
      setIsConnected(false);
      
      console.log('✅ リアルタイム録音停止');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`録音停止エラー: ${errorMessage}`);
    }
  }, [sendAudioChunk]);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setCurrentText("");
    setPendingText("");
    pendingTextRef.current = "";
    setError(null);
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          🔴 リアルタイム音声認識デモ
        </h1>
        
        {/* 接続状態表示 */}
        <div className="mb-4 flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm text-gray-600">
            {isConnected ? '🟢 リアルタイム接続中' : '⚫ 接続待機中'}
          </span>
        </div>
        
        {/* コントロールボタン */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={isRecording ? stopRealtimeRecording : startRealtimeRecording}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              isRecording 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            {isRecording ? "🛑 ストリーミング停止" : "🎤 ストリーミング開始"}
          </button>
          
          <button
            onClick={clearTranscript}
            disabled={isRecording}
            className="px-6 py-3 rounded-lg font-medium bg-gray-500 hover:bg-gray-600 text-white disabled:opacity-50"
          >
            🗑️ クリア
          </button>
        </div>
        
        {/* Dify連携設定 */}
        <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-purple-800">🤖 Dify AI連携</h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isDifyEnabled}
                onChange={(e) => setIsDifyEnabled(e.target.checked)}
                disabled={isRecording}
                className="rounded"
              />
              <span className="text-sm text-purple-700">
                {isDifyEnabled ? "有効" : "無効"}
              </span>
            </label>
          </div>
          
          <p className="text-sm text-purple-600">
            {isDifyEnabled 
              ? "🔗 音声が2秒間途切れると、文章をDifyに送信してAI応答を取得します"
              : "💡 チェックを入れるとDify AIとの連携が有効になります"
            }
          </p>
          
          {isDifyProcessing && (
            <div className="mt-2 text-sm text-purple-600">
              <span className="animate-spin inline-block">⏳</span> Dify処理中...
            </div>
          )}
        </div>
        
        {/* エラー表示 */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>エラー:</strong> {error}
          </div>
        )}
        
        {/* 録音状態表示 */}
        {isRecording && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            <div className="flex items-center justify-between">
              <span><strong>🔴 録音中...</strong> 話すとリアルタイムで文字起こしされます</span>
              {pendingText && (
                <span className="text-sm bg-green-200 px-2 py-1 rounded">
                  蓄積中: {pendingText.substring(0, 20)}...
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Dify応答エリア */}
        {difyResponses.length > 0 && (
          <div className="mb-6 border rounded-lg p-4 bg-purple-50">
            <h2 className="text-lg font-semibold mb-3 text-purple-800">🤖 Dify AI応答:</h2>
            <div className="space-y-3">
              {difyResponses.map((response, index) => (
                <div key={index} className="p-4 bg-white rounded border-l-4 border-purple-500">
                  <p className="text-gray-800 whitespace-pre-wrap">{response.answer}</p>
                  {response.conversation_id && (
                    <p className="text-xs text-gray-500 mt-2">
                      会話ID: {response.conversation_id}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 転写結果エリア */}
        <div className="border rounded-lg p-4 min-h-[300px] bg-gray-50">
          <h2 className="text-lg font-semibold mb-3">📝 リアルタイム転写結果:</h2>
          
          {/* 確定済みの転写結果 */}
          {transcript.length > 0 && (
            <div className="space-y-2 mb-4">
              {transcript.map((item, index) => (
                <div key={index} className="p-3 bg-white rounded border-l-4 border-blue-500">
                  <p className="text-gray-800">{item.text}</p>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-gray-500">
                      {new Date(item.timestamp).toLocaleTimeString('ja-JP')}
                    </p>
                    <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                      確定 → Dify送信済み
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* 現在認識中のテキスト */}
          {currentText && (
            <div className="p-3 bg-yellow-50 rounded border-l-4 border-yellow-400 mb-4">
              <p className="text-gray-700 italic">{currentText}</p>
              <p className="text-xs text-gray-500 mt-1">音声認識中...</p>
            </div>
          )}
          
          {/* 初期状態 */}
          {transcript.length === 0 && !currentText && !isRecording && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg mb-4">
                ストリーミング開始ボタンを押して話してください
              </p>
              <div className="text-gray-400">
                <p>🔴 リアルタイムで音声認識を行います</p>
                <p>🎤 話しながら文字が表示されます</p>
                <p>✨ 部分的な結果もリアルタイム表示</p>
                {isDifyEnabled && <p>🤖 2秒の無音でDify AI応答</p>}
              </div>
            </div>
          )}
        </div>
        
        {/* 使用方法 */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">📋 使用方法:</h3>
          <ol className="text-sm text-blue-700 space-y-1">
            <li>1. 「🎤 ストリーミング開始」をクリック</li>
            <li>2. マイクアクセスを許可</li>
            <li>3. 話し始めるとリアルタイムで文字が表示</li>
            <li>4. {isDifyEnabled ? "2秒間無音になるとDify AIが応答" : "必要に応じてDify連携を有効化"}</li>
          </ol>
        </div>
      </div>
    </div>
  );
} 