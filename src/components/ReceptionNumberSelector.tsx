'use client';

import { useState, useEffect, useRef } from 'react';

interface PaaSData {
  receptionNumber: string;
  troubleContent: string;
  arrangementType: string;
}

interface ReceptionNumberSelectorProps {
  selectedReception: PaaSData | null;
  onSelectionChange: (reception: PaaSData | null) => void;
}

export default function ReceptionNumberSelector({ 
  selectedReception, 
  onSelectionChange 
}: ReceptionNumberSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState<PaaSData[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 検索実行
  const fetchOptions = async (search: string = '', reset: boolean = true) => {
    if (loading) return;
    
    setLoading(true);
    const currentOffset = reset ? 0 : offset;
    
    try {
      const params = new URLSearchParams({
        search,
        limit: '20',
        offset: currentOffset.toString()
      });
      
      const response = await fetch(`/api/paas-data?${params}`);
      const result = await response.json();
      
      if (result.success) {
        if (reset) {
          setOptions(result.data);
          setOffset(result.data.length);
        } else {
          setOptions(prev => [...prev, ...result.data]);
          setOffset(prev => prev + result.data.length);
        }
        setHasMore(result.hasMore);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 検索語句変更時の処理
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchOptions(searchTerm, true);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // 初期データ読み込み
  useEffect(() => {
    if (isOpen && options.length === 0) {
      fetchOptions('', true);
    }
  }, [isOpen]);

  const handleSelect = (reception: PaaSData) => {
    onSelectionChange(reception);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      fetchOptions(searchTerm, false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 選択ボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2 text-left border border-gray-300 rounded-md bg-white hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <div className="flex justify-between items-center">
          <span className={selectedReception ? 'text-gray-900' : 'text-gray-500'}>
            {selectedReception ? selectedReception.receptionNumber : '受付番号を選択してください'}
          </span>
          <svg
            className={`w-5 h-5 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {selectedReception && (
          <div className="text-xs text-gray-600 mt-1">
            {selectedReception.troubleContent} | {selectedReception.arrangementType}
          </div>
        )}
      </button>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-hidden">
          {/* 検索フィールド */}
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              placeholder="受付番号・トラブル内容・手配区分で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* オプションリスト */}
          <div className="overflow-y-auto max-h-64">
            {loading && options.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                読み込み中...
              </div>
            ) : options.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                該当するデータが見つかりません
              </div>
            ) : (
              <>
                {options.map((option, index) => (
                  <button
                    key={`${option.receptionNumber}-${index}`}
                    onClick={() => handleSelect(option)}
                    className="w-full p-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-blue-50"
                  >
                    <div className="font-medium text-gray-900">
                      {option.receptionNumber}
                    </div>
                    <div className="text-sm text-gray-600 flex justify-between mt-1">
                      <span>{option.troubleContent}</span>
                      <span className="text-blue-600">{option.arrangementType}</span>
                    </div>
                  </button>
                ))}
                
                {/* もっと読み込むボタン */}
                {hasMore && (
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="w-full p-3 text-center text-blue-600 hover:bg-blue-50 disabled:text-gray-400 border-t border-gray-200"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
                        読み込み中...
                      </div>
                    ) : (
                      'もっと読み込む'
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 