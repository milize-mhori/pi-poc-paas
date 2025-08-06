"use client";
import StreamingVoiceRecorder from "@/components/StreamingVoiceRecorder";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            🎯 リアルタイム音声対話システム
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            STT + Dify AI + TTS による次世代音声インターフェース
          </p>
          <div className="flex justify-center items-center gap-4 text-sm text-gray-500">
            <span>🎤 リアルタイム音声認識</span>
            <span>•</span>
            <span>🤖 AI対話処理</span>
            <span>•</span>
            <span>🔊 ストリーミング音声合成</span>
          </div>
        </div>

        {/* 機能説明パネル */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl mb-3">⚡</div>
              <h3 className="font-semibold text-gray-800 mb-2">リアルタイム処理</h3>
              <p className="text-sm text-gray-600">話している間に音声認識とAI応答が同時進行</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">🔄</div>
              <h3 className="font-semibold text-gray-800 mb-2">センテンス分割TTS</h3>
              <p className="text-sm text-gray-600">文章完成と同時に音声再生開始</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">🎭</div>
              <h3 className="font-semibold text-gray-800 mb-2">自然な対話</h3>
              <p className="text-sm text-gray-600">Amazon Polly による高品質な日本語音声</p>
            </div>
          </div>
        </div>

        {/* デモページへのリンク */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">🔗 デモページ</h2>
          <div className="flex justify-center">
            <a 
              href="/paas" 
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-8 rounded-lg shadow-lg transform transition duration-200 hover:scale-105 active:scale-95 text-center"
            >
              📱 PaaS通話システム
              <div className="text-sm opacity-90 mt-1">オペレータ発信デモ</div>
            </a>
          </div>
        </div>

        {/* メインコンポーネント */}
        <StreamingVoiceRecorder />

        {/* フッター情報 */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>🏗️ <strong>技術スタック:</strong> Next.js 14 + AWS Transcribe/Polly + Dify AI + Web Audio API</p>
          <p>💡 <strong>特徴:</strong> センテンス分割による低遅延音声対話システム</p>
        </div>
      </div>
    </main>
  );
}
