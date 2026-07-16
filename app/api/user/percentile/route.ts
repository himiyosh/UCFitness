export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCachedGlobalRankingMap } from '@/lib/services/ranking-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/percentile
 * ユーザーの歩数パーセンタイルランク（上位 N%）を返す
 * キャッシュ済みのグローバルランキングマップから O(n) で計算
 */
export async function GET(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const rankingMap = await getCachedGlobalRankingMap();
        const totalUsers = Object.keys(rankingMap).length;

        if (totalUsers === 0) {
            return NextResponse.json({
                percentile: { daily: null, weekly: null, monthly: null },
                totalUsers: 0,
            });
        }

        // 各期間で現在ユーザーより歩数が多い人数を数えて順位を計算
        const periods = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
        const periodKeys = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' } as const;
        const rankingStats = Object.values(rankingMap);

        const percentile: Record<string, number | null> = {
            daily: null,
            weekly: null,
            monthly: null,
        };

        for (const period of periods) {
            const userSteps = rankingMap[userId]?.[period];
            if (userSteps === undefined || userSteps === 0) {
                percentile[periodKeys[period]] = null;
            } else {
                // 厳密に大きい値だけを数え、同歩数は格納順に依存せず同順位とする。
                let usersAhead = 0;
                for (const stats of rankingStats) {
                    if (stats[period] > userSteps) {
                        usersAhead += 1;
                    }
                }
                // パーセンタイル = (順位 / 全ユーザー数) * 100（上位何%）
                const rank = usersAhead + 1;
                percentile[periodKeys[period]] = Math.round((rank / totalUsers) * 100);
            }
        }

        return NextResponse.json({
            percentile,
            totalUsers,
        });
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
