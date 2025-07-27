import { NextRequest } from "next/server";
import { addSSEClient, removeSSEClient } from "../transcribe-realtime/route";

// Server-Sent Events (SSE) ストリーム接続
export async function GET(request: NextRequest) {
  try {
    console.log('🎯 SSE stream connection requested');
    
    let streamController: ReadableStreamDefaultController | null = null;
    
    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
        
        // SSEクライアントをグローバル管理に追加
        addSSEClient(controller);
        
        // 接続確認メッセージ
        const encoder = new TextEncoder();
        const welcomeData = encoder.encode('data: {"connected": true, "message": "SSE connection established"}\n\n');
        controller.enqueue(welcomeData);
        
        console.log('✅ SSE client connected');
      },
      cancel() {
        // クライアント切断時のクリーンアップ
        console.log('🔌 SSE client disconnected');
        if (streamController) {
          removeSSEClient(streamController);
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
    console.error("SSE stream error:", error);
    return Response.json(
      { 
        error: "SSE stream failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
} 