import { NextRequest } from "next/server";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from "@aws-sdk/client-transcribe-streaming";
import { PassThrough } from "stream";

// アクティブなセッション管理
const activeSessions = new Map<string, {
  controller: ReadableStreamDefaultController;
  transcribeClient: TranscribeStreamingClient;
  audioStream: PassThrough;
  conversationId?: string;
  isProcessing: boolean;
  textBuffer: string;
  sentenceBuffer: string;
}>();

// SSE接続の処理（音声認識結果をリアルタイムで送信）
export async function GET(request: NextRequest) {
  try {
    console.log('🎯 Real-time voice chat SSE connection requested');
    
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId') || crypto.randomUUID();
    const voiceId = url.searchParams.get('voiceId') || 'Takumi';
    const autoTTS = url.searchParams.get('autoTTS') !== 'false';
    const vocabularyName = url.searchParams.get('vocabularyName') || process.env.AWS_TRANSCRIBE_VOCABULARY_NAME || 'roadservice';
    
    // streamController変数を削除（使用されていないため）
    
    const stream = new ReadableStream({
      start(controller) {
        // streamController変数は削除されたため、直接controllerを使用
        
        console.log(`➕ Real-time session ${sessionId} started`);
        
        // セッション初期化
        const transcribeClient = new TranscribeStreamingClient({
          region: process.env.AWS_REGION || "ap-northeast-1"
        });
        
        // パススルーストリーム作成（音声データ受信用）
        const audioStream = new PassThrough();
        
        activeSessions.set(sessionId, {
          controller,
          transcribeClient,
          audioStream,
          isProcessing: false,
          textBuffer: '',
          sentenceBuffer: ''
        });
        
        // AWS Transcribe ストリーミング開始
        startTranscribeStream(sessionId, voiceId, autoTTS, vocabularyName);
        
        // 接続確認メッセージ
        const encoder = new TextEncoder();
        const welcomeData = encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          sessionId,
          message: 'Real-time voice chat connected'
        })}\n\n`);
        controller.enqueue(welcomeData);
        
        console.log('✅ Real-time voice chat session connected');
      },
      cancel() {
        console.log(`🔌 Real-time session ${sessionId} disconnected`);
        if (activeSessions.has(sessionId)) {
          const session = activeSessions.get(sessionId)!;
          session.audioStream.end();
          activeSessions.delete(sessionId);
          console.log(`➖ Session ${sessionId} cleaned up`);
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
    console.error("❌ Real-time voice chat SSE error:", error);
    return Response.json(
      { 
        error: "Real-time voice chat SSE failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// 音声データ送信（リアルタイム）
export async function POST(request: NextRequest) {
  try {
    const { sessionId, audioChunk, action } = await request.json();
    
    if (!sessionId || !activeSessions.has(sessionId)) {
      return Response.json({ error: "Invalid session" }, { status: 400 });
    }
    
    const session = activeSessions.get(sessionId)!;
    
    if (action === 'stop') {
      // 録音停止
      console.log('🛑 Recording stopped for session:', sessionId);
      session.audioStream.end();
      return Response.json({ success: true });
    }
    
    if (audioChunk) {
      // 音声データをストリームに送信
      const audioBuffer = Buffer.from(audioChunk, "base64");
      session.audioStream.write(audioBuffer);
      console.log('🎤 Audio chunk sent to stream:', audioBuffer.length, 'bytes');
    }
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error("❌ Real-time voice chat POST error:", error);
    return Response.json(
      { 
        error: "Real-time voice chat POST failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// AWS Transcribe ストリーミング開始
async function startTranscribeStream(sessionId: string, voiceId: string, autoTTS: boolean, vocabularyName?: string) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  
  try {
    console.log('🚀 Starting AWS Transcribe stream for session:', sessionId);
    
    // StartStreamTranscriptionCommandのパラメータを構築
    const commandParams: {
      LanguageCode: "ja-JP";
      MediaEncoding: "pcm";
      MediaSampleRateHertz: number;
      AudioStream: AsyncGenerator<AudioStream>;
      VocabularyName?: string;
    } = {
      LanguageCode: "ja-JP" as const,
      MediaEncoding: "pcm" as const,
      MediaSampleRateHertz: 16000,
      AudioStream: (async function* (): AsyncGenerator<AudioStream> {
        // 音声ストリームからデータを読み取り
        for await (const chunk of session.audioStream as AsyncIterable<Buffer>) {
          yield { AudioEvent: { AudioChunk: chunk } };
        }
      })(),
    };

    // カスタムボキャブラリーが指定されている場合は追加
    if (vocabularyName) {
      commandParams.VocabularyName = vocabularyName;
      console.log(`🔤 Using custom vocabulary: ${vocabularyName}`);
    }

    const command = new StartStreamTranscriptionCommand(commandParams);

    const response = await session.transcribeClient.send(command);
    console.log('📨 Transcribe stream established');
    
    // 音声認識結果をリアルタイム処理
    for await (const event of response.TranscriptResultStream as AsyncIterable<{ TranscriptEvent?: { Transcript?: { Results?: Array<{ Alternatives?: Array<{ Transcript?: string }>; IsPartial?: boolean }> } } }>) {
      const results = event.TranscriptEvent?.Transcript?.Results;
      if (!results) continue;
      
      for (const result of results) {
        const text = result.Alternatives?.[0]?.Transcript ?? "";
        const isFinal = !result.IsPartial;
        
        if (text.trim()) {
          console.log('📝 Transcribe result:', text, 'isFinal:', isFinal);
          
          // リアルタイム結果をクライアントに送信
          sendToClient(sessionId, {
            type: 'transcribe_result',
            text,
            isFinal,
            timestamp: new Date().toISOString()
          });
          
          if (isFinal) {
            // 確定された音声認識結果でDifyを呼び出し
            session.sentenceBuffer += text;
            
            // 文の区切りを検出
            if (isSentenceEnd(session.sentenceBuffer)) {
              const sentence = session.sentenceBuffer.trim();
              console.log('🎯 Sentence completed:', sentence);
              
              // Difyに送信（非同期）
              processDifyChat(sessionId, sentence, voiceId, autoTTS);
              
              session.sentenceBuffer = ''; // バッファクリア
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Transcribe stream error:', error);
    sendToClient(sessionId, {
      type: 'error',
      message: 'Transcribe stream failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Dify AI 処理（非同期）
async function processDifyChat(sessionId: string, message: string, voiceId: string, autoTTS: boolean) {
  const session = activeSessions.get(sessionId);
  if (!session || session.isProcessing) return;
  
  session.isProcessing = true;
  
  try {
    console.log('🤖 Processing Dify chat:', message);
    
    const difyApiKey = process.env.DIFY_API_KEY;
    const difyBaseUrl = process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1';
    
    if (!difyApiKey) {
      throw new Error('Dify API key not configured');
    }
    
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
        response_mode: 'streaming',
        conversation_id: session.conversationId || undefined,
        user: 'realtime-user'
      }),
    });

    if (!difyResponse.ok) {
      throw new Error(`Dify API error: ${difyResponse.status}`);
    }

    const reader = difyResponse.body?.getReader();
    if (!reader) throw new Error('No Dify response stream');

    let fullText = '';
    let sentenceBuffer = '';
    let sentenceCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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

                  // 部分テキストを送信
                  sendToClient(sessionId, {
                    type: 'dify_partial',
                    text: newText,
                    fullText: fullText,
                    timestamp: new Date().toISOString()
                  });

                  // 文の区切りを検出
                  if (isSentenceEnd(sentenceBuffer)) {
                    const sentence = sentenceBuffer.trim();
                    console.log('🎯 Dify sentence completed:', sentence);

                    // TTSで音声化
                    if (autoTTS && sentence) {
                      const audioBase64 = await generateTTS(sentence, voiceId);
                      if (audioBase64) {
                        sendToClient(sessionId, {
                          type: 'dify_sentence_complete',
                          text: sentence,
                          audio: audioBase64,
                          sentenceIndex: sentenceCount++,
                          timestamp: new Date().toISOString()
                        });
                      }
                    }

                    sentenceBuffer = '';
                  }
                }
              } else if (data.event === 'message_end') {
                // 残りのテキストを処理
                if (sentenceBuffer.trim()) {
                  const finalSentence = sentenceBuffer.trim();
                  console.log('🎯 Dify final sentence:', finalSentence);

                  if (autoTTS && finalSentence) {
                    const audioBase64 = await generateTTS(finalSentence, voiceId);
                    if (audioBase64) {
                      sendToClient(sessionId, {
                        type: 'dify_final_complete',
                        text: finalSentence,
                        audio: audioBase64,
                        sentenceIndex: sentenceCount++,
                        fullText: fullText,
                        conversation_id: data.conversation_id,
                        message_id: data.message_id,
                        timestamp: new Date().toISOString()
                      });
                    }
                  }
                }

                // 会話IDを保存
                if (data.conversation_id) {
                  session.conversationId = data.conversation_id;
                }
                break;
              }
            } catch {
              console.warn('⚠️ Failed to parse Dify response:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
  } catch (error) {
    console.error('❌ Dify chat error:', error);
    sendToClient(sessionId, {
      type: 'error',
      message: 'Dify chat failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    session.isProcessing = false;
  }
}

// TTS生成
async function generateTTS(text: string, voiceId: string): Promise<string | null> {
  try {
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
    
    console.log('✅ TTS generated successfully');
    return base64Audio;
    
  } catch (error) {
    console.error('❌ TTS generation error:', error);
    return null;
  }
}

// クライアントにデータ送信
function sendToClient(sessionId: string, data: Record<string, unknown>) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  
  try {
    const encoder = new TextEncoder();
    const eventData = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
    session.controller.enqueue(eventData);
  } catch (error) {
    console.error('❌ Failed to send to client:', error);
  }
}

// 文の終わりを検出
function isSentenceEnd(text: string): boolean {
  const sentenceEnders = /[。！？．!?]\s*$/;
  const cleanText = text.trim();
  
  if (cleanText.length < 3) return false;
  
  return sentenceEnders.test(cleanText);
} 