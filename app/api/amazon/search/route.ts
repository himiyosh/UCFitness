import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { searchProducts, generateAffiliateLink, type SearchCategory } from '@/lib/amazon-paapi';

export const dynamic = 'force-dynamic';

// ============================================
// Amazon 商品検索 API Route
// POST /api/amazon/search
// ============================================

interface SearchRequest {
    keywords?: string;
    category?: SearchCategory;
    asinOrUrl?: string;  // 直接リンク生成用
    itemCount?: number;
}

export async function POST(request: Request) {
    // 認証チェック
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body: SearchRequest = await request.json();

        // --- モード1: ASIN/URL から直接アフィリエイトリンク生成 ---
        if (body.asinOrUrl) {
            const affiliateLink = generateAffiliateLink(body.asinOrUrl);
            return NextResponse.json({ affiliateLink });
        }

        // --- モード2: キーワード検索 ---
        if (!body.keywords || body.keywords.trim().length === 0) {
            return NextResponse.json(
                { error: 'keywords または asinOrUrl が必要です' },
                { status: 400 }
            );
        }

        const result = await searchProducts(
            body.keywords.trim(),
            body.category || 'All',
            body.itemCount || 10
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('[API] Amazon 検索エラー:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `商品検索に失敗しました: ${message}` },
            { status: 500 }
        );
    }
}
