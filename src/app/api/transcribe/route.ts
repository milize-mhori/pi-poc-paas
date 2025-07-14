import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from "@aws-sdk/client-transcribe-streaming";
import { PassThrough } from "stream";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // WebSocketアップグレードの確認
  const upgradeHeader = request.headers.get("upgrade");
  if (upgradeHeader !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  // 現在のNext.jsはWebSocketの直接サポートが限定的なため、
  // 代替として Server-Sent Events (SSE) を使用
  return new Response("WebSocket not directly supported in this implementation", {
    status: 501,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: NextRequest) {
  try {
    console.log('🎯 Transcribe API called');
    const { audio } = await request.json();
    
    if (!audio) {
      console.log('❌ No audio data provided');
      return Response.json({ error: "No audio data provided" }, { status: 400 });
    }

    console.log('📊 Audio data received:', audio.length, 'characters');

    // AWS認証情報の確認
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('❌ AWS credentials not configured');
      return Response.json(
        { error: "AWS credentials not configured" },
        { status: 500 }
      );
    }

    console.log('✅ AWS credentials found');

    const client = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || "ap-northeast-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // 音声データを小さなチャンクに分割
    const audioBuffer = Buffer.from(audio, "base64");
    console.log('📦 Audio buffer created:', audioBuffer.length, 'bytes');
    
    const CHUNK_SIZE = 1024 * 8; // 8KB chunks
    const chunks: Buffer[] = [];
    
    for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
      const chunk = audioBuffer.slice(i, i + CHUNK_SIZE);
      chunks.push(chunk);
    }
    
    console.log('🔢 Audio divided into', chunks.length, 'chunks');

    // 最大処理時間を制限
    const MAX_AUDIO_DURATION = 30; // 30秒
    const SAMPLE_RATE = 16000;
    const BYTES_PER_SAMPLE = 2; // 16-bit PCM
    const MAX_BYTES = MAX_AUDIO_DURATION * SAMPLE_RATE * BYTES_PER_SAMPLE;
    
    if (audioBuffer.length > MAX_BYTES) {
      console.log('❌ Audio too long:', audioBuffer.length, 'bytes, max:', MAX_BYTES);
      return Response.json(
        { error: "Audio too long. Maximum 30 seconds allowed." },
        { status: 400 }
      );
    }

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: "ja-JP",
      MediaEncoding: "pcm",
      MediaSampleRateHertz: 16000,
      AudioStream: (async function* (): AsyncGenerator<AudioStream> {
        // 小さなチャンクを順次送信
        for (const chunk of chunks) {
          yield { AudioEvent: { AudioChunk: chunk } };
          // 少し待機してストリーミング効果を出す
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      })(),
    });

    // Transcribeからの結果を収集
    const results: any[] = [];
    
    try {
      console.log('🚀 Sending to Amazon Transcribe...');
      const response = await client.send(command);
      console.log('✅ Transcribe response received');
      
      for await (const event of response.TranscriptResultStream as AsyncIterable<any>) {
        console.log('📨 Transcribe event received:', event);
        const transcriptResults = event.TranscriptEvent?.Transcript?.Results;
        if (transcriptResults) {
          for (const result of transcriptResults) {
            const text = result.Alternatives?.[0]?.Transcript ?? "";
            if (text.trim()) {
              console.log('📝 Transcribe result:', text, 'isFinal:', !result.IsPartial);
              results.push({
                text,
                isFinal: !result.IsPartial,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      }
      
      console.log('🎯 Final results:', results.length, 'items');
      return Response.json({ results });
      
    } catch (error) {
      console.error("Transcription error:", error);
      return Response.json(
        { 
          error: "Transcription failed", 
          details: error instanceof Error ? error.message : "Unknown error" 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error("API error:", error);
    return Response.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
} 