import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { getGroupRankings, getRankings } from '@/lib/services/ranking-service';
import { enrichRankingsWithEquip } from '@/lib/services/ranking-utils';
import { supabaseAdmin } from '@/lib/supabase';

import type { Period } from '@/components/dashboard/LeaderboardTabs';

function hasMembership(value: unknown): boolean {
    if (!value || typeof value !== 'object' || !('group_members' in value)) {
        return false;
    }

    const memberships = value.group_members;
    return Array.isArray(memberships) && memberships.length > 0;
}

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
        let authorizedGroupId: string | null = null;
        if (scope === 'GROUP') {
            const { data: group, error: groupError } = await supabaseAdmin
                .from('groups')
                .select('id, is_public, group_members!left(user_id)')
                .eq('keyword', keyword)
                .eq('group_members.user_id', session.user.id)
                .maybeSingle();

            if (groupError) throw groupError;
            if (!group) {
                return NextResponse.json({ error: 'Group not found' }, { status: 404 });
            }

            if (!hasMembership(group)) {
                const status = group.is_public ? 403 : 404;
                const error = group.is_public ? 'Forbidden' : 'Group not found';
                return NextResponse.json({ error }, { status });
            }
            authorizedGroupId = group.id;
        }

        const rankings = authorizedGroupId
            ? await getGroupRankings(authorizedGroupId, period as Period)
            : await getRankings('GLOBAL', period as Period);

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
