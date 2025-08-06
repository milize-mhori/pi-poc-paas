'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
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

  // 受付情報
  const receptionInfo = {
    receptionNumber: 'SO-2503-30012',
    troubleContent: 'バッテリー',
    arrangementType: 'レッカー'
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



  

  // Difyチャット送信
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputMessage,
      isUser: true,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // Difyの入力フィールドの値を設定
    // 分類が有効なオプションかチェック
    const validClassification = classificationOptions.includes(classificationInput) ? classificationInput : '';
    
    const inputs = {
      reception_number: receptionNumberInput || receptionInfo.receptionNumber,
      classification: validClassification
    };

    try {
      const response = await fetch('/api/dify-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          conversation_id: conversationId,
          inputs: inputs
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.answer || 'エラーが発生しました',
        isUser: false,
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: 'メッセージの送信に失敗しました。もう一度お試しください。',
        isUser: false,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
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
    // より厳密に絵文字と余分な文字を除去
    const cleanAction = action
      .replace(/^[🚫⚠️🔄💰🏍️📞]\s*/, '') // 先頭の絵文字とスペースを除去
      .replace(/[\uD800-\uDFFF]/g, '') // サロゲートペア文字を除去
      .trim();
    
    // 分類マッピングから正確な値を取得
    const classificationValue = buttonToClassificationMap[cleanAction] || cleanAction;
    
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

    // 選択された分類を自動で設定（サニタイズ済み）
    const sanitizedClassification = classificationValue
      .replace(/[\uD800-\uDFFF]/g, '') // サロゲートペア文字を除去
      .trim();
    setClassificationInput(sanitizedClassification);

    // Difyの入力フィールドの値を設定
    const inputs = {
      reception_number: receptionNumberInput || receptionInfo.receptionNumber,
      classification: sanitizedClassification
    };

    try {
      const response = await fetch('/api/dify-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          conversation_id: null, // ボタンからは新しい会話として送信
          inputs: inputs
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // ボタンからの会話開始時は新しいconversation_idを保存
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.answer || 'エラーが発生しました',
        isUser: false,
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: 'メッセージの送信に失敗しました。もう一度お試しください。',
        isUser: false,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
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
              
              {/* 受付情報 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center border-b pb-1">
                  <span className="text-gray-600 text-sm font-medium">受付番号:</span>
                  <span className="text-blue-600 font-bold text-sm">{receptionInfo.receptionNumber}</span>
                </div>
                
                <div className="flex justify-between items-center border-b pb-1">
                  <span className="text-gray-600 text-sm font-medium">トラブル内容:</span>
                  <span className="text-red-600 font-bold text-sm">{receptionInfo.troubleContent}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm font-medium">手配区分:</span>
                  <span className="text-green-600 font-bold text-sm">{receptionInfo.arrangementType}</span>
                </div>
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

            {/* 緊急連絡先 */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
              <h3 className="text-red-700 font-bold mb-1 text-sm">🚨 緊急時連絡先</h3>
              <p className="text-red-600 text-xs">
                緊急時は直接お電話ください: <span className="font-bold">0120-XXX-XXX</span>
              </p>
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
        <div className="h-full min-h-[600px] lg:min-h-0 flex flex-col">
          {/* チャットヘッダー */}
          <div className="bg-blue-600 text-white p-4 rounded-t-lg">
            <h2 className="text-xl font-bold flex items-center">
              Dify AI アシスタント
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              ロードサービス初回対応システム
            </p>
          </div>



          {/* チャットメッセージエリア */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4 min-h-0">
                         {chatMessages.length === 0 && (
               <div className="text-center text-gray-500 mt-8">
                 <p className="text-lg mb-2">こんにちは！</p>
                 <p>ロードサービスの対応についてお気軽にお尋ねください。</p>
                 <p className="text-sm mt-2">左側のボタンを押すか、直接メッセージを入力してください。</p>
               </div>
             )}
            
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
                  <p
                    className={`text-xs mt-1 ${
                      message.isUser ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString()}
                  </p>
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
            <div ref={messagesEndRef} />
          </div>

          {/* チャット入力エリア */}
          <div className="border-t bg-white p-4">
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