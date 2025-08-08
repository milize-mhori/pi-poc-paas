import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface PaaSData {
  receptionNumber: string;
  troubleContent: string;
  arrangementType: string;
}

// CSVデータを読み込み、パース済みのデータを返す
function loadPaaSData(): PaaSData[] {
  try {
    const csvPath = path.join(process.cwd(), 'data', 'paas.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    
    const data: PaaSData[] = [];
    // ヘッダー行をスキップして1行目から処理
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const [receptionNumber, troubleContent, arrangementType] = line.split(',');
        if (receptionNumber && troubleContent && arrangementType) {
          data.push({
            receptionNumber: receptionNumber.trim(),
            troubleContent: troubleContent.trim(),
            arrangementType: arrangementType.trim()
          });
        }
      }
    }
    
    return data;
  } catch (error) {
    console.error('CSV読み込みエラー:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const allData = loadPaaSData();
    
    // 検索フィルタリング
    let filteredData = allData;
    if (search) {
      filteredData = allData.filter(item => 
        item.receptionNumber.toLowerCase().includes(search.toLowerCase()) ||
        item.troubleContent.toLowerCase().includes(search.toLowerCase()) ||
        item.arrangementType.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // ページネーション
    const paginatedData = filteredData.slice(offset, offset + limit);
    
    return NextResponse.json({
      success: true,
      data: paginatedData,
      total: filteredData.length,
      totalAll: allData.length,
      offset,
      limit,
      hasMore: offset + limit < filteredData.length
    });
    
  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 特定の受付番号の詳細情報を取得
export async function POST(request: NextRequest) {
  try {
    const { receptionNumber } = await request.json();
    
    if (!receptionNumber) {
      return NextResponse.json(
        { success: false, error: '受付番号が必要です' },
        { status: 400 }
      );
    }
    
    const allData = loadPaaSData();
    const found = allData.find(item => item.receptionNumber === receptionNumber);
    
    if (!found) {
      return NextResponse.json(
        { success: false, error: '受付番号が見つかりません' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: found
    });
    
  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
} 