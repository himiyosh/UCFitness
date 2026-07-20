import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllWithPagination } from '@/lib/supabase-utils';
import { AppError, reportError } from '@/lib/errors';
import { isValidStepGoal } from '@/lib/step-goal';
import { sendBadgeNotification } from '@/lib/api/teams';
import { sendConsolidatedBadgeNotification } from '@/lib/services/badge-allocator';

import type { Period } from '@/components/dashboard/LeaderboardTabs';

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
const NOTIFICATION_BATCH_SIZE = 20;
const PERSONAL_BADGE_BATCH_SIZE = 10;
const BADGE_ASSIGNMENT_ERRORS = {
    input: ['Invalid badge assignment input', 'BADGE_ASSIGN_INPUT_INVALID', 'input'],
    activeQuery: ['Failed to load active personal badge users', 'BADGE_PERSONAL_ACTIVE_USERS_QUERY_FAILED', 'active-users'],
    activeData: ['Invalid active personal badge users data', 'BADGE_PERSONAL_ACTIVE_USERS_INVALID_DATA', 'active-users'],
    usersQuery: ['Failed to load personal badge users', 'BADGE_PERSONAL_USERS_QUERY_FAILED', 'users'],
    usersData: ['Invalid personal badge users data', 'BADGE_PERSONAL_USERS_INVALID_DATA', 'users'],
    totalsQuery: ['Failed to load personal badge totals', 'BADGE_PERSONAL_TOTALS_QUERY_FAILED', 'totals'],
    totalsData: ['Invalid personal badge totals data', 'BADGE_PERSONAL_TOTALS_INVALID_DATA', 'totals'],
    historyQuery: ['Failed to load personal badge history', 'BADGE_PERSONAL_HISTORY_QUERY_FAILED', 'history'],
    historyData: ['Invalid personal badge history data', 'BADGE_PERSONAL_HISTORY_INVALID_DATA', 'history'],
} as const;

/** バッジ定義へアクセスする際の安全なキー型 */
type BadgePeriodKey = keyof typeof BADGE_DEFINITIONS.GLOBAL;
type UserBadgeAwards = Map<string, string[]>;
type BadgeAssignmentErrorKey = keyof typeof BADGE_ASSIGNMENT_ERRORS;

interface ActiveUserRow { user_id: string; steps: number }
interface UserGoalRow { id: string; step_goal: number }
interface UserTotalsRow { user_id: string; total_steps: number; total_days: number }
interface UserHistoryRow { user_id: string; date: string; steps: number }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function badgeAssignmentFailure(
    key: BadgeAssignmentErrorKey,
    dateStr: string,
    batchOffset?: number,
    reportedError?: unknown,
): never {
    const [message, code, stage] = BADGE_ASSIGNMENT_ERRORS[key];
    const context = { stage, dateStr, ...(batchOffset === undefined ? {} : { batchOffset }) };
    reportError(`assignBadges:${stage}`, reportedError ?? new Error(message), context);
    throw new AppError(message, code, context);
}

function parseUniqueUserRows<T>(
    data: unknown,
    guard: (value: unknown) => value is T,
    getUserId: (row: T) => string,
    expectedUserIds?: readonly string[],
): T[] | null {
    if (!Array.isArray(data)) return null;
    const expected = expectedUserIds ? new Set(expectedUserIds) : null;
    const seen = new Set<string>();
    const rows: T[] = [];
    for (const value of data) {
        if (!guard(value)) return null;
        const userId = getUserId(value);
        if (seen.has(userId) || (expected && !expected.has(userId))) return null;
        seen.add(userId);
        rows.push(value);
    }
    return expected && seen.size !== expected.size ? null : rows;
}

function isActiveUserRow(value: unknown): value is ActiveUserRow {
    return isRecord(value)
        && isNonEmptyString(value.user_id)
        && isNonnegativeSafeInteger(value.steps);
}

function isUserGoalRow(value: unknown): value is UserGoalRow {
    return isRecord(value)
        && isNonEmptyString(value.id)
        && isValidStepGoal(value.step_goal);
}

function isUserTotalsRow(value: unknown): value is UserTotalsRow {
    return isRecord(value)
        && isNonEmptyString(value.user_id)
        && isNonnegativeSafeInteger(value.total_steps)
        && isNonnegativeSafeInteger(value.total_days);
}

function parseHistoryRows(
    data: unknown,
    userIds: readonly string[],
    startDate: string,
    endDate: string,
): UserHistoryRow[] | null {
    if (!Array.isArray(data)) return null;
    const expectedUsers = new Set(userIds);
    const seen = new Set<string>();
    const rows: UserHistoryRow[] = [];
    for (const value of data) {
        if (
            !isRecord(value)
            || !isNonEmptyString(value.user_id)
            || !expectedUsers.has(value.user_id)
            || !isIsoDate(value.date)
            || value.date < startDate
            || value.date > endDate
            || !isNonnegativeSafeInteger(value.steps)
        ) {
            return null;
        }
        const key = `${value.user_id}\u0000${value.date}`;
        if (seen.has(key)) return null;
        seen.add(key);
        rows.push({ user_id: value.user_id, date: value.date, steps: value.steps });
    }
    return rows;
}

function addUserBadgeAwards(
    awards: UserBadgeAwards,
    userId: string,
    badgeCodes: string[],
): void {
    if (badgeCodes.length === 0) return;
    const existing = awards.get(userId) ?? [];
    existing.push(...badgeCodes);
    awards.set(userId, existing);
}

function mergeUserBadgeAwards(...awardMaps: UserBadgeAwards[]): UserBadgeAwards {
    const merged = new Map<string, string[]>();
    for (const awards of awardMaps) {
        for (const [userId, badgeCodes] of awards) {
            addUserBadgeAwards(merged, userId, badgeCodes);
        }
    }
    return merged;
}

interface StreakAward {
    userId: string;
    badgeCode: string;
    rewardAmount: number;
}

async function awardStreakMilestones(dateStr: string): Promise<{
    awards: StreakAward[];
    failedUsers: number;
}> {
    const { data, error } = await supabaseAdmin.rpc('award_streak_milestones', {
        p_target_date: dateStr,
    });
    if (error || !Array.isArray(data)) {
        reportError(
            'awardStreakMilestones',
            error ?? new Error('Invalid streak milestone response'),
            { dateStr },
        );
        throw new Error('Failed to award streak milestones');
    }

    const awards: StreakAward[] = [];
    let failedUsers = 0;
    for (const row of data) {
        if (typeof row !== 'object' || row === null) {
            throw new Error('Invalid streak milestone row');
        }
        const userId = 'awarded_user_id' in row ? row.awarded_user_id : null;
        const badgeCode = 'awarded_badge_code' in row ? row.awarded_badge_code : null;
        const rewardAmount = 'awarded_reward_amount' in row ? row.awarded_reward_amount : null;
        const errorCode = 'error_code' in row ? row.error_code : null;
        if (typeof errorCode === 'string') {
            failedUsers++;
            reportError('awardStreakMilestones:user', new Error(errorCode), { userId });
        } else if (
            typeof userId === 'string'
            && typeof badgeCode === 'string'
            && typeof rewardAmount === 'number'
            && Number.isSafeInteger(rewardAmount)
            && rewardAmount >= 0
        ) {
            awards.push({ userId, badgeCode, rewardAmount });
        } else {
            throw new Error('Invalid streak milestone award');
        }
    }
    return { awards, failedUsers };
}

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

export const assignBadges = async (period: Period, dateStr: string): Promise<void> => {
    if (!isIsoDate(dateStr)) {
        badgeAssignmentFailure('input', dateStr);
    }

    const [globalAwards, groupAwards, personalAwards, streakResult] = await Promise.all([
        assignGlobalBadges(period, dateStr),
        assignGroupBadges(period, dateStr),
        period === 'DAILY'
            ? assignPersonalBadges(dateStr)
            : Promise.resolve(new Map<string, string[]>()),
        period === 'DAILY'
            ? awardStreakMilestones(dateStr)
            : Promise.resolve({ awards: [], failedUsers: 0 }),
    ]);

    const userAwards = mergeUserBadgeAwards(globalAwards, groupAwards, personalAwards);
    const bonusCoinsByUser = new Map<string, number>();
    for (const award of streakResult.awards) {
        addUserBadgeAwards(userAwards, award.userId, [award.badgeCode]);
        bonusCoinsByUser.set(
            award.userId,
            (bonusCoinsByUser.get(award.userId) ?? 0) + award.rewardAmount,
        );
    }
    const notificationEntries = Array.from(userAwards.entries());
    for (let index = 0; index < notificationEntries.length; index += NOTIFICATION_BATCH_SIZE) {
        const batch = notificationEntries.slice(index, index + NOTIFICATION_BATCH_SIZE);
        await Promise.all(
            batch.map(async ([userId, badgeCodes]) => Promise.all([
                sendConsolidatedBadgeNotification(
                    userId,
                    badgeCodes,
                    bonusCoinsByUser.get(userId) ?? 0,
                ),
                sendBadgeTeamsNotification(userId, badgeCodes),
            ])),
        );
    }

    if (streakResult.failedUsers > 0) {
        throw new Error(
            `Streak milestone rewards failed for ${streakResult.failedUsers} users`,
        );
    }
};

const assignPersonalBadges = async (dateStr: string): Promise<UserBadgeAwards> => {
    const userAwards = new Map<string, string[]>();
    const activeResult = await supabaseAdmin
        .from('daily_steps')
        .select('user_id, steps')
        .eq('date', dateStr);
    if (activeResult.error !== null) {
        badgeAssignmentFailure('activeQuery', dateStr, undefined, activeResult.error);
    }
    const activeUsers = parseUniqueUserRows(
        activeResult.data,
        isActiveUserRow,
        (row) => row.user_id,
    );
    if (activeUsers === null) {
        badgeAssignmentFailure('activeData', dateStr);
    }
    if (activeUsers.length === 0) return userAwards;

    for (let batchOffset = 0; batchOffset < activeUsers.length; batchOffset += PERSONAL_BADGE_BATCH_SIZE) {
        const batch = activeUsers.slice(batchOffset, batchOffset + PERSONAL_BADGE_BATCH_SIZE);
        const userIds = batch.map((user) => user.user_id);

        const usersResult = await supabaseAdmin
            .from('users')
            .select('id, step_goal')
            .in('id', userIds);
        if (usersResult.error !== null) {
            badgeAssignmentFailure('usersQuery', dateStr, batchOffset, usersResult.error);
        }
        const usersData = parseUniqueUserRows(
            usersResult.data,
            isUserGoalRow,
            (row) => row.id,
            userIds,
        );
        if (usersData === null) {
            badgeAssignmentFailure('usersData', dateStr, batchOffset);
        }
        const goalMap = new Map(usersData.map((user) => [user.id, user.step_goal]));
        const thirtyDaysAgo = new Date(dateStr);
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
        const historyStartDate = thirtyDaysAgo.toISOString().slice(0, 10);

        const [totalsResult, historyResult] = await Promise.all([
            supabaseAdmin.rpc('get_batch_user_step_totals', { p_user_ids: userIds }),
            supabaseAdmin
                .from('daily_steps')
                .select('user_id, date, steps')
                .in('user_id', userIds)
                .gte('date', historyStartDate)
                .lte('date', dateStr),
        ]);
        if (totalsResult.error !== null) {
            badgeAssignmentFailure('totalsQuery', dateStr, batchOffset, totalsResult.error);
        }
        const totalsRows = parseUniqueUserRows(
            totalsResult.data,
            isUserTotalsRow,
            (row) => row.user_id,
            userIds,
        );
        if (totalsRows === null) {
            badgeAssignmentFailure('totalsData', dateStr, batchOffset);
        }
        if (historyResult.error !== null) {
            badgeAssignmentFailure('historyQuery', dateStr, batchOffset, historyResult.error);
        }
        const historyRows = parseHistoryRows(
            historyResult.data,
            userIds,
            historyStartDate,
            dateStr,
        );
        if (historyRows === null) {
            badgeAssignmentFailure('historyData', dateStr, batchOffset);
        }

        const totalsMap = new Map(totalsRows.map((row) => [
            row.user_id,
            { total_steps: row.total_steps, total_days: row.total_days },
        ]));
        const historyMap = new Map<string, { date: string; steps: number }[]>();
        historyRows.forEach((row) => {
            const history = historyMap.get(row.user_id) ?? [];
            history.push({ date: row.date, steps: row.steps });
            historyMap.set(row.user_id, history);
        });

        const batchAwards = await Promise.all(batch.map(async (user) => {
            const goal = goalMap.get(user.user_id);
            if (goal === undefined) {
                badgeAssignmentFailure('usersData', dateStr, batchOffset);
            }
            const userTotals = totalsMap.get(user.user_id);
            if (userTotals === undefined) {
                badgeAssignmentFailure('totalsData', dateStr, batchOffset);
            }
            const results = await Promise.all([
                assignStreakBadges(
                    user.user_id,
                    dateStr,
                    historyMap.get(user.user_id) ?? [],
                    goal,
                ),
                assignMilestoneBadges(user.user_id, userTotals.total_steps),
                assignTitleBadges(user.user_id, dateStr, userTotals.total_steps, userTotals.total_days),
                assignLifestyleBadges(user.user_id, dateStr, user.steps),
            ]);
            return {
                userId: user.user_id,
                badgeCodes: results.flat().filter((badgeCode): badgeCode is string => badgeCode !== null),
            };
        }));

        for (const { userId, badgeCodes } of batchAwards) {
            addUserBadgeAwards(userAwards, userId, badgeCodes);
        }
    }
    return userAwards;
}

const assignStreakBadges = async (
    userId: string,
    dateStr: string,
    history: { date: string; steps: number }[],
    goal: number,
): Promise<(string | null)[]> => {
    const steps = history
        .filter(h => h.date <= dateStr)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);
    if (steps.length < 3) return [];

    const today = new Date(dateStr);
    for (let i = 0; i < 3; i++) {
        const expected = new Date(today);
        expected.setUTCDate(today.getUTCDate() - i);
        if (
            steps[i].date !== expected.toISOString().split('T')[0]
            || steps[i].steps < goal
        ) {
            return [];
        }
    }
    return [await awardBadge(userId, 'STREAK_3', dateStr, null)];
}

const assignMilestoneBadges = async (userId: string, totalSteps: number): Promise<(string | null)[]> => {
    const dateStr = new Date().toISOString().split('T')[0];
    const badgePromises: Promise<string | null>[] = [];

    if (totalSteps >= 1000000) badgePromises.push(awardBadge(userId, 'MILESTONE_1M', dateStr, null));
    if (totalSteps >= 500000) badgePromises.push(awardBadge(userId, 'MILESTONE_500K', dateStr, null));
    if (totalSteps >= 100000) badgePromises.push(awardBadge(userId, 'MILESTONE_100K', dateStr, null));
    return Promise.all(badgePromises);
}

const assignTitleBadges = async (userId: string, dateStr: string, totalSteps: number, totalDays: number): Promise<(string | null)[]> => {
    if (totalDays === 0) return [];

    const average = totalSteps / totalDays;
    const badgePromises: Promise<string | null>[] = [];

    if (average >= 20000) badgePromises.push(awardBadge(userId, 'TITLE_AVGST_20K', dateStr, null));
    if (average >= 15000) badgePromises.push(awardBadge(userId, 'TITLE_AVGST_15K', dateStr, null));
    if (average >= 10000) badgePromises.push(awardBadge(userId, 'TITLE_AVGST_10K', dateStr, null));
    if (average >= 8000) badgePromises.push(awardBadge(userId, 'TITLE_AVGST_8K', dateStr, null));
    if (average >= 6000) badgePromises.push(awardBadge(userId, 'TITLE_AVGST_6K', dateStr, null));
    return Promise.all(badgePromises);
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

const assignGlobalBadges = async (
    period: Period,
    dateStr: string,
): Promise<UserBadgeAwards> => {
    const userBadgeMap = new Map<string, string[]>();
    if (period === 'YEARLY') return userBadgeMap;

    const { startDate, endDate } = computeDateRange(period, dateStr);
    const rankings = await getRankingsForRange(startDate, endDate);

    // CONSTRAINT: Global Badges require 10+ active users
    if (rankings.length < 10) {
        return userBadgeMap;
    }

    const periodKey = period as BadgePeriodKey;
    const badgeCodes = BADGE_DEFINITIONS.GLOBAL[periodKey];
    if (!badgeCodes) return userBadgeMap;

    const top3 = rankings.slice(0, 3);

    // ユーザーごとに新規バッジを収集して統合通知を送信
    await Promise.all(top3.map(async (entry, i) => {
        if (entry.steps <= 0) return;
        const result = await awardBadge(entry.userId, badgeCodes[i], dateStr, null);
        if (result) {
            addUserBadgeAwards(userBadgeMap, entry.userId, [result]);
        }
    }));

    return userBadgeMap;
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

const assignGroupBadges = async (
    period: Period,
    dateStr: string,
): Promise<UserBadgeAwards> => {
    const allUserBadgeMap = new Map<string, string[]>();
    if (period === 'YEARLY') return allUserBadgeMap;

    const periodKey = period as BadgePeriodKey;
    const badgeCodes = BADGE_DEFINITIONS.GROUP[periodKey];
    if (!badgeCodes) return allUserBadgeMap;

    // 1. Get all groups
    const { data: groups } = await supabaseAdmin
        .from('groups')
        .select('id');

    if (!groups || groups.length === 0) return allUserBadgeMap;

    const { startDate, endDate } = computeDateRange(period, dateStr);

    // 2. Fetch ALL group members in one query (eliminates N+1)
    const groupIds = groups.map(g => g.id);
    const { data: allMembers } = await supabaseAdmin
        .from('group_members')
        .select('user_id, group_id')
        .in('group_id', groupIds);

    if (!allMembers) return allUserBadgeMap;

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

    if (qualifyingGroups.length === 0) return allUserBadgeMap;

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
                addUserBadgeAwards(allUserBadgeMap, entry.userId, [result]);
            }
        }));
    }));

    return allUserBadgeMap;
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

        return badgeCode;
    } catch (error: unknown) {
        reportError('awardBadge', error, { badgeCode });
        return null;
    }
};

const sendBadgeTeamsNotification = async (
    userId: string,
    badgeCodes: string[],
): Promise<void> => {
    const [userResult, badgeResults] = await Promise.all([
        supabaseAdmin.from('users').select('username').eq('id', userId).single(),
        Promise.all(badgeCodes.map((badgeCode) => supabaseAdmin.from('badges')
            .select('name, image_url, description').eq('code', badgeCode).single())),
    ]);
    const badges = badgeResults.flatMap((result) => result.data ? [result.data] : []);
    if (badges.length > 0 && userResult.data) {
        await sendBadgeNotification(
            userResult.data.username || 'A user',
            badges.map((badge) => badge.name).join(' / '),
            badges.find((badge) => badge.image_url)?.image_url ?? null,
            badges.map((badge) => badge.description).filter(Boolean).join(' / '),
        );
    }
};
