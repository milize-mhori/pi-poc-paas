import { NextRequest } from "next/server";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from "@aws-sdk/client-transcribe-streaming";

// リアルタイム転写セッションの管理
const activeSessions = new Map<string, {
  client: TranscribeStreamingClient;
  audioStream: AsyncGenerator<AudioStream>;
  controller: ReadableStreamDefaultController;
}>();

export async function POST(request: NextRequest) {
  try {
    console.log('🎯 Realtime audio chunk received');
    
    const { audioChunk, timestamp, sessionId = 'default' } = await request.json();
    
    console.log('📊 Request data:', {
      audioChunkLength: audioChunk?.length || 0,
      timestamp,
      sessionId
    });
    
    if (!audioChunk) {
      console.error('❌ No audio chunk provided');
      return Response.json({ error: "No audio chunk provided" }, { status: 400 });
    }

    // AWS認証情報の確認
    console.log('🔐 Checking AWS credentials...');
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.error('❌ AWS credentials not configured');
      return Response.json(
        { error: "AWS credentials not configured" },
        { status: 500 }
      );
    }
    console.log('✅ AWS credentials found');

    console.log('📊 Audio chunk received:', audioChunk.length, 'chars at', timestamp);

    // セッション管理（将来の拡張のため）
    // 現在は簡単な実装として、チャンクごとに処理
    
    const audioBuffer = Buffer.from(audioChunk, "base64");
    console.log('📦 Audio buffer created:', audioBuffer.length, 'bytes');

    console.log('🔧 Creating AWS Transcribe client...');
    const client = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || "ap-northeast-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    console.log('✅ AWS Transcribe client created');

    // チャンクサイズを小さく（リアルタイム処理のため）
    const CHUNK_SIZE = 1024 * 4; // 4KB chunks for real-time
    const chunks: Buffer[] = [];
    
    for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
      const chunk = audioBuffer.slice(i, i + CHUNK_SIZE);
      chunks.push(chunk);
    }
    
    console.log('🔢 Audio divided into', chunks.length, 'chunks');

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: "ja-JP",
      MediaEncoding: "pcm",
      MediaSampleRateHertz: 16000,
      AudioStream: (async function* (): AsyncGenerator<AudioStream> {
        // リアルタイム用に短い間隔で送信
        for (const chunk of chunks) {
          yield { AudioEvent: { AudioChunk: chunk } };
          // 短い待機時間（リアルタイム性を重視）
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      })(),
    });

    // Transcribeからの結果を収集（リアルタイム）
    const results: any[] = [];
    
    try {
      console.log('🚀 Sending chunk to Amazon Transcribe...');
      const response = await client.send(command);
      console.log('📨 Received response from Amazon Transcribe');
      
      console.log('🔄 Processing transcript result stream...');
      for await (const event of response.TranscriptResultStream as AsyncIterable<any>) {
        console.log('📡 Received event from stream:', Object.keys(event));
        const transcriptResults = event.TranscriptEvent?.Transcript?.Results;
        if (transcriptResults && transcriptResults.length > 0) {
          for (const result of transcriptResults) {
            const text = result.Alternatives?.[0]?.Transcript ?? "";
            if (text.trim()) {
              const transcriptData = {
                text,
                isFinal: !result.IsPartial,
                timestamp: new Date().toISOString(),
                sessionId,
              };
              
              results.push(transcriptData);
              console.log('📝 Realtime result:', text, 'isFinal:', !result.IsPartial);
              
              // リアルタイム結果を即座にクライアントに通知
              // ここでSSEやWebSocketを使用してクライアントに送信
              await notifyClient(transcriptData);
            }
          }
        }
      }
      
      console.log('✅ Chunk processing completed, results:', results.length);
      return Response.json({ 
        success: true, 
        results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error("❌ Transcription error:", error);
      if (error instanceof Error) {
        console.error("❌ Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      return Response.json(
        { 
          error: "Transcription failed", 
          details: error instanceof Error ? error.message : "Unknown error" 
        },
        { status: 500 }
      );
    }
    
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

// クライアントへの通知機能（SSE用のグローバルクライアント管理）
const sseClients = new Set<ReadableStreamDefaultController>();

export function addSSEClient(controller: ReadableStreamDefaultController) {
  sseClients.add(controller);
  console.log('➕ SSE client added, total:', sseClients.size);
}

export function removeSSEClient(controller: ReadableStreamDefaultController) {
  sseClients.delete(controller);
  console.log('➖ SSE client removed, total:', sseClients.size);
}

async function notifyClient(transcriptData: any) {
  console.log('📢 NotifyClient called with:', transcriptData.text);
  console.log('📊 Active SSE clients:', sseClients.size);
  
  const encoder = new TextEncoder();
  const sseData = encoder.encode(`data: ${JSON.stringify(transcriptData)}\n\n`);
  
  console.log('📡 Sending to', sseClients.size, 'SSE clients:', transcriptData.text);
  
  // 全てのSSEクライアントに送信
  const deadClients = new Set<ReadableStreamDefaultController>();
  
  for (const controller of sseClients) {
    try {
      controller.enqueue(sseData);
    } catch (error) {
      console.error('❌ Failed to send to SSE client:', error);
      deadClients.add(controller); // 壊れたクライアントをマーク
    }
  }
  
  // 壊れたクライアントを削除
  for (const deadClient of deadClients) {
    sseClients.delete(deadClient);
  }
  
  console.log('📡 Notified', sseClients.size - deadClients.size, 'SSE clients (removed', deadClients.size, 'dead clients)');
} 