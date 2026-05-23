import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { generateAffiliateLink, searchProductCandidates, detectInputType } from '@/lib/api/amazon-creators-api';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// ============================================
// Amazon アフィリエイトリンク生成 API Route
// POST /api/amazon/search
// ※ Creators API の利用資格（30日以内に10件の売上）を
//   満たしていないため、リンク生成 + 商品候補抽出で対応。
//   資格取得後にフル検索機能を有効化可能。
// ============================================

interface GenerateRequest {
    input: string;        // キーワード / ASIN / Amazon URL
    category?: string;    // 検索カテゴリ（キーワード検索時のみ有効）
    withCandidates?: boolean; // キーワード検索時に商品候補画像を取得
}

export async function POST(request: Request) {
    // 認証チェック
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimit = checkRateLimit(`amazon-search:${session.user.id}`, 20, 60_000);
    if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit.retryAfterSeconds);
    }

    try {
        const body: GenerateRequest = await request.json();

        if (!body.input || body.input.trim().length === 0) {
            return NextResponse.json(
                { error: 'input が必要です' },
                { status: 400 }
            );
        }

        const input = body.input.trim();
        const result = generateAffiliateLink(input, body.category);

        // キーワード検索 & 候補要求時: 商品候補を取得
        if (body.withCandidates && detectInputType(input) === 'search') {
            const candidates = await searchProductCandidates(input, body.category);
            return NextResponse.json({ ...result, candidates });
        }

        return NextResponse.json(result);
    } catch (error: unknown) {
        reportError('amazon/search', error);
        return NextResponse.json(
            { error: 'リンク生成に失敗しました' },
            { status: 500 }
        );
    }
}
