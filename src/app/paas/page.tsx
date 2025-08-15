'use client';

import { useState, useRef, useEffect } from 'react';
import ReceptionNumberSelector from '@/components/ReceptionNumberSelector';

interface ChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface PaaSData {
  receptionNumber: string;
  troubleContent: string;
  arrangementType: string;
}

export default function PaaSPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [selectedAction, setSelectedAction] = useState('');
  
  // チャット関連のstate
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Difyの入力フィールド
  const [receptionNumberInput, setReceptionNumberInput] = useState('');
  const [classificationInput, setClassificationInput] = useState('');
  
  // 会話状態管理
  const [isChatActive, setIsChatActive] = useState(false);

  // TTS関連のstate
  const [isTTSEnabled, setIsTTSEnabled] = useState(true); // 自動読み上げのON/OFF
  const [isSpeaking, setIsSpeaking] = useState(false); // 現在読み上げ中かどうか
  const [speechInstance, setSpeechInstance] = useState<SpeechSynthesis | null>(null);
  const [showTTSSettings, setShowTTSSettings] = useState(false); // 設定パネルの表示状態
  
  // TTS設定パラメータ
  const [ttsSettings, setTtsSettings] = useState({
    rate: 3.5,    // 読み上げ速度 (0.1 - 5) デフォルトを3.5倍速に
    pitch: 1.0,   // 音の高さ (0 - 2)
    volume: 0.8   // 音量 (0 - 1)
  });

  // 受付情報 - 新しいセレクター用
  const [selectedReception, setSelectedReception] = useState<PaaSData | null>({
    receptionNumber: 'SO-2503-30012',
    troubleContent: 'バッテリー',
    arrangementType: 'ジャンピング'
  });

  // 後方互換性のための受付情報
  const receptionInfo = selectedReception || {
    receptionNumber: 'SO-2503-30012',
    troubleContent: 'バッテリー',
    arrangementType: 'ジャンピング'
  };

  // 受付番号が変更されたときにDifyの入力フィールドも更新
  useEffect(() => {
    if (selectedReception) {
      setReceptionNumberInput(selectedReception.receptionNumber);
    }
  }, [selectedReception]);

  // TTS初期化
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSpeechInstance(window.speechSynthesis);
    }
  }, []);

  // TTS機能：テキストを音声で読み上げ
  const speakText = (text: string) => {
    if (!speechInstance || !text.trim()) return;

    // 既に読み上げ中の場合は停止
    speechInstance.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 日本語設定と動的パラメータ
    utterance.lang = 'ja-JP';
    utterance.rate = ttsSettings.rate;     // 読み上げ速度
    utterance.pitch = ttsSettings.pitch;   // 音の高さ
    utterance.volume = ttsSettings.volume; // 音量

    // イベントリスナー
    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      console.error('TTS Error:', event);
      setIsSpeaking(false);
    };

    speechInstance.speak(utterance);
  };

  // TTS停止
  const stopSpeaking = () => {
    if (speechInstance) {
      speechInstance.cancel();
      setIsSpeaking(false);
    }
  };

  // TTS切り替え
  const toggleTTS = () => {
    setIsTTSEnabled(!isTTSEnabled);
    if (isSpeaking) {
      stopSpeaking();
    }
  };

  // オペレータ発信ボタンの種類
  const operatorButtons = [
    '🚫 お客様不在',
    '⚠️ 作業不可',
    '🔄 作業変更',
    '💰 料金相談',
    '🏍️ 二輪脱輪作業前',
    '📞 お客様連絡不可'
  ];

  // 分類オプション（Difyワークフローと完全一致）
  const classificationOptions = [
    'お客様不在',
    '作業不可', 
    '作業変更',
    '料金相談',
    '二輪脱輪作業前',
    'お客様連絡不可'
  ];

  // チャットメッセージを自動スクロール
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleButtonClick = (buttonTitle: string) => {
    setSelectedAction(buttonTitle);
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setSelectedAction('');
  };



  

  // SSEストリーミングレスポンス処理
  const processStreamingResponse = async (response: Response, botMessageId: string) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader available');
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let done = false;
    let completeMessage = ''; // 完全なメッセージを蓄積

    try {
      while (!done) {
        const { value, done: readDone } = await reader.read();
        if (readDone) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        // イベント区切り用のブロックごとに処理
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') { done = true; break; }
              try {
                const data = JSON.parse(jsonStr);
                console.log('📥 Received streaming data:', { 
                  event: data.event, 
                  answer_length: data.answer?.length || 0,
                  answer_content: data.answer || ''
                });

                // メッセージ更新 - Difyから受信したanswerをそのまま追加
                if (data.answer !== undefined && data.answer !== '') {
                  completeMessage += data.answer; // 完全なメッセージを蓄積
                  setChatMessages(prev =>
                    prev.map(msg =>
                      msg.id === botMessageId
                        ? { ...msg, content: msg.content + data.answer }
                        : msg
                    )
                  );
                }
                // 会話ID更新
                if (data.conversation_id) {
                  setConversationId(data.conversation_id);
                }
              } catch (parseError) {
                console.warn('JSON parse error:', parseError, 'Raw data:', jsonStr);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      console.log('🔚 Streaming completed');
      
      // ストリーミング完了後、自動読み上げが有効な場合は読み上げを開始
      if (isTTSEnabled && completeMessage.trim()) {
        setTimeout(() => {
          speakText(completeMessage);
        }, 500); // 少し待ってから読み上げ開始
      }
    }
  };

  // Difyチャット送信
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputMessage,
      isUser: true,
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // ボット用空メッセージ
    const botMessageId = (Date.now() + 1).toString();
    const botMessage: ChatMessage = {
      id: botMessageId,
      content: '',
      isUser: false,
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, botMessage]);

    const validClassification = classificationOptions.includes(classificationInput) ? classificationInput : '';
    const inputs = {
      reception_number: receptionNumberInput || receptionInfo.receptionNumber,
      classification: validClassification,
    };

    try {
      const response = await fetch('/api/dify-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMessage, conversation_id: conversationId, inputs }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      // SSEストリーム処理
      await processStreamingResponse(response, botMessageId);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: botMessageId,
        content: 'メッセージの送信に失敗しました。',
        isUser: false,
        timestamp: new Date(),
      };
      setChatMessages(prev => prev.map(msg => msg.id === botMessageId ? errorMessage : msg));
    } finally {
      setIsLoading(false);
    }
  };

  // エンターキーでメッセージ送信
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ボタンテキストから分類への変換マッピング
  const buttonToClassificationMap: { [key: string]: string } = {
    'お客様不在': 'お客様不在',
    '作業不可': '作業不可',
    '作業変更': '作業変更', 
    '料金相談': '料金相談',
    '二輪脱輪作業前': '二輪脱輪作業前',
    'お客様連絡不可': 'お客様連絡不可'
  };

  // オペレータ発信でチャットに自動メッセージ送信
  const handleOperatorCall = async (action: string) => {
    // 絵文字とスペースを完全に除去
    const cleanAction = action
      .replace(/[🚫⚠️🔄💰🏍️📞]/g, '') // 絵文字を除去
      .replace(/[\uD800-\uDFFF]/g, '') // サロゲートペア文字を除去
      .replace(/\uFE0F/g, '') // バリエーションセレクタを除去
      .trim(); // 前後のスペースを除去
    
    // 分類マッピングから正確な値を取得
    const classificationValue = buttonToClassificationMap[cleanAction] || cleanAction;
    
    // メッセージ作成時に絵文字を含めない（APIエラーを防ぐため）
    const message = `受付番号：${receptionNumberInput || receptionInfo.receptionNumber}、分類：${classificationValue}`;
    
    // 表示用メッセージ（絵文字あり）
    const displayMessage = `📞 ${message}`;
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: displayMessage,
      isUser: true,
      timestamp: new Date()
    };

    // 新しい会話を開始：チャット履歴をクリアし、conversation_idをリセット
    setChatMessages([userMessage]);
    setConversationId(null);
    setIsChatActive(true); // チャットをアクティブ化
    setIsLoading(true);

    // ボット用空メッセージ
    const botMessageId = (Date.now() + 1).toString();
    const botMessage: ChatMessage = {
      id: botMessageId,
      content: '',
      isUser: false,
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, botMessage]);

    // 選択された分類を完全にサニタイズ
    const sanitizedClassification = classificationValue
      .replace(/[🚫⚠️🔄💰🏍️📞]/g, '') // 絵文字を除去
      .replace(/[\uD800-\uDFFF]/g, '') // サロゲートペア文字を除去
      .replace(/\uFE0F/g, '') // バリエーションセレクタを除去
      .trim(); // 前後のスペースを除去
    
    setClassificationInput(sanitizedClassification);

    // Difyの入力フィールドの値を設定
    const inputs = {
      reception_number: receptionNumberInput || receptionInfo.receptionNumber,
      classification: sanitizedClassification
    };

    console.log('🔍 Debug classification:', {
      original: action,
      cleaned: cleanAction,
      mapped: classificationValue,
      sanitized: sanitizedClassification,
      inputs: inputs
    });

    try {
      const response = await fetch('/api/dify-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message, // 絵文字を含まないクリーンなメッセージをAPIに送信
          conversation_id: null, // ボタンからは新しい会話として送信
          inputs: inputs
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // SSEストリーム処理
      await processStreamingResponse(response, botMessageId);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: botMessageId,
        content: 'メッセージの送信に失敗しました。もう一度お試しください。',
        isUser: false,
        timestamp: new Date()
      };
      setChatMessages(prev => prev.map(msg => msg.id === botMessageId ? errorMessage : msg));
    } finally {
      setIsLoading(false);
    }

    closeDialog();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col lg:flex-row">
      {/* 左側：スマホ風縦長表示 */}
      <div className="w-full lg:w-1/2 p-4 flex justify-center">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border-8 border-gray-800 relative" style={{ aspectRatio: '9/16', maxHeight: '80vh' }}>
          {/* スマホの画面内容 */}
          <div className="h-full bg-gradient-to-b from-blue-50 to-blue-100 p-4 overflow-y-auto">
            {/* ヘッダー */}
            <div className="bg-white rounded-lg shadow-md p-3 mb-4">
              <h1 className="text-lg font-bold text-gray-800 text-center mb-3">
                📱 オペレータ通話システム
              </h1>
              
              {/* 受付番号セレクター */}
              <div className="space-y-3">
                <div>
                  <label className="text-gray-600 text-sm font-medium block mb-1">受付番号:</label>
                  <ReceptionNumberSelector
                    selectedReception={selectedReception}
                    onSelectionChange={setSelectedReception}
                  />
                </div>
                
                {selectedReception && (
                  <>
                    <div className="flex justify-between items-center border-b pb-1">
                      <span className="text-gray-600 text-sm font-medium">トラブル内容:</span>
                      <span className="text-red-600 font-bold text-sm">{selectedReception.troubleContent}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm font-medium">手配区分:</span>
                      <span className="text-green-600 font-bold text-sm">{selectedReception.arrangementType}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* オペレータ発信ボタン */}
            <div className="bg-white rounded-lg shadow-md p-3">
              <h2 className="text-base font-bold text-gray-800 mb-3 text-center">
                📞 オペレータ発信
              </h2>
              
              <div className="grid grid-cols-1 gap-2">
                {operatorButtons.map((buttonTitle, index) => (
                  <button
                    key={index}
                    onClick={() => handleButtonClick(buttonTitle)}
                    className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-lg shadow-lg transform transition duration-200 hover:scale-105 active:scale-95 text-sm"
                  >
                    {buttonTitle}
                  </button>
                ))}
              </div>
            </div>



            {/* フッター */}
            <div className="text-center mt-4 text-gray-500 text-xs">
              <p>PaaS Demo System v1.0</p>
              <p>© 2024 Road Service Platform</p>
            </div>
          </div>

          {/* スマホ画面内モーダル */}
          {showDialog && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 rounded-3xl">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-xs p-4">
                <h3 className="text-base font-bold text-gray-800 mb-3 text-center">
                  発信確認
                </h3>
                
                <div className="text-center mb-4">
                  <p className="text-gray-600 mb-3 text-sm">以下の件でAIアシスタントに問い合わせします：</p>
                  
                  {/* 受付情報 */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-3 text-left">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-xs">受付番号:</span>
                        <span className="text-blue-600 font-bold text-xs">{receptionInfo.receptionNumber}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-xs">トラブル内容:</span>
                        <span className="text-red-600 font-bold text-xs">{receptionInfo.troubleContent}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-xs">手配区分:</span>
                        <span className="text-green-600 font-bold text-xs">{receptionInfo.arrangementType}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* 発信理由 */}
                  <div className="bg-blue-50 rounded-lg p-2">
                    <p className="text-blue-800 font-bold text-sm">{selectedAction}</p>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleOperatorCall(selectedAction)}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg transition duration-200 text-sm"
                    disabled={isLoading}
                  >
                    問い合わせ
                  </button>
                  
                  <button
                    onClick={closeDialog}
                    className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition duration-200 text-sm"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右側：チャットエリア */}
      <div className="w-full lg:w-1/2 p-4 bg-white">
        <div className="h-full max-h-screen flex flex-col">
          {/* チャットヘッダー */}
          <div className="bg-blue-600 text-white p-4 rounded-t-lg flex-shrink-0">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center">
                  Dify AI アシスタント
                </h2>
                <p className="text-blue-100 text-sm mt-1">
                  ロードサービス初回対応システム
                </p>
              </div>
              
              {/* TTS設定コントロール */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleTTS}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                    isTTSEnabled 
                      ? 'bg-green-500 hover:bg-green-600 text-white' 
                      : 'bg-gray-500 hover:bg-gray-600 text-white'
                  }`}
                  title={isTTSEnabled ? '自動読み上げON' : '自動読み上げOFF'}
                >
                  🔊 {isTTSEnabled ? 'ON' : 'OFF'}
                </button>
                
                <button
                  onClick={() => setShowTTSSettings(!showTTSSettings)}
                  className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-full text-xs font-medium transition-all duration-200"
                  title="音声設定"
                >
                  ⚙️ 設定
                </button>
                
                {isSpeaking && (
                  <button
                    onClick={stopSpeaking}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-medium transition-all duration-200"
                    title="読み上げ停止"
                  >
                    ⏹️ 停止
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TTS設定パネル */}
          {showTTSSettings && (
            <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">🔊 音声読み上げ設定</h3>
                
                {/* 読み上げ速度 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    読み上げ速度: {ttsSettings.rate}x
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={ttsSettings.rate}
                    onChange={(e) => setTtsSettings(prev => ({ ...prev, rate: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>遅い (0.1x)</span>
                    <span>標準 (3.5x)</span>
                    <span>超高速 (5.0x)</span>
                  </div>
                </div>

                {/* 音の高さ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    音の高さ: {ttsSettings.pitch}
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={ttsSettings.pitch}
                    onChange={(e) => setTtsSettings(prev => ({ ...prev, pitch: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>低い (0.1)</span>
                    <span>標準 (1.0)</span>
                    <span>高い (2.0)</span>
                  </div>
                </div>

                {/* 音量 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    音量: {Math.round(ttsSettings.volume * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={ttsSettings.volume}
                    onChange={(e) => setTtsSettings(prev => ({ ...prev, volume: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>10%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* テスト読み上げボタン */}
                <div className="flex space-x-2 pt-2">
                  <button
                    onClick={() => speakText('これは音声設定のテストです。この設定で読み上げします。')}
                    disabled={isSpeaking}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-all duration-200"
                  >
                    🎵 テスト読み上げ
                  </button>
                  
                  <button
                    onClick={() => setTtsSettings({ rate: 3.5, pitch: 1.0, volume: 0.8 })}
                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-all duration-200"
                  >
                    🔄 デフォルトに戻す
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* チャットメッセージエリア */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4 min-h-0">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.isUser
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-800 shadow-md'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  
                  {/* タイムスタンプとTTSボタン */}
                  <div className={`flex items-center justify-between mt-1 ${
                    message.isUser ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    <p className="text-xs">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                    
                    {/* AIメッセージの場合、読み上げボタンを表示 */}
                    {!message.isUser && message.content.trim() && (
                      <button
                        onClick={() => speakText(message.content)}
                        disabled={isSpeaking}
                        className={`ml-2 px-2 py-1 rounded text-xs transition-all duration-200 ${
                          isSpeaking 
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                            : 'bg-blue-100 hover:bg-blue-200 text-blue-600 hover:text-blue-800'
                        }`}
                        title="このメッセージを読み上げ"
                      >
                        🔊
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-800 shadow-md max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-sm text-gray-600">AIが応答中...</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* 読み上げ中の表示 */}
            {isSpeaking && !isLoading && (
              <div className="flex justify-start">
                <div className="bg-green-100 text-green-800 shadow-md max-w-xs lg:max-w-md px-4 py-2 rounded-lg border-l-4 border-green-500">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                    <span className="text-sm font-medium">🔊 読み上げ中...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* チャット入力エリア */}
          <div className="border-t bg-white p-4 flex-shrink-0">
            <div className="flex space-x-2 mb-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isChatActive ? "メッセージを入力してください..." : "左側のボタンを押して会話を開始してください"}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                disabled={isLoading || !isChatActive}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputMessage.trim() || !isChatActive}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition duration-200"
              >
                送信
              </button>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>ボタン：新しい会話開始 | 入力：現在の会話継続</span>
              <button
                onClick={() => {
                  setChatMessages([]);
                  setConversationId(null);
                  setIsChatActive(false);
                }}
                className="text-blue-600 hover:text-blue-800"
              >
                チャットをクリア
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 