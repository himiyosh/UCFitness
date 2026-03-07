import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getRankings } from '@/lib/services/ranking-service';
import { enrichRankingsWithEquip } from '@/lib/services/ranking-utils';
import { reportError } from '@/lib/errors';
import { Period } from '@/components/dashboard/LeaderboardTabs';

export async function GET(request: Request) {
    // 🛡️ セキュリティ: 認証チェック（ランキングデータは認証ユーザーのみアクセス可能）
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');
    const period = searchParams.get('period');
    const keyword = searchParams.get('keyword') || undefined;

    // 🛡️ セキュリティ: 入力値バリデーション
    const validScopes = ['GLOBAL', 'GROUP'];
    const validPeriods: Period[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

    if (!scope || !validScopes.includes(scope)) {
        return NextResponse.json({ error: 'Invalid scope parameter' }, { status: 400 });
    }
    if (!period || !validPeriods.includes(period as Period)) {
        return NextResponse.json({ error: 'Invalid period parameter' }, { status: 400 });
    }

    try {
        const rankings = await getRankings(scope as 'GLOBAL' | 'GROUP', period as Period, keyword);

        // enrichRankingsWithEquip は Record<string, RankingEntry[]> を期待するため
        // 単一期間の配列をラップして渡し、結果をアンラップする
        const wrapped = { [period]: rankings };
        const enriched = await enrichRankingsWithEquip(wrapped);

        return NextResponse.json(enriched[period]);
    } catch (error: unknown) {
        reportError('rankings', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
