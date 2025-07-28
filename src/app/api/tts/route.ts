import { NextRequest } from "next/server";
import {
  PollyClient,
  SynthesizeSpeechCommand,
  VoiceId,
  OutputFormat,
  Engine
} from "@aws-sdk/client-polly";

export async function POST(request: NextRequest) {
  try {
    console.log('🔊 TTS request received');
    
    const { text, voiceId = "Takumi", speed = "medium" } = await request.json();
    
    if (!text?.trim()) {
      return Response.json({ error: "No text provided" }, { status: 400 });
    }

    // 日本語音声かどうかを事前チェック
    const isJapaneseVoice = ['Takumi', 'Mizuki'].includes(voiceId);
    const maxLength = isJapaneseVoice ? 3000 : 600; // Standard: 3000, Neural: 600
    const engine = isJapaneseVoice ? Engine.STANDARD : Engine.NEURAL;
    
    // テキスト長のチェック
    if (text.length > maxLength) {
      return Response.json({ 
        error: `Text too long for ${isJapaneseVoice ? 'Standard' : 'Neural'} voice`, 
        maxLength,
        currentLength: text.length 
      }, { status: 400 });
    }

    // AWS Polly クライアントの初期化
    const pollyClient = new PollyClient({
      region: process.env.AWS_REGION || "ap-northeast-1"
    });

    console.log('📤 Sending to Polly:', text.substring(0, 100) + '...');

    // SSML形式でテキストを装飾（発話速度調整）
    const ssmlText = `<speak><prosody rate="${speed}">${escapeSSML(text)}</prosody></speak>`;
    
    console.log(`🔧 Using engine: ${engine} for voice: ${voiceId}`);

    const command = new SynthesizeSpeechCommand({
      Text: ssmlText,
      TextType: "ssml",
      OutputFormat: OutputFormat.MP3,
      VoiceId: voiceId as VoiceId,
      Engine: engine,
      SampleRate: "22050" // 高品質オーディオ
    });

    const response = await pollyClient.send(command);
    
    if (!response.AudioStream) {
      throw new Error("Audio stream not found");
    }

    // ストリームをバッファに変換
    const audioBuffer = await streamToBuffer(response.AudioStream);
    
    console.log('📥 Polly response received, audio size:', audioBuffer.length, 'bytes');

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "public, max-age=3600", // 1時間キャッシュ
        "Access-Control-Allow-Origin": "*"
      },
    });
    
  } catch (error) {
    console.error("❌ TTS error:", error);
    return Response.json(
      { 
        error: "TTS failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// ストリームをバッファに変換
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: any[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// SSML エスケープ
function escapeSSML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
} 