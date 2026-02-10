import { NextResponse } from 'next/server';
import { getRankings } from '@/lib/ranking-service';
import { enrichRankingsWithEquip } from '@/lib/ranking-utils';
import { Period } from '@/components/LeaderboardTabs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') as 'GLOBAL' | 'GROUP';
    const period = searchParams.get('period') as Period;
    const keyword = searchParams.get('keyword') || undefined;

    if (!scope || !period) {
        return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
    }

    try {
        const rankings = await getRankings(scope, period, keyword);

        // enrichRankingsWithEquip は Record<string, RankingEntry[]> を期待するため
        // 単一期間の配列をラップして渡し、結果をアンラップする
        const wrapped = { [period]: rankings };
        const enriched = await enrichRankingsWithEquip(wrapped);

        return NextResponse.json(enriched[period]);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
