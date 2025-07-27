# 🎤 Amazon Transcribe + Dify AI連携デモ

リアルタイム音声認識とAI会話を組み合わせたデモアプリケーションです。

## 🚀 主な機能

### 📝 バッチモード
- 録音完了後に一括で文字起こし
- 高精度で安定した変換
- 長時間の音声にも対応

### ⚡ リアルタイムモード + Dify AI連携
- **リアルタイム音声認識**: 話しながら即座に文字起こし
- **VAD (Voice Activity Detection)**: 音声活動の自動検知
- **智能文章終了検知**: 2秒の無音で文章区切りを判定
- **Dify AI連携**: 文章完了と同時にAI応答を取得
- **会話継続**: セッション管理による自然な対話

## 🛠️ 技術スタック

- **フロントエンド**: Next.js 15, TypeScript, Tailwind CSS
- **音声処理**: Web Audio API, ScriptProcessorNode
- **リアルタイム通信**: Server-Sent Events (SSE)
- **AI連携**: Amazon Transcribe Streaming + Dify Chat API
- **音声検知**: RMS値ベースVAD + タイマー制御

## 📋 セットアップ

### 1. プロジェクトセットアップ
```bash
npm install
npm run dev
```

### 2. 環境変数設定
`.env.local` ファイルを作成：

```bash
# Amazon Transcribe設定 (必須)
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here  
AWS_REGION=ap-northeast-1

# Dify AI連携設定 (オプション)
DIFY_API_KEY=your_dify_api_key_here
DIFY_BASE_URL=https://api.dify.ai/v1
```

### 3. AWS権限設定
IAMユーザーに以下の権限を付与：
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow", 
      "Action": [
        "transcribe:StartStreamTranscription"
      ],
      "Resource": "*"
    }
  ]
}
```

### 4. Dify設定（オプション）
1. [Dify.ai](https://dify.ai) でアカウント作成
2. Chat Appを作成
3. API KEYを取得
4. `.env.local` に設定

## 🎯 使用方法

### リアルタイムモード + AI連携
1. **Dify連携を有効化** (チェックボックス)
2. **ストリーミング開始**をクリック
3. **話す** → リアルタイム文字起こし
4. **2秒間無音** → 自動でDify AIが応答
5. **継続会話** → セッション継続で自然な対話

### 音声認識の流れ
```text
🎤 音声入力
↓
🔊 VAD検知 (RMS > 0.01)
↓ 
📡 Amazon Transcribe (部分結果)
↓
⏱️ 2秒無音検知
↓
🤖 Dify AI処理
↓
💬 AI応答表示
```

## 🏗️ アーキテクチャ

### データフロー
```text
Web Audio API → SSE → Transcribe → VAD → Dify → UI
     ↑                                      ↓
     └─────────── 双方向リアルタイム通信 ──────┘
```

### 文章終了検知アルゴリズム
```javascript
// 1. 音声レベル監視
RMS値 > 0.01 → 音声活動あり
RMS値 ≤ 0.01 → 無音状態

// 2. タイマー制御  
音声活動 → タイマーリセット
無音2秒継続 → 文章終了判定

// 3. Dify送信
文章終了 → pendingText → Dify API
```

## 🔧 カスタマイズ

### VAD感度調整
```typescript
const voiceThreshold = 0.01; // 音声検知閾値
const silenceTimeout = 2000; // 無音判定時間(ms)
```

### Dify設定
```typescript
// カスタムプロンプト、温度設定など
// /api/dify-chat/route.ts で設定可能
```

## 🚦 トラブルシューティング

### よくある問題

**Q: 音声認識されない**
- マイクアクセス許可を確認
- HTTPS環境で実行 (本番環境)
- AWS認証情報を確認

**Q: Dify連携が動かない**
- `DIFY_API_KEY` 設定を確認
- Dify App IDが正しいか確認
- ネットワーク接続を確認

**Q: 文章が途中で切れる**
- VAD閾値を調整 (`voiceThreshold`)
- 無音時間を延長 (`silenceTimeout`)

## 📈 発展的な実装

### 将来の拡張予定
- [ ] **複数言語対応** (英語、中国語等)
- [ ] **感情分析連携** 
- [ ] **音声合成応答** (Text-to-Speech)
- [ ] **WebRTC による高品質音声**
- [ ] **クラウド録音保存**

### 高度なVAD
- [ ] **Deep Learning VAD** (WebRTC VAD, Silero VAD)
- [ ] **話者分離** (Speaker Diarization) 
- [ ] **語調・感情検知**

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

プルリクエスト・イシュー報告歓迎です！

---

🎯 **AI通話システムの核心技術を体験できるデモアプリケーション**
