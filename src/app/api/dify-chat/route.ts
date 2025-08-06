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
    console.log('📤 Sending to Dify (streaming):', sanitizedMessage);
    console.log('📝 Sanitized Inputs:', JSON.stringify(sanitizedInputs, null, 2));

    // Dify Chat Messages API 呼び出し（ストリーミングモード）
    const difyResponse = await fetch(`${difyBaseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: sanitizedInputs || {},
        query: sanitizedMessage,
        response_mode: 'streaming',
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

    // SSEレスポンスを返す
    const readable = new ReadableStream({
      start(controller) {
        const reader = difyResponse.body?.getReader();
        if (!reader) {
          console.error('❌ No reader available from Dify response');
          controller.close();
          return;
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            if (done) {
              console.log('🔚 Dify streaming completed');
              controller.close();
              return;
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // イベント区切りで処理
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
              const event = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);

              if (event.trim()) {
                console.log('📥 Raw Dify data:', event);
                
                // data行を解析
                const lines = event.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6).trim();
                    if (jsonStr !== '[DONE]') {
                      try {
                        const data = JSON.parse(jsonStr);
                        console.log('📊 Parsed Dify data:', {
                          event: data.event,
                          answer_length: data.answer?.length || 0,
                          answer_sample: data.answer?.substring(0, 100) || '',
                          conversation_id: data.conversation_id,
                          message_id: data.message_id
                        });
                      } catch (parseError) {
                        console.warn('⚠️ JSON parse error:', parseError, 'Data:', jsonStr);
                      }
                    }
                  }
                }
              }

              // クライアントに転送
              controller.enqueue(new TextEncoder().encode(event + '\n\n'));
            }

            return pump();
          });
        }

        return pump().catch(error => {
          console.error('❌ Streaming error:', error);
          controller.error(error);
        });
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
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