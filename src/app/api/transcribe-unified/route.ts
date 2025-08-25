import { NextRequest } from "next/server";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from "@aws-sdk/client-transcribe-streaming";

// SSEクライアントの管理
const sseClients = new Map<string, ReadableStreamDefaultController>();

// SSE接続の処理
export async function GET() {
  try {
    console.log('🎯 SSE connection requested');
    
    const clientId = crypto.randomUUID();
    let streamController: ReadableStreamDefaultController | null = null;
    
    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
        sseClients.set(clientId, controller);
        
        console.log(`➕ SSE client ${clientId} added, total:`, sseClients.size);
        
        // 接続確認メッセージ
        const encoder = new TextEncoder();
        const welcomeData = encoder.encode('data: {"connected": true, "message": "SSE connection established"}\n\n');
        controller.enqueue(welcomeData);
        
        console.log('✅ SSE client connected');
      },
      cancel() {
        // クライアント切断時のクリーンアップ
        console.log(`🔌 SSE client ${clientId} disconnected`);
        if (streamController) {
          sseClients.delete(clientId);
          console.log(`➖ SSE client ${clientId} removed, total:`, sseClients.size);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
    
  } catch (error) {
    console.error("❌ SSE stream error:", error);
    return Response.json(
      { 
        error: "SSE stream failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// 音声データ処理
export async function POST(request: NextRequest) {
  try {
    console.log('🎯 Audio chunk received for processing');
    
    const { audioChunk, timestamp, sessionId = 'default' } = await request.json();
    
    console.log('📊 Request data:', {
      audioChunkLength: audioChunk?.length || 0,
      timestamp,
      sessionId,
      activeSSEClients: sseClients.size
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
      LanguageCode: "ja-JP" as const,
      MediaEncoding: "pcm" as const,
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
    const results: Array<{
      text: string;
      isFinal: boolean;
      timestamp: string;
      sessionId: string;
    }> = [];
    
    try {
      console.log('🚀 Sending chunk to Amazon Transcribe...');
      const response = await client.send(command);
      console.log('📨 Received response from Amazon Transcribe');
      
      console.log('🔄 Processing transcript result stream...');
      for await (const event of response.TranscriptResultStream as AsyncIterable<{ TranscriptEvent?: { Transcript?: { Results?: Array<{ Alternatives?: Array<{ Transcript?: string }>; IsPartial?: boolean }> } } }>) {
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
              
              // 同一API内でSSEクライアントに即座に送信
              await notifySSEClients(transcriptData);
            }
          }
        }
      }
      
      console.log('✅ Chunk processing completed, results:', results.length);
      return Response.json({ 
        success: true, 
        results,
        timestamp: new Date().toISOString(),
        sseClients: sseClients.size
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
    console.error("❌ Unified API error:", error);
    return Response.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// SSEクライアントへの通知機能
async function notifySSEClients(transcriptData: {
  text: string;
  isFinal: boolean;
  timestamp: string;
  sessionId: string;
}) {
  console.log('📢 Notifying SSE clients with:', transcriptData.text);
  console.log('📊 Active SSE clients:', sseClients.size);
  
  if (sseClients.size === 0) {
    console.log('⚠️ No SSE clients to notify');
    return;
  }
  
  const encoder = new TextEncoder();
  const sseData = encoder.encode(`data: ${JSON.stringify(transcriptData)}\n\n`);
  
  console.log('📡 Sending to', sseClients.size, 'SSE clients:', transcriptData.text);
  
  // 全てのSSEクライアントに送信
  const deadClients = new Set<string>();
  
  for (const [clientId, controller] of sseClients) {
    try {
      controller.enqueue(sseData);
      console.log(`✅ Sent to client ${clientId}`);
    } catch (error) {
      console.error(`❌ Failed to send to SSE client ${clientId}:`, error);
      deadClients.add(clientId); // 壊れたクライアントをマーク
    }
  }
  
  // 壊れたクライアントを削除
  for (const deadClientId of deadClients) {
    sseClients.delete(deadClientId);
    console.log(`🗑️ Removed dead client ${deadClientId}`);
  }
  
  console.log('📡 Successfully notified', sseClients.size, 'SSE clients (removed', deadClients.size, 'dead clients)');
} 