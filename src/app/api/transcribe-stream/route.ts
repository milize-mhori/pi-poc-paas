import { NextRequest } from "next/server";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from "@aws-sdk/client-transcribe-streaming";

// WebSocketアップグレードの処理
export async function GET(request: NextRequest) {
  const upgradeHeader = request.headers.get("upgrade");
  if (upgradeHeader !== "websocket") {
    return new Response("WebSocket upgrade required", { status: 426 });
  }

  // 実際のWebSocket実装は環境によって異なります
  // Next.js 15では直接的なWebSocketサポートが限定的
  return new Response("WebSocket endpoint - requires custom server", {
    status: 501,
    headers: { "Content-Type": "text/plain" },
  });
}

// リアルタイムストリーミング用のPOSTエンドポイント
export async function POST(request: NextRequest) {
  try {
    console.log('🎯 Real-time Transcribe API called');
    
    // Server-Sent Events (SSE) を使用
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        // ここでTranscribeのストリーミング処理を開始
        handleRealtimeTranscription(controller, encoder);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
    
  } catch (error) {
    console.error("Realtime API error:", error);
    return Response.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

async function handleRealtimeTranscription(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
) {
  try {
    // AWS認証情報の確認
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      const errorData = encoder.encode('data: {"error": "AWS credentials not configured"}\n\n');
      controller.enqueue(errorData);
      controller.close();
      return;
    }

    const client = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || "ap-northeast-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // 音声ストリームの準備（実際の実装では外部から音声データを受信）
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: "ja-JP",
      MediaEncoding: "pcm",
      MediaSampleRateHertz: 16000,
      AudioStream: (async function* (): AsyncGenerator<AudioStream> {
        // この部分は実際の音声データストリームに接続する
        yield { AudioEvent: { AudioChunk: new Uint8Array(0) } };
      })(),
    });

    console.log('🚀 Starting real-time transcription...');
    const response = await client.send(command);
    
    // リアルタイム結果の配信
    for await (const event of response.TranscriptResultStream as AsyncIterable<any>) {
      const transcriptResults = event.TranscriptEvent?.Transcript?.Results;
      if (transcriptResults) {
        for (const result of transcriptResults) {
          const text = result.Alternatives?.[0]?.Transcript ?? "";
          if (text.trim()) {
            const transcriptData = {
              text,
              isFinal: !result.IsPartial,
              timestamp: new Date().toISOString(),
            };
            
            // SSE形式でクライアントに送信
            const sseData = encoder.encode(`data: ${JSON.stringify(transcriptData)}\n\n`);
            controller.enqueue(sseData);
            
            console.log('📝 Real-time result:', text, 'isFinal:', !result.IsPartial);
          }
        }
      }
    }
    
    // ストリーム終了
    const endData = encoder.encode('data: {"end": true}\n\n');
    controller.enqueue(endData);
    controller.close();
    
  } catch (error) {
    console.error("Real-time transcription error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorData = encoder.encode(`data: {"error": "${errorMessage}"}\n\n`);
    controller.enqueue(errorData);
    controller.close();
  }
} 