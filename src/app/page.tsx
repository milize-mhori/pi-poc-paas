"use client";
import { useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import RealtimeVoiceRecorder from "@/components/RealtimeVoiceRecorder";

type Mode = "batch" | "realtime";

export default function Home() {
  const [mode, setMode] = useState<Mode>("batch");

  return (
    <main className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Amazon Transcribe 音声認識デモ
          </h1>
          <p className="text-xl text-gray-600">
            バッチ処理 vs リアルタイムストリーミング
          </p>
        </div>

        {/* モード選択 */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">モード選択</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* バッチ処理モード */}
            <div 
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                mode === "batch" 
                  ? "border-blue-500 bg-blue-50" 
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onClick={() => setMode("batch")}
            >
              <div className="flex items-center mb-3">
                <input
                  type="radio"
                  checked={mode === "batch"}
                  onChange={() => setMode("batch")}
                  className="mr-3"
                />
                <h3 className="text-xl font-semibold text-gray-800">
                  📦 バッチ処理モード
                </h3>
              </div>
              
              <div className="text-sm text-gray-600 space-y-2">
                <p>✅ <strong>録音完了後</strong>に一括で音声認識</p>
                <p>✅ <strong>安定した動作</strong>と高い精度</p>
                <p>✅ <strong>シンプルな実装</strong>で信頼性が高い</p>
                <p>⚡ <strong>最大30秒</strong>の録音に対応</p>
              </div>
              
              <div className="mt-3 text-xs text-blue-600">
                <p><strong>適用場面:</strong> デモ、短い音声、確実な結果が必要</p>
              </div>
            </div>

            {/* リアルタイムストリーミングモード */}
            <div 
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                mode === "realtime" 
                  ? "border-red-500 bg-red-50" 
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onClick={() => setMode("realtime")}
            >
              <div className="flex items-center mb-3">
                <input
                  type="radio"
                  checked={mode === "realtime"}
                  onChange={() => setMode("realtime")}
                  className="mr-3"
                />
                <h3 className="text-xl font-semibold text-gray-800">
                  🔴 リアルタイムストリーミング
                </h3>
              </div>
              
              <div className="text-sm text-gray-600 space-y-2">
                <p>⚡ <strong>話しながら</strong>リアルタイムで文字が表示</p>
                <p>🌊 <strong>Server-Sent Events</strong>による双方向通信</p>
                <p>✨ <strong>部分的な結果</strong>も即座に確認</p>
                <p>🎯 <strong>最高のユーザー体験</strong></p>
              </div>
              
              <div className="mt-3 text-xs text-red-600">
                <p><strong>適用場面:</strong> プロダクト、リアルタイム会話、UX重視</p>
              </div>
            </div>
          </div>

          {/* 技術比較表 */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left">機能</th>
                  <th className="px-4 py-2 text-center">バッチ処理</th>
                  <th className="px-4 py-2 text-center">リアルタイム</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 border-t">レスポンス性</td>
                  <td className="px-4 py-2 border-t text-center">🟡 録音完了後</td>
                  <td className="px-4 py-2 border-t text-center">🟢 話しながら</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border-t">実装複雑度</td>
                  <td className="px-4 py-2 border-t text-center">🟢 シンプル</td>
                  <td className="px-4 py-2 border-t text-center">🟡 中程度</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border-t">ユーザー体験</td>
                  <td className="px-4 py-2 border-t text-center">🟡 標準的</td>
                  <td className="px-4 py-2 border-t text-center">🟢 優秀</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border-t">安定性</td>
                  <td className="px-4 py-2 border-t text-center">🟢 高い</td>
                  <td className="px-4 py-2 border-t text-center">🟡 良好</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 選択されたコンポーネントを表示 */}
        {mode === "batch" && <VoiceRecorder />}
        {mode === "realtime" && <RealtimeVoiceRecorder />}

        {/* フッター情報 */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>💡 <strong>ヒント:</strong> 両方のモードを試して違いを体験してください</p>
          <p>🔧 <strong>技術:</strong> Next.js 14 + AWS Transcribe Streaming + Web Audio API</p>
        </div>
      </div>
    </main>
  );
}
