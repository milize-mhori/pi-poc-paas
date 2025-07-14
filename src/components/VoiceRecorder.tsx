"use client";
import { useRef, useState } from "react";

interface TranscriptResult {
  text: string;
  isFinal: boolean;
  timestamp: string;
}

export default function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RECORDING_TIME = 30; // 30秒

  const startRecording = async () => {
    try {
      setError(null);
      setIsProcessing(true);
      
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
        const inputData = inputBuffer.getChannelData(0); // モノラル音声
        
        // Float32Array をコピーして保存
        const chunk = new Float32Array(inputData.length);
        chunk.set(inputData);
        audioChunksRef.current.push(chunk);
        
        console.log('🎤 音声チャンクを受信:', chunk.length, 'samples');
      };
      
      // オーディオグラフを接続
      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      
      console.log('✅ Web Audio API 設定完了');
      
      setIsRecording(true);
      setIsProcessing(false);
      setRecordingTime(0);
      
      // 録音時間のタイマーを開始
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_TIME) {
            // 最大録音時間に達したら自動停止
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`マイクアクセスエラー: ${errorMessage}`);
      setIsProcessing(false);
    }
  };

  const stopRecording = async () => {
    // タイマーをクリア
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
    setIsProcessing(true);
    
    // 収集した音声データを処理
    if (audioChunksRef.current.length > 0) {
      await processAudioChunks();
    }
    
    setIsProcessing(false);
  };

  const processAudioChunks = async () => {
    try {
      console.log('🎵 音声チャンクの処理を開始...', {
        chunkCount: audioChunksRef.current.length,
        totalSamples: audioChunksRef.current.reduce((total, chunk) => total + chunk.length, 0)
      });
      
      if (audioChunksRef.current.length === 0) {
        setError('音声データが記録されていません');
        return;
      }
      
      // Float32Array を PCM 16-bit に変換
      const totalSamples = audioChunksRef.current.reduce((total, chunk) => total + chunk.length, 0);
      console.log('🔢 総サンプル数:', totalSamples);
      
      // 16-bit PCM データ用のバッファを作成
      const pcmBuffer = new ArrayBuffer(totalSamples * 2); // 16-bit = 2 bytes per sample
      const pcmView = new DataView(pcmBuffer);
      
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
        for (let i = 0; i < chunk.length; i++) {
          // Float32 (-1.0 to 1.0) を 16-bit signed integer (-32768 to 32767) に変換
          const sample = Math.max(-1, Math.min(1, chunk[i])); // クランプ
          const intSample = Math.round(sample * 32767);
          
          // リトルエンディアンで書き込み
          pcmView.setInt16(offset * 2, intSample, true);
          offset++;
        }
      }
      
      const combinedBuffer = Buffer.from(pcmBuffer);
      console.log('🔗 PCM バッファを作成:', combinedBuffer.length, 'bytes');
      
      // Base64エンコード
      const audioBase64 = combinedBuffer.toString('base64');
      console.log('📝 Base64エンコード完了:', audioBase64.length, 'characters');
      
      // APIに送信
      console.log('📡 APIに送信中...');
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audio: audioBase64 }),
      });
      
      console.log('📨 APIレスポンス:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ APIエラー:', errorData);
        throw new Error(errorData.error || 'Transcription failed');
      }
      
      const data = await response.json();
      console.log('✅ 転写結果:', data);
      
      if (data.results && data.results.length > 0) {
        setTranscript(prev => [...prev, ...data.results]);
        console.log('📝 転写結果を追加:', data.results.length, '件');
      } else {
        console.log('⚠️ 転写結果が空です');
        setError('音声を認識できませんでした。もう一度お試しください。');
      }
      
    } catch (err) {
      console.error('💥 音声処理エラー:', err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`音声処理エラー: ${errorMessage}`);
    }
  };

  const clearTranscript = () => {
    setTranscript([]);
    setError(null);
    setRecordingTime(0);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          リアルタイム音声認識デモ
        </h1>
        
        <div className="flex gap-4 mb-6">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 ${
              isRecording 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            {isProcessing ? "⏳ 処理中..." : isRecording ? "🛑 録音停止" : "🎤 録音開始"}
          </button>
          
          <button
            onClick={clearTranscript}
            disabled={isProcessing}
            className="px-6 py-3 rounded-lg font-medium bg-gray-500 hover:bg-gray-600 text-white disabled:opacity-50"
          >
            🗑️ クリア
          </button>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>エラー:</strong> {error}
          </div>
        )}
        
        {isRecording && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
            <div className="flex justify-between items-center">
              <span><strong>📢 録音中...</strong> マイクに向かって話してください</span>
              <span className="font-mono text-lg">
                {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:
                {String(recordingTime % 60).padStart(2, '0')} / 
                {String(Math.floor(MAX_RECORDING_TIME / 60)).padStart(2, '0')}:
                {String(MAX_RECORDING_TIME % 60).padStart(2, '0')}
              </span>
            </div>
            {recordingTime >= MAX_RECORDING_TIME * 0.8 && (
              <div className="mt-2 text-red-600">
                <strong>⚠️ 録音時間が上限に近づいています</strong>
              </div>
            )}
          </div>
        )}
        
        <div className="border rounded-lg p-4 min-h-[300px] bg-gray-50">
          <h2 className="text-lg font-semibold mb-3">転写結果:</h2>
          
          {transcript.length > 0 ? (
            <div className="space-y-2">
              {transcript.map((item, index) => (
                <div key={index} className="p-3 bg-white rounded border-l-4 border-blue-500">
                  <p className="text-gray-800">{item.text}</p>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-gray-500">
                      {new Date(item.timestamp).toLocaleTimeString('ja-JP')}
                    </p>
                    <span className={`px-2 py-1 rounded text-xs ${
                      item.isFinal 
                        ? "bg-green-100 text-green-800" 
                        : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {item.isFinal ? "確定" : "処理中"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg mb-4">
                録音開始ボタンを押してマイクに向かって話してください
              </p>
              <div className="text-gray-400">
                <p>🎤 マイクアクセスを許可してください</p>
                <p>🔊 クリアな音声で話してください</p>
                <p>⏹️ 録音停止後に文字起こしが開始されます</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">使用方法:</h3>
          <ol className="text-sm text-blue-700 space-y-1">
            <li>1. 「🎤 録音開始」ボタンをクリック</li>
            <li>2. マイクへのアクセスを許可</li>
            <li>3. マイクに向かって話す（最大30秒）</li>
            <li>4. 「🛑 録音停止」ボタンをクリック</li>
            <li>5. 文字起こし結果を確認</li>
          </ol>
          <div className="mt-3 text-xs text-blue-600">
            <p>💡 <strong>ヒント:</strong> 短い文章（5-15秒）での録音が最も精度が高くなります</p>
            <p>🔄 長い内容は複数回に分けて録音することをお勧めします</p>
          </div>
        </div>
      </div>
    </div>
  );
} 