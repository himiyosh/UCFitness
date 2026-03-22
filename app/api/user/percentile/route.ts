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

        // 各期間のソート済みリストを作成してパーセンタイルを計算
        const periods = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
        const periodKeys = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' } as const;

        const percentile: Record<string, number | null> = {
            daily: null,
            weekly: null,
            monthly: null,
        };

        // ⚡ Bolt Optimization: O(N log N) sorting replaced with O(N) linear scan
        // since we only need to know how many users have MORE steps to determine rank.
        const userStats = rankingMap[userId];

        for (const period of periods) {
            const mySteps = userStats?.[period] || 0;

            if (mySteps === 0) {
                percentile[periodKeys[period]] = null;
                continue;
            }

            let rank = 1; // 1-based ranking
            for (const stats of Object.values(rankingMap)) {
                if (stats[period] > mySteps) {
                    rank++;
                }
            }

            // パーセンタイル = (順位 / 全ユーザー数) * 100（上位何%）
            percentile[periodKeys[period]] = Math.round((rank / totalUsers) * 100);
        }

        return NextResponse.json({
            percentile,
            totalUsers,
        });
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
