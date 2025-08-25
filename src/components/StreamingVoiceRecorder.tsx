"use client";
import { useRef, useState, useEffect } from "react";

interface Message {
  type: 'user' | 'ai';
  text: string;
  timestamp: string;
  isComplete?: boolean;
}

interface RealtimeData {
  type: 'connected' | 'transcribe_result' | 'dify_partial' | 'dify_sentence_complete' | 'dify_final_complete' | 'error';
  sessionId?: string;
  text?: string;
  fullText?: string;
  audio?: string;
  isFinal?: boolean;
  sentenceIndex?: number;
  conversation_id?: string;
  message_id?: string;
  timestamp: string;
  message?: string;
  details?: string;
}

export default function StreamingVoiceRecorder() {
  // 基本状態
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // リアルタイム状態
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [currentAIResponse, setCurrentAIResponse] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  // 設定
  const [autoTTS, setAutoTTS] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState("Takumi");
  const [vocabularyName, setVocabularyName] = useState("roadservice");
  
  // 音声再生関連
  const [isPlaying, setIsPlaying] = useState(false);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // 録音関連
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // リアルタイム接続を開始
  const startRealtimeConnection = () => {
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    
    console.log('🔌 Starting real-time connection:', newSessionId);
    
    const url = new URL('/api/realtime-voice-chat', window.location.origin);
    url.searchParams.set('sessionId', newSessionId);
    url.searchParams.set('voiceId', selectedVoice);
    url.searchParams.set('autoTTS', autoTTS.toString());
    if (vocabularyName) {
      url.searchParams.set('vocabularyName', vocabularyName);
    }
    
    eventSourceRef.current = new EventSource(url.toString());
    
    eventSourceRef.current.onopen = () => {
      console.log('✅ Real-time connection opened');
      setIsConnected(true);
    };
    
    eventSourceRef.current.onmessage = (event) => {
      const data: RealtimeData = JSON.parse(event.data);
      handleRealtimeData(data);
    };
    
    eventSourceRef.current.onerror = () => {
      console.error('❌ Real-time connection error');
      setError('リアルタイム接続エラー');
      setIsConnected(false);
      cleanup();
    };
  };

  // リアルタイムデータ処理
  const handleRealtimeData = async (data: RealtimeData) => {
    console.log('📡 Received real-time data:', data.type, data);
    
    switch (data.type) {
      case 'connected':
        console.log('🎯 Real-time session connected:', data.sessionId);
        break;
        
      case 'transcribe_result':
        if (data.text) {
          setCurrentTranscript(data.text);
          
          if (data.isFinal) {
            // 確定した音声認識結果をメッセージに追加
            setMessages(prev => [...prev, {
              type: 'user',
              text: data.text!,
              timestamp: data.timestamp,
              isComplete: true
            }]);
            setCurrentTranscript('');
          }
        }
        break;
        
      case 'dify_partial':
        if (data.fullText) {
          setCurrentAIResponse(data.fullText);
        }
        break;
        
      case 'dify_sentence_complete':
        console.log('🎯 AI sentence complete:', data.text);
        if (data.audio && autoTTS) {
          audioQueueRef.current.push(data.audio);
          await processAudioQueue();
        }
        break;
        
      case 'dify_final_complete':
        console.log('📄 AI response complete:', data.fullText);
        if (data.audio && autoTTS) {
          audioQueueRef.current.push(data.audio);
          await processAudioQueue();
        }
        
        // AI応答をメッセージに追加
        if (data.fullText) {
          setMessages(prev => [...prev, {
            type: 'ai',
            text: data.fullText!,
            timestamp: data.timestamp,
            isComplete: true
          }]);
          setCurrentAIResponse('');
        }
        break;
        
      case 'error':
        console.error('❌ Real-time error:', data.message);
        setError(`リアルタイムエラー: ${data.message}`);
        break;
    }
  };

  // 音声録音開始
  const startRecording = async () => {
    try {
      setError(null);
      
      // リアルタイム接続がない場合は開始
      if (!isConnected || !sessionId) {
        startRealtimeConnection();
        // 接続完了を待つ
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // マイクアクセスを取得
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      mediaStreamRef.current = stream;
      
      // Web Audio API を使用
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // ScriptProcessorNode を使用して音声データを収集
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // 音声チャンクを収集
      audioChunksRef.current = [];
      
      processorRef.current.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        const chunk = new Float32Array(inputData.length);
        chunk.set(inputData);
        audioChunksRef.current.push(chunk);
      };
      
      // オーディオグラフを接続
      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      
      setIsRecording(true);
      
      // 定期的に音声データをサーバーに送信
      audioIntervalRef.current = setInterval(() => {
        sendAudioData();
      }, 250); // 250ms間隔で送信
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`マイクアクセスエラー: ${errorMessage}`);
    }
  };

  // 音声録音停止
  const stopRecording = async () => {
    // 定期送信を停止
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    
    // 最後の音声データを送信
    sendAudioData();
    
    // 録音停止をサーバーに通知
    if (sessionId) {
      try {
        await fetch('/api/realtime-voice-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, action: 'stop' })
        });
      } catch (error) {
        console.error('録音停止通知エラー:', error);
      }
    }
    
    // Audio Context とプロセッサーをクリーンアップ
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
    
    setIsRecording(false);
  };

  // 音声データを定期的にサーバーに送信
  const sendAudioData = async () => {
    if (!sessionId || audioChunksRef.current.length === 0) return;
    
    try {
      // Float32Array を PCM 16-bit に変換
      const totalSamples = audioChunksRef.current.reduce((total, chunk) => total + chunk.length, 0);
      const pcmBuffer = new ArrayBuffer(totalSamples * 2);
      const pcmView = new DataView(pcmBuffer);
      
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
        for (let i = 0; i < chunk.length; i++) {
          const sample = Math.max(-1, Math.min(1, chunk[i]));
          const intSample = Math.round(sample * 32767);
          pcmView.setInt16(offset * 2, intSample, true);
          offset++;
        }
      }
      
      const combinedBuffer = Buffer.from(pcmBuffer);
      const audioBase64 = combinedBuffer.toString('base64');
      
      // サーバーに送信
      await fetch('/api/realtime-voice-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, audioChunk: audioBase64 })
      });
      
      // 送信済みチャンクをクリア
      audioChunksRef.current = [];
      
    } catch (error) {
      console.error('音声データ送信エラー:', error);
    }
  };

  // 音声キューの順次再生
  const processAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    
    isPlayingRef.current = true;
    setIsPlaying(true);
    
    while (audioQueueRef.current.length > 0) {
      const audioBase64 = audioQueueRef.current.shift()!;
      await playAudio(audioBase64);
      
      // 小さな間隔を空ける
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isPlayingRef.current = false;
    setIsPlaying(false);
  };

  const playAudio = async (audioBase64: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
        const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          resolve();
        };
        
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          reject();
        };
        
        audio.play().catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
  };

  const cleanup = () => {
    // EventSource を閉じる
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // 録音を停止
    if (isRecording) {
      stopRecording();
    }
    
    // 音声を停止
    stopAudio();
    
    // 状態をリセット
    setIsConnected(false);
    setSessionId(null);
    setCurrentTranscript('');
    setCurrentAIResponse('');
    setError(null);
  };

  const clearAll = () => {
    cleanup();
    setMessages([]);
  };

  // コンポーネントのアンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          🎯 リアルタイム音声対話システム
        </h1>
        
        {/* 設定パネル */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-800 mb-3">設定</h3>
          <div className="flex flex-wrap gap-4 items-center">
            <div className={`px-3 py-1 rounded text-sm ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {isConnected ? '🟢 接続済み' : '🔴 未接続'}
            </div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoTTS}
                onChange={(e) => setAutoTTS(e.target.checked)}
                className="mr-2"
                disabled={isRecording}
              />
              自動音声再生
            </label>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">音声:</label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="px-3 py-1 border rounded"
                disabled={isRecording}
              >
                <option value="Takumi">Takumi（男性）</option>
                <option value="Mizuki">Mizuki（女性）</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">カスタムボキャブラリー:</label>
              <input
                type="text"
                value={vocabularyName}
                onChange={(e) => setVocabularyName(e.target.value)}
                className="px-3 py-1 border rounded text-sm"
                placeholder="roadservice"
                disabled={isRecording || isConnected}
              />
            </div>
          </div>
        </div>
        
        {/* コントロールボタン */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              isRecording 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            {isRecording ? "🛑 録音停止" : "🎤 録音開始"}
          </button>
          
          <button
            onClick={clearAll}
            disabled={isRecording}
            className="px-6 py-3 rounded-lg font-medium bg-gray-500 hover:bg-gray-600 text-white disabled:opacity-50"
          >
            🗑️ 全クリア
          </button>
          
          {!isConnected && !isRecording && (
            <button
              onClick={startRealtimeConnection}
              className="px-6 py-3 rounded-lg font-medium bg-green-500 hover:bg-green-600 text-white"
            >
              🔌 接続開始
            </button>
          )}
          
          {isPlaying && (
            <button
              onClick={stopAudio}
              className="px-6 py-3 rounded-lg font-medium bg-orange-500 hover:bg-orange-600 text-white"
            >
              🔇 音声停止
            </button>
          )}
        </div>
        
        {/* ステータス表示 */}
        <div className="mb-4 space-y-2">
          {isRecording && (
            <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
              <span><strong>🎤 録音中...</strong> 話すとリアルタイムで音声認識されます</span>
            </div>
          )}
          
          {currentTranscript && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
              <span><strong>📝 音声認識中:</strong> {currentTranscript}</span>
            </div>
          )}
          
          {currentAIResponse && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              <span><strong>🤖 AI応答中:</strong> {currentAIResponse}</span>
              <span className="animate-pulse">▋</span>
            </div>
          )}
          
          {isPlaying && (
            <div className="bg-purple-100 border border-purple-400 text-purple-700 px-4 py-3 rounded">
              <span><strong>🔊 音声再生中...</strong></span>
            </div>
          )}
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>エラー:</strong> {error}
          </div>
        )}
        
        {/* 会話表示 */}
        <div className="border rounded-lg p-4 min-h-[400px] bg-gray-50">
          <h2 className="text-lg font-semibold mb-3">リアルタイム会話:</h2>
          
          {messages.length > 0 ? (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] p-3 rounded-lg ${
                    message.type === 'user' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-white border'
                  }`}>
                    <p className={message.type === 'user' ? 'text-white' : 'text-gray-800'}>
                      {message.text}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                      <span className={`text-xs ${message.type === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                        {message.type === 'user' ? '👤 あなた' : '🤖 AI'}
                      </span>
                      <span className={`text-xs ${message.type === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                        {new Date(message.timestamp).toLocaleTimeString('ja-JP')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg mb-4">
                🔌 接続開始 → 🎤 録音開始 でリアルタイム音声対話を始めましょう
              </p>
              <div className="text-gray-400">
                <p>⚡ 話している間にリアルタイムで音声認識</p>
                <p>🤖 文章が完成するとAIが即座に応答</p>
                <p>🔊 センテンス完成と同時に音声再生</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">✨ リアルタイム機能:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>真のリアルタイム処理</strong>: 話している間に音声認識・AI応答・音声合成が同時進行</li>
            <li>• <strong>低遅延応答</strong>: 文章完成と同時に音声再生開始</li>
            <li>• <strong>連続会話</strong>: 会話コンテキストを保持した自然な対話</li>
            <li>• <strong>高品質音声</strong>: Amazon Polly による自然な日本語音声</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 