import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { getRankings } from '@/lib/services/ranking-service';
import { enrichRankingsWithEquip } from '@/lib/services/ranking-utils';
import { supabaseAdmin } from '@/lib/supabase';

import type { Period } from '@/components/dashboard/LeaderboardTabs';

export async function GET(request: Request) {
    // 🛡️ セキュリティ: 認証チェック（ランキングデータは認証ユーザーのみアクセス可能）
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');
    const period = searchParams.get('period');
    const keyword = searchParams.get('keyword')?.trim() || undefined;

    // 🛡️ セキュリティ: 入力値バリデーション
    const validScopes = ['GLOBAL', 'GROUP'];
    const validPeriods: Period[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

    if (!scope || !validScopes.includes(scope)) {
        return NextResponse.json({ error: 'Invalid scope parameter' }, { status: 400 });
    }
    if (!period || !validPeriods.includes(period as Period)) {
        return NextResponse.json({ error: 'Invalid period parameter' }, { status: 400 });
    }
    if (scope === 'GROUP' && (!keyword || !/^[a-zA-Z0-9_-]{3,50}$/.test(keyword))) {
        return NextResponse.json({ error: 'Invalid group keyword' }, { status: 400 });
    }

    try {
        if (scope === 'GROUP') {
            const { data: group, error: groupError } = await supabaseAdmin
                .from('groups')
                .select('id, is_public')
                .eq('keyword', keyword)
                .maybeSingle();

            if (groupError) throw groupError;
            if (!group) {
                return NextResponse.json({ error: 'Group not found' }, { status: 404 });
            }

            const { data: membership, error: membershipError } = await supabaseAdmin
                .from('group_members')
                .select('id')
                .eq('group_id', group.id)
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (membershipError) throw membershipError;
            if (!membership) {
                const status = group.is_public ? 403 : 404;
                const error = group.is_public ? 'Forbidden' : 'Group not found';
                return NextResponse.json({ error }, { status });
            }
        }

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
