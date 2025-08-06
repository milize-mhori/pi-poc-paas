import { NextRequest } from "next/server";

// メッセージのサニタイズ関数
function sanitizeMessage(text: string): string {
  // サロゲートペアや問題のある文字を除去
  return text
    .replace(/[\uD800-\uDFFF]/g, '') // サロゲートペア文字を除去
    .replace(/[^\u0000-\uFFFF]/g, '') // BMP外の文字を除去
    .replace(/🚫|⚠️|🔄|💰|🏍️|📞|🤖|📱|🟢|❌|📝|👋|📤|📥/g, '') // 特定の絵文字を除去
    .trim();
}

// inputsオブジェクトのサニタイズ関数
function sanitizeInputs(inputs: any): any {
  if (!inputs || typeof inputs !== 'object') {
    return inputs;
  }
  
  const sanitizedInputs: any = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'string') {
      sanitizedInputs[key] = sanitizeMessage(value);
    } else {
      sanitizedInputs[key] = value;
    }
  }
  return sanitizedInputs;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🤖 Dify chat request received');
    
    const { message, conversation_id, inputs } = await request.json();
    
    if (!message?.trim()) {
      return Response.json({ error: "No message provided" }, { status: 400 });
    }

    // Dify API設定の確認
    const difyApiKey = process.env.DIFY_API_KEY || 'app-y1vqYcKO48nPngCE9EsoUohA';
    const difyBaseUrl = process.env.DIFY_BASE_URL || 'http://localhost:8080/v1';
    
    if (!difyApiKey) {
      return Response.json(
        { error: "Dify API key not configured" },
        { status: 500 }
      );
    }

    // メッセージとinputsをサニタイズ
    const sanitizedMessage = sanitizeMessage(message);
    const sanitizedInputs = sanitizeInputs(inputs);
    console.log('📤 Sending to Dify:', sanitizedMessage);
    console.log('📝 Sanitized Inputs:', JSON.stringify(sanitizedInputs, null, 2));

    // Dify Chat Messages API 呼び出し
    const difyResponse = await fetch(`${difyBaseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: sanitizedInputs || {},
        query: sanitizedMessage,
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