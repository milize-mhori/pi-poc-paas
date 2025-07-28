import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log('🎯 Streaming voice chat request received');
    
    const { message, conversation_id, voiceId = "Takumi", autoTTS = true } = await request.json();
    
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

    console.log('💬 User message:', message);

    // Server-Sent Events でストリーミング
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          // Dify ストリーミングAPI呼び出し
          const difyResponse = await fetch(`${difyBaseUrl}/chat-messages`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${difyApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inputs: {},
              query: message,
              response_mode: 'streaming', // ストリーミングモード
              conversation_id: conversation_id || undefined,
              user: 'transcribe-user'
            }),
          });

          if (!difyResponse.ok) {
            throw new Error(`Dify API error: ${difyResponse.status}`);
          }

          const reader = difyResponse.body?.getReader();
          if (!reader) throw new Error('No response stream');

          let fullText = '';
          let sentenceBuffer = '';
          let sentenceCount = 0;
          
          console.log('🔄 Processing Dify streaming response...');

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              // SSEデータをパース
              const chunk = new TextDecoder().decode(value);
              const lines = chunk.split('\n').filter(line => line.trim());
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.event === 'message') {
                      const newText = data.answer || '';
                      if (newText) {
                        fullText += newText;
                        sentenceBuffer += newText;
                        
                        console.log('📝 New text chunk:', newText);
                        
                        // 部分テキストを送信（表示用）
                        const partialData = {
                          type: 'partial_text',
                          text: newText,
                          fullText: fullText,
                          timestamp: new Date().toISOString()
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(partialData)}\n\n`));
                        
                        // 文の区切りを検出
                        if (isSentenceEnd(sentenceBuffer)) {
                          const sentence = sentenceBuffer.trim();
                          console.log('🎯 Sentence completed:', sentence);
                          
                          // TTSで音声化（autoTTSが有効な場合）
                          let audioBase64 = null;
                          if (autoTTS && sentence) {
                            audioBase64 = await generateTTS(sentence, voiceId);
                          }
                          
                          // 完成した文を送信
                          const sentenceData = {
                            type: 'sentence_complete',
                            text: sentence,
                            audio: audioBase64,
                            sentenceIndex: sentenceCount++,
                            timestamp: new Date().toISOString()
                          };
                          
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify(sentenceData)}\n\n`));
                          
                          sentenceBuffer = ''; // バッファクリア
                        }
                      }
                    } else if (data.event === 'message_end') {
                      console.log('📄 Message completed');
                      
                      // 残りのテキストを処理
                      if (sentenceBuffer.trim()) {
                        const finalSentence = sentenceBuffer.trim();
                        console.log('🎯 Final sentence:', finalSentence);
                        
                        let audioBase64 = null;
                        if (autoTTS && finalSentence) {
                          audioBase64 = await generateTTS(finalSentence, voiceId);
                        }
                        
                        const finalData = {
                          type: 'final_complete',
                          text: finalSentence,
                          audio: audioBase64,
                          sentenceIndex: sentenceCount++,
                          fullText: fullText,
                          conversation_id: data.conversation_id,
                          message_id: data.message_id,
                          timestamp: new Date().toISOString()
                        };
                        
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));
                      }
                      
                      // ストリーミング終了
                      const endData = {
                        type: 'stream_end',
                        fullText: fullText,
                        totalSentences: sentenceCount,
                        timestamp: new Date().toISOString()
                      };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(endData)}\n\n`));
                      break;
                    }
                  } catch (parseError) {
                    console.warn('⚠️ Failed to parse Dify response line:', line);
                  }
                }
              }
            }
            
          } finally {
            reader.releaseLock();
          }
          
        } catch (error) {
          console.error('❌ Streaming error:', error);
          const errorData = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });
    
  } catch (error) {
    console.error("❌ Voice chat streaming error:", error);
    return Response.json(
      { 
        error: "Voice chat streaming failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// 文の終わりを検出
function isSentenceEnd(text: string): boolean {
  // 日本語と英語の文末記号を検出
  const sentenceEnders = /[。！？．!?]\s*$/;
  const cleanText = text.trim();
  
  // 短すぎるテキストは無視
  if (cleanText.length < 3) return false;
  
  return sentenceEnders.test(cleanText);
}

// TTS生成（最適化版）
async function generateTTS(text: string, voiceId: string): Promise<string | null> {
  try {
    // テキストが短すぎる場合はスキップ
    if (text.trim().length < 2) return null;
    
    console.log('🔊 Generating TTS for:', text.substring(0, 50) + '...');
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text: text.trim(), 
        voiceId: voiceId,
        speed: 'medium'
      })
    });
    
    if (!response.ok) {
      console.warn('⚠️ TTS generation failed:', response.status);
      return null;
    }
    
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    console.log('✅ TTS generated successfully, size:', base64Audio.length, 'characters');
    return base64Audio;
    
  } catch (error) {
    console.error('❌ TTS generation error:', error);
    return null;
  }
} 