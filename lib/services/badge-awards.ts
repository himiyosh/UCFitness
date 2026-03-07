import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllWithPagination } from '@/lib/supabase-utils';
import { reportError } from '@/lib/errors';
import { Period } from '@/components/dashboard/LeaderboardTabs';
import { sendBadgeNotification } from '@/lib/api/teams';
import { normalizePushLocale, badgeUnlockedTitle, badgeUnlockedBody } from './push-messages';

const BADGE_DEFINITIONS = {
    GLOBAL: {
        DAILY: ['GLOBAL_DAILY_1', 'GLOBAL_DAILY_2', 'GLOBAL_DAILY_3'],
        WEEKLY: ['GLOBAL_WEEKLY_1', 'GLOBAL_WEEKLY_2', 'GLOBAL_WEEKLY_3'],
        MONTHLY: ['GLOBAL_MONTHLY_1', 'GLOBAL_MONTHLY_2', 'GLOBAL_MONTHLY_3'],
    },
    GROUP: {
        DAILY: ['GROUP_DAILY_1', 'GROUP_DAILY_2', 'GROUP_DAILY_3'],
        WEEKLY: ['GROUP_WEEKLY_1', 'GROUP_WEEKLY_2', 'GROUP_WEEKLY_3'],
        MONTHLY: ['GROUP_MONTHLY_1', 'GROUP_MONTHLY_2', 'GROUP_MONTHLY_3'],
    }
} as const;

/** バッジ定義へアクセスする際の安全なキー型 */
type BadgePeriodKey = keyof typeof BADGE_DEFINITIONS.GLOBAL;

/**
 * 日付範囲を計算するヘルパー
 */
function computeDateRange(period: Period, dateStr: string): { startDate: string; endDate: string } {
    const startDate = dateStr;
    let endDate = dateStr;

    if (period === 'WEEKLY') {
        const d = new Date(dateStr);
        const end = new Date(d);
        end.setUTCDate(end.getUTCDate() + 6);
        endDate = end.toISOString().split('T')[0];
    } else if (period === 'MONTHLY') {
        const [y, m] = dateStr.split('-').map(Number);
        const end = new Date(y, m, 0); // Last day of month
        endDate = `${y}-${String(m).padStart(2, '0')}-${end.getDate()}`;
    }

    return { startDate, endDate };
}

export const assignBadges = async (period: Period, dateStr: string) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        reportError('assignBadges', new Error('Invalid dateStr format'));
        return;
    }

    // 1 & 2. Assign Global and Group Badges in parallel
    await Promise.all([
        assignGlobalBadges(period, dateStr),
        assignGroupBadges(period, dateStr),
    ]);

    // 3. Assign Personal Achievements
    // Only run these on DAILY trigger to avoid redundant calculations
    if (period === 'DAILY') {
        await assignPersonalBadges(dateStr);
    }
};

const assignPersonalBadges = async (dateStr: string) => {
    // Get all users who have steps on this date
    const { data: activeUsers } = await supabaseAdmin
        .from('daily_steps')
        .select('user_id, steps')
        .eq('date', dateStr);

    if (!activeUsers || activeUsers.length === 0) return;

    // Process in batches of 10 to avoid N+1 queries
    const BATCH_SIZE = 10;

    for (let i = 0; i < activeUsers.length; i += BATCH_SIZE) {
        const batch = activeUsers.slice(i, i + BATCH_SIZE);
        const userIds = batch.map(u => u.user_id);

        // 1. Fetch step goals for batch
        const { data: usersData } = await supabaseAdmin
            .from('users')
            .select('id, step_goal')
            .in('id', userIds);

        const goalMap = new Map(usersData?.map(u => [u.id, u.step_goal]) || []);

        // 2. PostgREST 1000行制限回避:
        //    - 累計歩数/日数: RPC でDB側集計（マイルストーン/タイトルバッジ用）
        //    - 直近30日履歴: 日付フィルタ付きクエリ（ストリークバッジ用）
        const thirtyDaysAgo = new Date(dateStr);
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

        const [totalsResult, recentHistoryResult] = await Promise.all([
            supabaseAdmin.rpc('get_batch_user_step_totals', { p_user_ids: userIds }),
            supabaseAdmin
                .from('daily_steps')
                .select('user_id, date, steps')
                .in('user_id', userIds)
                .gte('date', thirtyDaysAgoStr),
        ]);

        // 累計マップ: userId -> { total_steps, total_days }
        const totalsMap = new Map<string, { total_steps: number; total_days: number }>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (totalsResult.data as any[] || []).forEach((row: any) => {
            totalsMap.set(row.user_id, { total_steps: Number(row.total_steps), total_days: Number(row.total_days) });
        });

        // 直近履歴マップ: userId -> { date, steps }[]
        const historyMap = new Map<string, { date: string, steps: number }[]>();
        recentHistoryResult.data?.forEach(row => {
            if (!historyMap.has(row.user_id)) {
                historyMap.set(row.user_id, []);
            }
            historyMap.get(row.user_id)?.push(row);
        });

        // Process batch in parallel — バッジ付与後にユーザーごとに統合通知を送信
        await Promise.all(batch.map(async (user) => {
            if (user.steps < 1000) return;

            const history = historyMap.get(user.user_id) || [];
            const goal = goalMap.get(user.user_id) || 10000;
            const userTotals = totalsMap.get(user.user_id) || { total_steps: 0, total_days: 0 };

            const results = await Promise.all([
                assignStreakBadges(user.user_id, dateStr, history, goal),
                assignMilestoneBadges(user.user_id, userTotals.total_steps),
                assignTitleBadges(user.user_id, dateStr, userTotals.total_steps, userTotals.total_days),
                assignLifestyleBadges(user.user_id, dateStr, user.steps),
            ]);

            // 全カテゴリの新規バッジを統合して1通知にまとめる
            const newBadgeCodes = results.flat().filter(Boolean) as string[];
            if (newBadgeCodes.length > 0) {
                await sendConsolidatedBadgeNotification(user.user_id, newBadgeCodes);
            }
        }));
    }
}

const assignStreakBadges = async (userId: string, dateStr: string, history: { date: string, steps: number }[], goal: number): Promise<(string | null)[]> => {
    // Check 30 days back
    // Filter and sort in memory instead of DB query
    const steps = history
        .filter(h => h.date <= dateStr)
        .sort((a, b) => b.date.localeCompare(a.date)) // Descending date
        .slice(0, 30);

    if (!steps || steps.length < 3) return [];

    let streak = 0;
    const today = new Date(dateStr);

    for (let i = 0; i < steps.length; i++) {
        const d = new Date(steps[i].date);
        const expectedDate = new Date(today);
        expectedDate.setUTCDate(today.getUTCDate() - i);

        if (d.toISOString().split('T')[0] !== expectedDate.toISOString().split('T')[0]) {
            break;
        }

        if (steps[i].steps >= goal) {
            streak++;
        } else {
            break;
        }
    }

    const results: (string | null)[] = [];
    if (streak >= 30) results.push(await awardBadge(userId, 'STREAK_30', dateStr, null));
    if (streak >= 7) results.push(await awardBadge(userId, 'STREAK_7', dateStr, null));
    if (streak >= 3) results.push(await awardBadge(userId, 'STREAK_3', dateStr, null));
    return results;
}

const assignMilestoneBadges = async (userId: string, totalSteps: number): Promise<(string | null)[]> => {
    const dateStr = new Date().toISOString().split('T')[0];
    const results: (string | null)[] = [];

    if (totalSteps >= 1000000) results.push(await awardBadge(userId, 'MILESTONE_1M', dateStr, null));
    if (totalSteps >= 500000) results.push(await awardBadge(userId, 'MILESTONE_500K', dateStr, null));
    if (totalSteps >= 100000) results.push(await awardBadge(userId, 'MILESTONE_100K', dateStr, null));
    return results;
}

const assignTitleBadges = async (userId: string, dateStr: string, totalSteps: number, totalDays: number): Promise<(string | null)[]> => {
    if (totalDays === 0) return [];

    const average = totalSteps / totalDays;
    const results: (string | null)[] = [];

    if (average >= 20000) results.push(await awardBadge(userId, 'TITLE_AVGST_20K', dateStr, null));
    if (average >= 15000) results.push(await awardBadge(userId, 'TITLE_AVGST_15K', dateStr, null));
    if (average >= 10000) results.push(await awardBadge(userId, 'TITLE_AVGST_10K', dateStr, null));
    if (average >= 8000) results.push(await awardBadge(userId, 'TITLE_AVGST_8K', dateStr, null));
    if (average >= 6000) results.push(await awardBadge(userId, 'TITLE_AVGST_6K', dateStr, null));
    return results;
}

const assignLifestyleBadges = async (userId: string, dateStr: string, steps: number): Promise<(string | null)[]> => {
    // Weekend Warrior: High steps on Sat/Sun
    const d = new Date(dateStr);
    const day = d.getUTCDay(); // 0=Sun, 6=Sat
    const results: (string | null)[] = [];

    if (day === 0 || day === 6) {
        if (steps >= 20000) {
            results.push(await awardBadge(userId, 'LIFESTYLE_WEEKEND', dateStr, null));
        }
    }
    return results;
}

const assignGlobalBadges = async (period: Period, dateStr: string) => {
    if (period === 'YEARLY') return;

    const { startDate, endDate } = computeDateRange(period, dateStr);
    const rankings = await getRankingsForRange(startDate, endDate);

    // CONSTRAINT: Global Badges require 10+ active users
    if (rankings.length < 10) {
        return;
    }

    const periodKey = period as BadgePeriodKey;
    const badgeCodes = BADGE_DEFINITIONS.GLOBAL[periodKey];
    if (!badgeCodes) return;

    const top3 = rankings.slice(0, 3);

    // ユーザーごとに新規バッジを収集して統合通知を送信
    const userBadgeMap = new Map<string, string[]>();
    await Promise.all(top3.map(async (entry, i) => {
        if (entry.steps <= 0) return;
        const result = await awardBadge(entry.userId, badgeCodes[i], dateStr, null);
        if (result) {
            const existing = userBadgeMap.get(entry.userId) || [];
            existing.push(result);
            userBadgeMap.set(entry.userId, existing);
        }
    }));

    for (const [userId, codes] of userBadgeMap) {
        await sendConsolidatedBadgeNotification(userId, codes);
    }
};

const getRankingsForRange = async (startDate: string, endDate: string, userIds?: string[]) => {
    // PostgREST 1000行制限回避: ページネーション付き取得
    const { data, error } = await fetchAllWithPagination(
        (from, to) => {
            let q = supabaseAdmin
                .from('daily_steps')
                .select('steps, user_id')
                .gte('date', startDate)
                .lte('date', endDate);

            if (userIds && userIds.length > 0) {
                q = q.in('user_id', userIds);
            }

            return q.range(from, to);
        }
    );
    if (error) {
        reportError('getRankingsForRange', error, { startDate, endDate });
        return [];
    }

    // Aggregate
    const userSteps = new Map<string, number>();
    data?.forEach(row => {
        const current = userSteps.get(row.user_id) || 0;
        userSteps.set(row.user_id, current + row.steps);
    });

    return Array.from(userSteps.entries())
        .map(([userId, steps]) => ({ userId, steps }))
        .sort((a, b) => b.steps - a.steps); // Descending
};

const assignGroupBadges = async (period: Period, dateStr: string) => {
    if (period === 'YEARLY') return;

    const periodKey = period as BadgePeriodKey;
    const badgeCodes = BADGE_DEFINITIONS.GROUP[periodKey];
    if (!badgeCodes) return;

    // 1. Get all groups
    const { data: groups } = await supabaseAdmin
        .from('groups')
        .select('id');

    if (!groups || groups.length === 0) return;

    const { startDate, endDate } = computeDateRange(period, dateStr);

    // 2. Fetch ALL group members in one query (eliminates N+1)
    const groupIds = groups.map(g => g.id);
    const { data: allMembers } = await supabaseAdmin
        .from('group_members')
        .select('user_id, group_id')
        .in('group_id', groupIds);

    if (!allMembers) return;

    // Build a map: groupId → user_id[]
    const groupMembersMap = new Map<string, string[]>();
    for (const member of allMembers) {
        const list = groupMembersMap.get(member.group_id) ?? [];
        list.push(member.user_id);
        groupMembersMap.set(member.group_id, list);
    }

    // 3. For each qualifying group, compute rankings and award badges
    // Get all unique userIds across qualifying groups for a single rankings query
    const qualifyingGroups = groups.filter(g => {
        const members = groupMembersMap.get(g.id);
        return members && members.length >= 5;
    });

    if (qualifyingGroups.length === 0) return;

    // Get all unique user IDs for a single range query
    const allUserIds = new Set<string>();
    for (const group of qualifyingGroups) {
        const members = groupMembersMap.get(group.id) ?? [];
        for (const uid of members) {
            allUserIds.add(uid);
        }
    }

    // Single query for all relevant users' steps in range
    const allRankings = await getRankingsForRange(startDate, endDate, Array.from(allUserIds));
    const stepsLookup = new Map(allRankings.map(r => [r.userId, r.steps]));

    // Award badges per group — ユーザーごとに統合通知を送信
    const allUserBadgeMap = new Map<string, string[]>();

    await Promise.all(qualifyingGroups.map(async (group) => {
        const userIds = groupMembersMap.get(group.id) ?? [];

        // Compute group-specific rankings from the pre-fetched data
        const rankings = userIds
            .map(userId => ({ userId, steps: stepsLookup.get(userId) ?? 0 }))
            .sort((a, b) => b.steps - a.steps);

        const top3 = rankings.slice(0, 3);

        await Promise.all(top3.map(async (entry, i) => {
            if (entry.steps <= 0) return;
            const result = await awardBadge(entry.userId, badgeCodes[i], dateStr, group.id);
            if (result) {
                const existing = allUserBadgeMap.get(entry.userId) || [];
                existing.push(result);
                allUserBadgeMap.set(entry.userId, existing);
            }
        }));
    }));

    // 全グループの結果をまとめてユーザーごとに1通知
    for (const [userId, codes] of allUserBadgeMap) {
        await sendConsolidatedBadgeNotification(userId, codes);
    }
};

/**
 * バッジを DB に挿入する（通知は送信しない）。
 * 新規付与に成功した場合は badgeCode を返し、既に付与済みまたはエラーの場合は null を返す。
 * 通知は呼び出し元で sendConsolidatedBadgeNotification にまとめて委譲する。
 */
const awardBadge = async (userId: string, badgeCode: string, periodDate: string, groupId: string | null): Promise<string | null> => {
    try {
        const { error } = await supabaseAdmin
            .from('user_badges')
            .insert({
                user_id: userId,
                badge_code: badgeCode,
                period_date: periodDate,
                group_id: groupId
            });

        if (error) {
            // 23505 = unique violation (badge already awarded) — ignore
            if (error.code !== '23505') {
                reportError('awardBadge:insert', error, { badgeCode });
            }
            return null;
        }

        // Teams 通知のみここで送信（バッジごとに個別投稿するのが適切）
        const [badgeResult, userResult] = await Promise.all([
            supabaseAdmin
                .from('badges')
                .select('name, image_url, description')
                .eq('code', badgeCode)
                .single(),
            supabaseAdmin
                .from('users')
                .select('username')
                .eq('id', userId)
                .single(),
        ]);

        const badgeData = badgeResult.data;
        const userData = userResult.data;

        if (badgeData && userData) {
            await sendBadgeNotification(
                userData.username || "A user",
                badgeData.name,
                badgeData.image_url,
                badgeData.description
            );
        }

        return badgeCode;
    } catch (error: unknown) {
        reportError('awardBadge', error, { badgeCode });
        return null;
    }
};

/**
 * 複数バッジを1通のプッシュ通知にまとめて送信する。
 * ユーザーの言語設定に応じたローカライズ済みメッセージを使用する。
 */
const sendConsolidatedBadgeNotification = async (userId: string, badgeCodes: string[]): Promise<void> => {
    try {
        // バッジ名・ユーザー言語・Push購読を並列取得
        const [badgesResult, userResult, subsResult] = await Promise.all([
            supabaseAdmin
                .from('badges')
                .select('code, name')
                .in('code', badgeCodes),
            supabaseAdmin
                .from('users')
                .select('language')
                .eq('id', userId)
                .single(),
            supabaseAdmin
                .from('push_subscriptions')
                .select('endpoint, p256dh, auth')
                .eq('user_id', userId),
        ]);

        const subs = subsResult.data;
        if (!subs || subs.length === 0) return;

        const locale = normalizePushLocale(userResult.data?.language);
        const badgeNameMap = new Map(badgesResult.data?.map(b => [b.code, b.name]) || []);
        const badgeNames = badgeCodes
            .map(code => badgeNameMap.get(code))
            .filter(Boolean)
            .join(', ');

        const { sendWebPushNotification } = await import('@/lib/api/web-push');

        await Promise.allSettled(
            subs.map(sub => {
                const pushSub = {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                };
                return sendWebPushNotification(pushSub, {
                    title: badgeUnlockedTitle(locale),
                    body: badgeUnlockedBody(locale, badgeNames),
                    url: '/profile',
                });
            })
        );
    } catch (error: unknown) {
        reportError('sendConsolidatedBadgeNotification', error, { userId, badgeCodes });
    }
};
