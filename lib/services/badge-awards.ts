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
const STREAK_MILESTONE_REWARDS = {
    STREAK_7: 700,
    STREAK_30: 3000,
    STREAK_100: 10000,
    STREAK_365: 36500,
} as const;
const STREAK_RESULT_KEYS = [
    'awarded_user_id',
    'awarded_badge_code',
    'awarded_reward_amount',
    'error_code',
] as const;
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
    rankingQuery: ['Failed to load badge rankings', 'BADGE_RANKING_QUERY_FAILED', 'rankings'],
    rankingData: ['Invalid badge rankings data', 'BADGE_RANKING_INVALID_DATA', 'rankings'],
    groupsQuery: ['Failed to load badge groups', 'BADGE_GROUPS_QUERY_FAILED', 'groups'],
    groupsData: ['Invalid badge groups data', 'BADGE_GROUPS_INVALID_DATA', 'groups'],
    groupMembersQuery: ['Failed to load badge group members', 'BADGE_GROUP_MEMBERS_QUERY_FAILED', 'group-members'],
    groupMembersData: ['Invalid badge group members data', 'BADGE_GROUP_MEMBERS_INVALID_DATA', 'group-members'],
    awardInsert: ['Failed to insert badge award', 'BADGE_AWARD_INSERT_FAILED', 'award-insert'],
} as const;
const BADGE_INTEGRATION_ERRORS = {
    streakRpc: ['Failed to award streak milestones', 'BADGE_STREAK_RPC_FAILED', 'streak-rpc'],
    streakResponse: ['Invalid streak milestone response', 'BADGE_STREAK_RPC_INVALID_RESPONSE', 'streak-response'],
    streakRow: ['Invalid streak milestone row', 'BADGE_STREAK_ROW_INVALID', 'streak-row'],
    streakPartial: ['Streak milestone rewards partially failed', 'BADGE_STREAK_PARTIAL_FAILURE', 'streak-partial'],
    teamsUserQuery: ['Failed to load badge notification user', 'BADGE_TEAMS_USER_QUERY_FAILED', 'teams-user-query'],
    teamsUserData: ['Invalid badge notification user data', 'BADGE_TEAMS_USER_INVALID_DATA', 'teams-user-data'],
    teamsBadgeQuery: ['Failed to load badge notification badge', 'BADGE_TEAMS_BADGE_QUERY_FAILED', 'teams-badge-query'],
    teamsBadgeData: ['Invalid badge notification badge data', 'BADGE_TEAMS_BADGE_INVALID_DATA', 'teams-badge-data'],
} as const;

type UserBadgeAwards = Map<string, string[]>;
type BadgeAssignmentErrorKey = keyof typeof BADGE_ASSIGNMENT_ERRORS;
type BadgeIntegrationErrorKey = keyof typeof BADGE_INTEGRATION_ERRORS;
type StreakBadgeCode = keyof typeof STREAK_MILESTONE_REWARDS;

interface ActiveUserRow { user_id: string; steps: number }
interface UserGoalRow { id: string; step_goal: number }
interface UserTotalsRow { user_id: string; total_steps: number; total_days: number }
interface UserHistoryRow { user_id: string; date: string; steps: number }
interface RankingEntry { userId: string; steps: number }
interface GroupRow { id: string }
interface GroupMemberRow { user_id: string; group_id: string }
interface TeamsUserRow { username: string }
interface TeamsBadgeRow { name: string; image_url: string | null; description: string | null }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === expectedKeys.length
        && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
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
): never {
    throwBadgeAssignmentFailure(key, {
        dateStr,
        ...(batchOffset === undefined ? {} : { batchOffset }),
    });
}

function throwBadgeAssignmentFailure(
    key: BadgeAssignmentErrorKey,
    context: Record<string, unknown>,
): never {
    const [message, code, stage] = BADGE_ASSIGNMENT_ERRORS[key];
    throw new AppError(message, code, { stage, ...context });
}

function throwBadgeIntegrationFailure(
    key: BadgeIntegrationErrorKey,
    context: Record<string, unknown>,
): never {
    const [message, code, stage] = BADGE_INTEGRATION_ERRORS[key];
    throw new AppError(message, code, { stage, ...context });
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

function parseRankingRows(
    data: unknown,
    expectedUserIds?: readonly string[],
): RankingEntry[] | null {
    if (!Array.isArray(data)) return null;
    const expectedUsers = expectedUserIds === undefined ? null : new Set(expectedUserIds);
    const userSteps = new Map<string, number>();
    for (const value of data) {
        if (
            !isRecord(value)
            || !isNonEmptyString(value.user_id)
            || !isNonnegativeSafeInteger(value.steps)
            || (expectedUsers !== null && !expectedUsers.has(value.user_id))
        ) {
            return null;
        }
        const totalSteps = (userSteps.get(value.user_id) ?? 0) + value.steps;
        if (!Number.isSafeInteger(totalSteps)) return null;
        userSteps.set(value.user_id, totalSteps);
    }
    return Array.from(userSteps, ([userId, steps]) => ({ userId, steps }))
        .sort((a, b) => (a.steps === b.steps ? 0 : b.steps > a.steps ? 1 : -1));
}

function parseGroupRows(data: unknown): GroupRow[] | null {
    if (!Array.isArray(data)) return null;
    const seen = new Set<string>();
    const groups: GroupRow[] = [];
    for (const value of data) {
        if (!isRecord(value) || !isNonEmptyString(value.id) || seen.has(value.id)) {
            return null;
        }
        seen.add(value.id);
        groups.push({ id: value.id });
    }
    return groups;
}

function parseGroupMemberRows(
    data: unknown,
    groupIds: readonly string[],
): GroupMemberRow[] | null {
    if (!Array.isArray(data)) return null;
    const expectedGroups = new Set(groupIds);
    const seen = new Set<string>();
    const members: GroupMemberRow[] = [];
    for (const value of data) {
        if (
            !isRecord(value)
            || !isNonEmptyString(value.user_id)
            || !isNonEmptyString(value.group_id)
            || !expectedGroups.has(value.group_id)
        ) {
            return null;
        }
        const membershipKey = `${value.group_id}\u0000${value.user_id}`;
        if (seen.has(membershipKey)) return null;
        seen.add(membershipKey);
        members.push({ user_id: value.user_id, group_id: value.group_id });
    }
    return members;
}

function isUniqueViolation(error: unknown): boolean {
    return isRecord(error) && error.code === '23505';
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

interface StreakAward { userId: string; badgeCode: string; rewardAmount: number }

function isStreakBadgeCode(value: unknown): value is StreakBadgeCode {
    return typeof value === 'string'
        && Object.prototype.hasOwnProperty.call(STREAK_MILESTONE_REWARDS, value);
}

function isStreakFailureCode(value: unknown): value is string {
    return value === 'INVALID_USER_OR_GOAL'
        || (typeof value === 'string' && /^[A-Z0-9]{5}$/.test(value));
}

function parseStreakMilestoneRows(data: unknown, dateStr: string): {
    awards: StreakAward[];
    failedUsers: number;
} {
    if (!Array.isArray(data)) {
        throwBadgeIntegrationFailure('streakResponse', { dateStr });
    }

    const awards: StreakAward[] = [];
    const failedUserIds = new Set<string>();
    const successfulUserIds = new Set<string>();
    const seenAwards = new Set<string>();
    const seenFailures = new Set<string>();
    for (const value of data) {
        if (!isRecord(value) || !hasExactKeys(value, STREAK_RESULT_KEYS)) {
            throwBadgeIntegrationFailure('streakRow', { dateStr });
        }
        const userId = value.awarded_user_id;
        const badgeCode = value.awarded_badge_code;
        const rewardAmount = value.awarded_reward_amount;
        const errorCode = value.error_code;
        if (
            isNonEmptyString(userId)
            && isStreakBadgeCode(badgeCode)
            && isNonnegativeSafeInteger(rewardAmount)
            && (rewardAmount === 0 || rewardAmount === STREAK_MILESTONE_REWARDS[badgeCode])
            && errorCode === null
        ) {
            const awardKey = `${userId}\u0000${badgeCode}`;
            if (seenAwards.has(awardKey) || failedUserIds.has(userId)) {
                throwBadgeIntegrationFailure('streakRow', { dateStr });
            }
            seenAwards.add(awardKey);
            successfulUserIds.add(userId);
            awards.push({ userId, badgeCode, rewardAmount });
            continue;
        }
        if (
            isNonEmptyString(userId)
            && badgeCode === null
            && rewardAmount === 0
            && isStreakFailureCode(errorCode)
        ) {
            const failureKey = `${userId}\u0000${errorCode}`;
            if (seenFailures.has(failureKey) || successfulUserIds.has(userId)) {
                throwBadgeIntegrationFailure('streakRow', { dateStr });
            }
            seenFailures.add(failureKey);
            failedUserIds.add(userId);
            continue;
        }
        throwBadgeIntegrationFailure('streakRow', { dateStr });
    }
    return { awards, failedUsers: failedUserIds.size };
}

async function awardStreakMilestones(dateStr: string): Promise<{
    awards: StreakAward[];
    failedUsers: number;
}> {
    let result: { data: unknown; error: unknown };
    try {
        result = await supabaseAdmin.rpc('award_streak_milestones', {
            p_target_date: dateStr,
        });
    } catch {
        throwBadgeIntegrationFailure('streakRpc', { dateStr });
    }
    if (result.error !== null) {
        throwBadgeIntegrationFailure('streakRpc', { dateStr });
    }
    return parseStreakMilestoneRows(result.data, dateStr);
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
        throwBadgeIntegrationFailure('streakPartial', {
            dateStr,
            failedUsers: streakResult.failedUsers,
        });
    }
};

const assignPersonalBadges = async (dateStr: string): Promise<UserBadgeAwards> => {
    const userAwards = new Map<string, string[]>();
    const activeResult = await supabaseAdmin
        .from('daily_steps')
        .select('user_id, steps')
        .eq('date', dateStr);
    if (activeResult.error !== null) {
        badgeAssignmentFailure('activeQuery', dateStr);
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
            badgeAssignmentFailure('usersQuery', dateStr, batchOffset);
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
            badgeAssignmentFailure('totalsQuery', dateStr, batchOffset);
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
            badgeAssignmentFailure('historyQuery', dateStr, batchOffset);
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

    const badgeCodes = BADGE_DEFINITIONS.GLOBAL[period];
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

const getRankingsForRange = async (
    startDate: string,
    endDate: string,
    userIds?: string[],
): Promise<RankingEntry[]> => {
    // PostgREST 1000行制限回避: ページネーション付き取得
    const result: { data: unknown; error: unknown } = await fetchAllWithPagination<unknown>(
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
    const failureContext = {
        dateStr: startDate,
        startDate,
        endDate,
    };
    if (result.error !== null) {
        throwBadgeAssignmentFailure('rankingQuery', failureContext);
    }
    const rankings = parseRankingRows(result.data, userIds);
    if (rankings === null) {
        throwBadgeAssignmentFailure('rankingData', failureContext);
    }
    return rankings;
};

const assignGroupBadges = async (
    period: Period,
    dateStr: string,
): Promise<UserBadgeAwards> => {
    const allUserBadgeMap = new Map<string, string[]>();
    if (period === 'YEARLY') return allUserBadgeMap;

    const badgeCodes = BADGE_DEFINITIONS.GROUP[period];
    if (!badgeCodes) return allUserBadgeMap;

    // 1. Get all groups
    const groupsResult = await supabaseAdmin
        .from('groups')
        .select('id');
    if (groupsResult.error !== null) {
        badgeAssignmentFailure('groupsQuery', dateStr);
    }
    const groups = parseGroupRows(groupsResult.data);
    if (groups === null) {
        badgeAssignmentFailure('groupsData', dateStr);
    }
    if (groups.length === 0) return allUserBadgeMap;

    const { startDate, endDate } = computeDateRange(period, dateStr);

    // 2. Fetch ALL group members in one query (eliminates N+1)
    const groupIds = groups.map(g => g.id);
    const membersResult = await supabaseAdmin
        .from('group_members')
        .select('user_id, group_id')
        .in('group_id', groupIds);
    if (membersResult.error !== null) {
        badgeAssignmentFailure('groupMembersQuery', dateStr);
    }
    const allMembers = parseGroupMemberRows(membersResult.data, groupIds);
    if (allMembers === null) {
        badgeAssignmentFailure('groupMembersData', dateStr);
    }

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
 * 新規付与に成功した場合は badgeCode、既に付与済みの場合は null を返す。
 * その他の挿入失敗は固定 AppError として呼び出し元へ伝播する。
 * 通知は呼び出し元で sendConsolidatedBadgeNotification にまとめて委譲する。
 */
const awardBadge = async (userId: string, badgeCode: string, periodDate: string, groupId: string | null): Promise<string | null> => {
    const failureContext = {
        dateStr: periodDate,
        badgeCode,
        userId,
        groupId,
    };
    let insertResult: { error: unknown };
    try {
        insertResult = await supabaseAdmin
            .from('user_badges')
            .insert({
                user_id: userId,
                badge_code: badgeCode,
                period_date: periodDate,
                group_id: groupId
            });
    } catch {
        throwBadgeAssignmentFailure('awardInsert', failureContext);
    }
    if (insertResult.error !== null) {
        if (isUniqueViolation(insertResult.error)) {
            return null;
        }
        throwBadgeAssignmentFailure('awardInsert', failureContext);
    }
    return badgeCode;
};

const sendBadgeTeamsNotification = async (
    userId: string,
    badgeCodes: string[],
): Promise<void> => {
    try {
        const [user, badges] = await Promise.all([
            loadTeamsUser(userId),
            Promise.all(badgeCodes.map((badgeCode) => loadTeamsBadge(userId, badgeCode))),
        ]);
        await sendBadgeNotification(
            user.username,
            badges.map((badge) => badge.name).join(' / '),
            badges.find((badge) => badge.image_url)?.image_url ?? null,
            badges
                .map((badge) => badge.description)
                .filter((description): description is string => description !== null)
                .join(' / '),
        );
    } catch (error: unknown) {
        if (error instanceof AppError && error.code.startsWith('BADGE_TEAMS_')) {
            reportError('sendBadgeTeamsNotification', error);
            return;
        }
        throw error;
    }
};

async function loadTeamsUser(userId: string): Promise<TeamsUserRow> {
    let result: { data: unknown; error: unknown };
    try {
        result = await supabaseAdmin
            .from('users')
            .select('username')
            .eq('id', userId)
            .single();
    } catch {
        throwBadgeIntegrationFailure('teamsUserQuery', { userId });
    }
    if (result.error !== null) {
        throwBadgeIntegrationFailure('teamsUserQuery', { userId });
    }
    if (!isRecord(result.data) || !isNonEmptyString(result.data.username)) {
        throwBadgeIntegrationFailure('teamsUserData', { userId });
    }
    return { username: result.data.username };
}

async function loadTeamsBadge(userId: string, badgeCode: string): Promise<TeamsBadgeRow> {
    let result: { data: unknown; error: unknown };
    try {
        result = await supabaseAdmin
            .from('badges')
            .select('name, image_url, description')
            .eq('code', badgeCode)
            .single();
    } catch {
        throwBadgeIntegrationFailure('teamsBadgeQuery', { userId, badgeCode });
    }
    if (result.error !== null) {
        throwBadgeIntegrationFailure('teamsBadgeQuery', { userId, badgeCode });
    }
    if (
        !isRecord(result.data)
        || !isNonEmptyString(result.data.name)
        || !(typeof result.data.image_url === 'string' || result.data.image_url === null)
        || !(typeof result.data.description === 'string' || result.data.description === null)
    ) {
        throwBadgeIntegrationFailure('teamsBadgeData', { userId, badgeCode });
    }
    return { name: result.data.name, image_url: result.data.image_url, description: result.data.description };
}
