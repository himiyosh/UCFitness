import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateAffiliateLink } from '@/lib/amazon-creators-api';

export const dynamic = 'force-dynamic';

// ============================================
// Amazon アフィリエイトリンク生成 API Route
// POST /api/amazon/search
// ※ Creators API の利用資格（30日以内に10件の売上）を
//   満たしていないため、現在はリンク生成のみ。
//   資格取得後に商品検索機能を有効化可能。
// ============================================

interface GenerateRequest {
    input: string;        // キーワード / ASIN / Amazon URL
    category?: string;    // 検索カテゴリ（キーワード検索時のみ有効）
}

export async function POST(request: Request) {
    // 認証チェック
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body: GenerateRequest = await request.json();

        if (!body.input || body.input.trim().length === 0) {
            return NextResponse.json(
                { error: 'input が必要です' },
                { status: 400 }
            );
        }

        const result = generateAffiliateLink(body.input.trim(), body.category);
        return NextResponse.json(result);
    } catch (error) {
        console.error('[API] アフィリエイトリンク生成エラー:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `リンク生成に失敗しました: ${message}` },
            { status: 500 }
        );
    }
}
