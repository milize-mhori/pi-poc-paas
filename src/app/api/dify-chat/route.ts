import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log('🤖 Dify chat request received');
    
    const { message, conversation_id } = await request.json();
    
    if (!message?.trim()) {
      return Response.json({ error: "No message provided" }, { status: 400 });
    }

    // Dify API設定の確認
    const difyApiKey = process.env.DIFY_API_KEY;
    const difyBaseUrl = process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1';
    
    if (!difyApiKey) {
      return Response.json(
        { error: "Dify API key not configured" },
        { status: 500 }
      );
    }

    console.log('📤 Sending to Dify:', message);

    // Dify Chat Messages API 呼び出し
    const difyResponse = await fetch(`${difyBaseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {},
        query: message,
        response_mode: 'blocking',
        conversation_id: conversation_id || undefined,
        user: 'transcribe-user'
      }),
    });

    if (!difyResponse.ok) {
      const errorText = await difyResponse.text();
      console.error('❌ Dify API error:', difyResponse.status, errorText);
      return Response.json(
        { error: `Dify API error: ${difyResponse.status}` },
        { status: difyResponse.status }
      );
    }

    const difyResult = await difyResponse.json();
    console.log('📥 Dify response received:', difyResult.answer?.substring(0, 100) + '...');

    return Response.json({
      answer: difyResult.answer,
      conversation_id: difyResult.conversation_id,
      message_id: difyResult.message_id,
      usage: difyResult.metadata?.usage,
    });
    
  } catch (error) {
    console.error("❌ Dify chat error:", error);
    return Response.json(
      { 
        error: "Dify chat failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
} 