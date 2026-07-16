import { unstable_cache } from 'next/cache';

import { reportError } from '@/lib/errors';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { fetchDailyStepsPaginated } from '@/lib/supabase-utils';
import { getJSTDateString, getWeekStartDate, getMonthStartDate, getYearStartDate } from '@/lib/date-utils';

import type { Period } from '@/components/dashboard/LeaderboardTabs';
import type { DailyStepRow, UserRow } from '@/types/database';

import { sortPositiveStepRankings } from './ranking-utils';

import type { RankingEntry } from './ranking-utils';

// --- 内部集計用の型定義 ---
// RankingAccumulatorEntry / RankingUser はテストコードからも参照するため export する。

/** RankingEntry.users と同じ形 (装備情報は enrich 前は未設定) */
export type RankingUser = RankingEntry['users'];

/** fetchDailyStepsPaginated は selectFields 省略時に 'user_id, steps, date' を返す */
type DailyStepRecord = Pick<DailyStepRow, 'user_id' | 'steps' | 'date'>;

/** `.select('id, name, image, username, group_keyword')` の行 */
type RankingUserWithGroupKeyword = Pick<UserRow, 'id' | 'name' | 'image' | 'username' | 'group_keyword'>;

/** `.select('id, name, image, username')` の行 */
type RankingUserSummary = Pick<UserRow, 'id' | 'name' | 'image' | 'username'>;

/** `group_members` から `users(id, name, image, username)` を埋め込み取得した行 */
type GroupMemberWithUser = {
    user_id: string;
    users: RankingUserSummary | null;
};

/** originalRank 付与前のランキングエントリ (getRankings / getGroupRankings 系の内部集計・返り値) */
export type RankingAccumulatorEntry = {
    steps: number;
    prevSteps?: number;
    users: RankingUser;
};

/** UserStats の前期間集計フィールド (PREV_DAILY/PREV_WEEKLY/PREV_MONTHLY) */
type PrevPeriodKey = 'PREV_DAILY' | 'PREV_WEEKLY' | 'PREV_MONTHLY';


// Define type for User Stats Map
export type UserStats = {
    users: RankingUser;
    DAILY: number;
    WEEKLY: number;
    MONTHLY: number;
    YEARLY: number;
    PREV_DAILY: number;
    PREV_WEEKLY: number;
    PREV_MONTHLY: number;
};

export type GlobalRankingMap = Record<string, UserStats>;

export const getRankings = async (scope: 'GLOBAL' | 'GROUP', period: Period, groupKeyword?: string) => {
    const jstDateStr = getJSTDateString();

    let startDate = jstDateStr;

    if (period === 'WEEKLY') {
        startDate = getWeekStartDate(jstDateStr);
    } else if (period === 'MONTHLY') {
        startDate = getMonthStartDate(jstDateStr);
    } else if (period === 'YEARLY') {
        startDate = getYearStartDate(jstDateStr);
    }

    // ⚡ Bolt Optimization: Split user and step fetching to avoid heavy joins
    let userIds: string[] | null = null;
    const usersMap = new Map<string, RankingUser>();

    if (scope === 'GROUP') {
        if (!groupKeyword) throw new Error('Group keyword is required for group rankings');

        // group_members テーブルからメンバーを取得 (レガシー group_keyword 配列に依存しない)
        const { data: groupData, error: groupError } = await supabase
            .from('groups')
            .select('id')
            .eq('keyword', groupKeyword)
            .single();

        if (groupError && groupError.code !== 'PGRST116') {
            reportError('ranking-service:getRankings:group', groupError, { groupKeyword });
            throw new Error('Failed to load ranking group');
        }
        if (!groupData) return [];

        const { data: members, error: membersError } = await supabase
            .from('group_members')
            .select('user_id, users(id, name, image, username)')
            .eq('group_id', groupData.id)
            .returns<GroupMemberWithUser[]>();

        if (membersError) {
            reportError('ranking-service:getRankings:members', membersError, {
                groupId: groupData.id,
            });
            throw new Error('Failed to load ranking members');
        }
        if (!members || members.length === 0) return [];

        userIds = members.map(m => m.user_id);
        members.forEach((m) => { if (m.users) usersMap.set(m.users.id, m.users); });
    }

    // PostgREST 1000行制限回避: ページネーション付き取得
    const { data: rawSteps, error } = await fetchDailyStepsPaginated<DailyStepRecord>({
        startDate,
        userIds: userIds || undefined,
    });

    if (error) {
        reportError('ranking-service:getRankings:steps', error, { scope, period });
        throw new Error(`Failed to load ${scope.toLowerCase()} ranking steps`);
    }

    // If GLOBAL (userIds was null), we need to fetch users now based on the steps we got
    if (!userIds) {
        const uniqueUserIds = Array.from(new Set(rawSteps?.map((r) => r.user_id)));

        if (uniqueUserIds.length > 0) {
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('id, name, image, username, group_keyword')
                .in('id', uniqueUserIds)
                .returns<RankingUserWithGroupKeyword[]>();

            if (usersError) {
                reportError('ranking-service:getRankings:users', usersError, {
                    userCount: uniqueUserIds.length,
                });
                throw new Error('Failed to load ranking users');
            }
            users?.forEach((u) => usersMap.set(u.id, u));
        }
    }

    // Aggregate steps by user
    const userStats = new Map<string, RankingAccumulatorEntry>();

    rawSteps?.forEach((row) => {
        const userId = row.user_id;
        const user = usersMap.get(userId);

        if (!user) return;

        if (!userStats.has(userId)) {
            userStats.set(userId, {
                steps: 0,
                users: user
            });
        }
        const entry = userStats.get(userId);
        if (entry) entry.steps += Number(row.steps);
    });

    // Convert to array and sort
    const sortedRankings = sortPositiveStepRankings(Array.from(userStats.values()));

    return sortedRankings;
};

// Internal function to fetch and aggregate global stats into a Map
const fetchGlobalRankingMap = async (): Promise<GlobalRankingMap> => {
    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD (JST)

    // Yesterday
    const todayDate = new Date(`${todayStr}T00:00:00Z`);
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setUTCDate(todayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Weekly Start (This Week Monday)
    const utcDay = todayDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(todayDate);
    monday.setUTCDate(todayDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Last Week Start (Monday - 7)
    const lastWeekMonday = new Date(monday);
    lastWeekMonday.setUTCDate(monday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Last Month Start
    const thisMonthDate = new Date(`${monthlyStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // Query start: earlier of last month or year start
    const queryStartStr = lastMonthStartStr < yearlyStartStr ? lastMonthStartStr : yearlyStartStr;

    // PostgREST 1000行制限回避: ページネーション付き取得
    const { data: rawSteps, error } = await fetchDailyStepsPaginated<DailyStepRecord>({
        startDate: queryStartStr,
        userIds: undefined, // All users
    });

    if (error) {
        throw new Error('GLOBAL_RANKING_DATABASE_ERROR');
    }

    const uniqueUserIds = Array.from(new Set(rawSteps?.map((r) => r.user_id)));
    const usersMap = new Map<string, RankingUser>();

    if (uniqueUserIds.length > 0) {
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, name, image, username, group_keyword')
            .in('id', uniqueUserIds)
            .returns<RankingUserWithGroupKeyword[]>();

        if (usersError) {
            throw new Error('GLOBAL_RANKING_USERS_DATABASE_ERROR');
        }

        users?.forEach((u) => usersMap.set(u.id, u));
    }

    // Aggregate
    // structure: Map<userId, UserStats>
    const aggMap: GlobalRankingMap = {};

    rawSteps?.forEach((row) => {
        const userId = row.user_id;
        const user = usersMap.get(userId);

        if (!user) return; // Skip if user details missing

        if (!aggMap[userId]) {
            aggMap[userId] = {
                users: user,
                DAILY: 0,
                WEEKLY: 0,
                MONTHLY: 0,
                YEARLY: 0,
                PREV_DAILY: 0,
                PREV_WEEKLY: 0,
                PREV_MONTHLY: 0
            };
        }
        const entry = aggMap[userId];
        const steps = Number(row.steps);
        const date = row.date;

        // Yearly (date >= yearlyStartStr always true since queryStartStr <= yearlyStartStr)
        if (date >= yearlyStartStr) {
            entry.YEARLY += steps;
        }

        // Monthly
        if (date >= monthlyStartStr) {
            entry.MONTHLY += steps;
        }

        // Weekly
        if (date >= weeklyStartStr) {
            entry.WEEKLY += steps;
        }

        // Daily
        if (date === todayStr) {
            entry.DAILY += steps;
        }

        // Previous period aggregation
        // PREV_DAILY: yesterday only
        if (date === yesterdayStr) {
            entry.PREV_DAILY += steps;
        }

        // PREV_WEEKLY: last week (lastWeekStartStr <= date < weeklyStartStr)
        if (date >= lastWeekStartStr && date < weeklyStartStr) {
            entry.PREV_WEEKLY += steps;
        }

        // PREV_MONTHLY: last month (lastMonthStartStr <= date < monthlyStartStr)
        if (date >= lastMonthStartStr && date < monthlyStartStr) {
            entry.PREV_MONTHLY += steps;
        }
    });

    return aggMap;
};

// ⚡ Bolt Optimization: Cache the compact map structure to save memory and avoid redundant processing
export const getCachedGlobalRankingMap = unstable_cache(
    async () => fetchGlobalRankingMap(),
    ['global-ranking-map'],
    { revalidate: 60, tags: ['rankings'] }
);

// Helper to transform the map into sorted lists (for UI consumption)
export const transformRankingMapToLists = (aggMap: GlobalRankingMap): Record<Period, RankingAccumulatorEntry[]> => {
    const result: Record<string, RankingAccumulatorEntry[]> = {
        DAILY: [],
        WEEKLY: [],
        MONTHLY: [],
        YEARLY: []
    };

    const allEntries = Object.values(aggMap);

    const prevKeyMap: Record<string, PrevPeriodKey | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
        const prevKey = prevKeyMap[key];
        // Create ranking entries for this key
        const list = sortPositiveStepRankings(allEntries.map(e => {
            return {
                steps: e[key],
                users: e.users,
                ...(prevKey ? { prevSteps: e[prevKey] } : {})
            };
        }));

        result[key] = list;
    });

    return result as Record<Period, RankingAccumulatorEntry[]>;
};

export const getAllRankings = async (scope: 'GLOBAL' | 'GROUP', groupKeyword?: string) => {
    // ⚡ Bolt Optimization: Use the new cached map for GLOBAL scope
    if (scope === 'GLOBAL') {
        const rankingMap = await getCachedGlobalRankingMap();
        return transformRankingMapToLists(rankingMap);
    }

    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD (JST)

    // Yesterday
    const todayDate = new Date(`${todayStr}T00:00:00Z`);
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setUTCDate(todayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Weekly Start (This Week Monday)
    const utcDay = todayDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(todayDate);
    monday.setUTCDate(todayDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Last Week Start (Monday - 7)
    const lastWeekMonday = new Date(monday);
    lastWeekMonday.setUTCDate(monday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Last Month Start
    const thisMonthDate = new Date(`${monthlyStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // クエリ開始日: 先月1日 or 年初の早い方（1月の場合は先月=昨年12月）
    const queryStartStr = lastMonthStartStr < yearlyStartStr ? lastMonthStartStr : yearlyStartStr;

    // GROUP Logic (retained)
    let userIds: string[] | null = null;
    const usersMap = new Map<string, RankingUser>();

    if (scope === 'GROUP' && groupKeyword) {
        // 🐛 Fix: group_members テーブルを使用（レガシー group_keyword 配列に依存しない）
        const { data: groupData } = await supabase
            .from('groups')
            .select('id')
            .eq('keyword', groupKeyword)
            .single();

        if (!groupData) return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };

        const { data: members } = await supabase
            .from('group_members')
            .select('user_id, users(id, name, image, username)')
            .eq('group_id', groupData.id)
            .returns<GroupMemberWithUser[]>();

        if (!members || members.length === 0) return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };

        userIds = members.map(m => m.user_id);
        members.forEach((m) => { if (m.users) usersMap.set(m.users.id, m.users); });
    }

    // PostgREST 1000行制限回避: ページネーション付き取得
    const { data: rawSteps, error } = await fetchDailyStepsPaginated<DailyStepRecord>({
        startDate: queryStartStr,
        userIds: userIds || undefined,
    });

    if (error) {
        console.error(`Error fetching ${scope} all rankings`);
        return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    }

    // GROUP scope: userIds が null の場合（安全策フォールバック）
    if (!userIds) {
        const uniqueUserIds = Array.from(new Set(rawSteps?.map((r) => r.user_id)));

        if (uniqueUserIds.length > 0) {
            const { data: users } = await supabase
                .from('users')
                .select('id, name, image, username, group_keyword')
                .in('id', uniqueUserIds)
                .returns<RankingUserWithGroupKeyword[]>();

            users?.forEach((u) => usersMap.set(u.id, u));
        }
    }

    // Aggregate
    // structure: Map<userId, { user: User, daily: 0, weekly: 0, monthly: 0, yearly: 0 }>
    const aggMap = new Map<string, UserStats>();

    rawSteps?.forEach((row) => {
        const userId = row.user_id;
        const user = usersMap.get(userId);

        if (!user) return; // Skip if user details missing

        if (!aggMap.has(userId)) {
            aggMap.set(userId, {
                users: user,
                DAILY: 0,
                WEEKLY: 0,
                MONTHLY: 0,
                YEARLY: 0,
                PREV_DAILY: 0,
                PREV_WEEKLY: 0,
                PREV_MONTHLY: 0
            });
        }
        const entry = aggMap.get(userId)!;
        const steps = Number(row.steps);
        const date = row.date;

        // Yearly (date >= yearlyStartStr always true since queryStartStr <= yearlyStartStr)
        if (date >= yearlyStartStr) {
            entry.YEARLY += steps;
        }

        // Monthly
        if (date >= monthlyStartStr) {
            entry.MONTHLY += steps;
        }

        // Weekly
        if (date >= weeklyStartStr) {
            entry.WEEKLY += steps;
        }

        // Daily
        if (date === todayStr) {
            entry.DAILY += steps;
        }

        // Previous period aggregation
        // PREV_DAILY: yesterday only
        if (date === yesterdayStr) {
            entry.PREV_DAILY += steps;
        }

        // PREV_WEEKLY: last week (lastWeekStartStr <= date < weeklyStartStr)
        if (date >= lastWeekStartStr && date < weeklyStartStr) {
            entry.PREV_WEEKLY += steps;
        }

        // PREV_MONTHLY: last month (lastMonthStartStr <= date < monthlyStartStr)
        if (date >= lastMonthStartStr && date < monthlyStartStr) {
            entry.PREV_MONTHLY += steps;
        }
    });

    // Transform to separated arrays and sort
    const result: Record<string, RankingAccumulatorEntry[]> = {
        DAILY: [],
        WEEKLY: [],
        MONTHLY: [],
        YEARLY: []
    };

    const allEntries = Array.from(aggMap.values());

    const prevKeyMap: Record<string, PrevPeriodKey | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
        const prevKey = prevKeyMap[key];
        // Create ranking entries for this key
        const list = sortPositiveStepRankings(allEntries.map(e => {
            return {
                steps: e[key],
                users: e.users,
                ...(prevKey ? { prevSteps: e[prevKey] } : {})
            };
        }));

        result[key] = list;
    });

    return result as Record<Period, RankingAccumulatorEntry[]>;
};

// New Functions using 'groups' table

export const getGroupRankings = async (groupId: string, period: Period) => {
    // 🛡️ 入力検証
    if (!groupId || typeof groupId !== 'string' || groupId.length > 100) return [];

    // JST Calculation
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const jstDateStr = formatter.format(now);

    let startDate = jstDateStr;

    if (period === 'WEEKLY') {
        const currentDate = new Date(`${jstDateStr}T00:00:00Z`);
        const utcDay = currentDate.getUTCDay();
        const daysToSubtract = (utcDay + 6) % 7;
        const monday = new Date(currentDate);
        monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
        startDate = monday.toISOString().split('T')[0];
    } else if (period === 'MONTHLY') {
        const [y, m] = jstDateStr.split('-');
        startDate = `${y}-${m}-01`;
    } else if (period === 'YEARLY') {
        const y = jstDateStr.split('-')[0];
        startDate = `${y}-01-01`;
    }

    // Join group_members -> users -> daily_steps
    const { data: groupMembers, error: memberError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    if (memberError || !groupMembers) {
        console.error('Error fetching group members');
        return [];
    }

    const userIds = groupMembers.map(m => m.user_id);

    if (userIds.length === 0) return [];

    // ⭐ Performance: JOIN を分割して並列取得 + PostgREST 1000行制限回避
    const [stepsResult, usersResult] = await Promise.all([
        fetchDailyStepsPaginated<DailyStepRecord>({
            startDate,
            userIds,
        }),
        supabase
            .from('users')
            .select('id, name, image, username')
            .in('id', userIds)
            .returns<RankingUserSummary[]>(),
    ]);

    const { data: rawSteps, error } = stepsResult;
    const users = usersResult.data;

    if (error) {
        console.error('Error fetching group rankings');
        return [];
    }

    const usersLookup = new Map(users?.map(u => [u.id, u]));

    // Aggregate
    const userMap = new Map<string, RankingAccumulatorEntry>();
    rawSteps?.forEach((row) => {
        const userId = row.user_id;
        const user = usersLookup.get(userId);
        if (!user) return;

        if (!userMap.has(userId)) {
            userMap.set(userId, {
                steps: 0,
                users: user
            });
        }
        const entry = userMap.get(userId)!;
        entry.steps += Number(row.steps);
    });

    return sortPositiveStepRankings(Array.from(userMap.values()));
};

export const getAllGroupRankings = async (groupId: string) => {
    // 🛡️ 入力検証
    if (!groupId || typeof groupId !== 'string' || groupId.length > 100) {
        return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    }

    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD (JST)

    // Weekly Start
    const currentDate = new Date(`${todayStr}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(currentDate);
    monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Yesterday
    const yesterdayDate = new Date(currentDate);
    yesterdayDate.setUTCDate(currentDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Last Week Start
    const lastWeekMonday = new Date(monday);
    lastWeekMonday.setUTCDate(monday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Last Month Start
    const thisMonthDate = new Date(`${monthlyStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // Query start: earlier of last month or year start
    const queryStartStr = lastMonthStartStr < yearlyStartStr ? lastMonthStartStr : yearlyStartStr;

    // Fetch Members
    const { data: groupMembers, error: groupMembersError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    if (groupMembersError) {
        reportError('ranking-service:getAllGroupRankings:members', groupMembersError, { groupId });
        throw new Error('Failed to load group ranking members');
    }
    const userIds = groupMembers?.map(m => m.user_id) || [];
    if (userIds.length === 0) return { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };

    // ⚡ Performance: ステップとユーザー情報を並列取得 + PostgREST 1000行制限回避
    const [stepsResult, usersResult] = await Promise.all([
        fetchDailyStepsPaginated<DailyStepRecord>({
            startDate: queryStartStr,
            userIds,
        }),
        supabase
            .from('users')
            .select('id, name, image, username')
            .in('id', userIds)
            .returns<RankingUserSummary[]>()
    ]);

    const { data: rawSteps, error } = stepsResult;
    const { data: users, error: usersError } = usersResult;

    if (error) {
        reportError('ranking-service:getAllGroupRankings:steps', error, { groupId });
        throw new Error('Failed to load group ranking steps');
    }
    if (usersError) {
        reportError('ranking-service:getAllGroupRankings:users', usersError, { groupId });
        throw new Error('Failed to load group ranking users');
    }

    const usersMap = new Map(users?.map(u => [u.id, u]));

    // Aggregate
    const aggMap = new Map<string, UserStats>();

    // Initialize for ALL users (Ensure 0 step users are included)
    users?.forEach(u => {
        aggMap.set(u.id, {
            users: u,
            DAILY: 0,
            WEEKLY: 0,
            MONTHLY: 0,
            YEARLY: 0,
            PREV_DAILY: 0,
            PREV_WEEKLY: 0,
            PREV_MONTHLY: 0
        });
    });

    rawSteps?.forEach((row) => {
        const userId = row.user_id;
        const entry = aggMap.get(userId);

        if (!entry) return; // Should not happen as we pre-filled

        const steps = Number(row.steps);
        const date = row.date;

        if (date >= yearlyStartStr) entry.YEARLY += steps;
        if (date >= monthlyStartStr) entry.MONTHLY += steps;
        if (date >= weeklyStartStr) entry.WEEKLY += steps;
        if (date === todayStr) entry.DAILY += steps;

        // Previous periods
        if (date === yesterdayStr) entry.PREV_DAILY += steps;
        if (date >= lastWeekStartStr && date < weeklyStartStr) entry.PREV_WEEKLY += steps;
        if (date >= lastMonthStartStr && date < monthlyStartStr) entry.PREV_MONTHLY += steps;
    });

    const result: Record<string, RankingEntry[]> = { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    const allEntries = Array.from(aggMap.values());

    const prevKeyMap: Record<string, PrevPeriodKey | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

    (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
        const prevKey = prevKeyMap[key];
        result[key] = sortPositiveStepRankings(allEntries.map(e => ({
            steps: e[key],
            users: e.users,
            ...(prevKey ? { prevSteps: e[prevKey] } : {})
        })))
            .map((entry, index) => ({
                ...entry,
                originalRank: index + 1,
            }));
    });

    return result as Record<Period, RankingEntry[]>;
};

export const getBatchGroupRankings = async (groupIds: string[]) => {
    if (!groupIds || groupIds.length === 0) return {};

    // 🛡️ 入力検証: グループID数の上限
    if (groupIds.length > 50) {
        console.error('Too many group IDs requested');
        return {};
    }

    // JST Calculation (Robust)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD (JST)

    // Weekly Start
    const currentDate = new Date(`${todayStr}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(currentDate);
    monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Yesterday
    const yesterdayDate = new Date(currentDate);
    yesterdayDate.setUTCDate(currentDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Last Week Start
    const lastWeekMonday = new Date(monday);
    lastWeekMonday.setUTCDate(monday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

    // Monthly Start
    const [y, m] = todayStr.split('-');
    const monthlyStartStr = `${y}-${m}-01`;

    // Last Month Start
    const thisMonthDate = new Date(`${monthlyStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // Yearly Start
    const yearlyStartStr = `${y}-01-01`;

    // Query start: earlier of last month or year start
    const queryStartStr = lastMonthStartStr < yearlyStartStr ? lastMonthStartStr : yearlyStartStr;

    // 1. Fetch Members for ALL groups
    const { data: groupMembers } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds);

    if (!groupMembers || groupMembers.length === 0) return {};

    // 2. Get unique User IDs
    const uniqueUserIds = Array.from(new Set(groupMembers.map(m => m.user_id)));

    // 3. ⚡ Performance: ステップとユーザー情報を並列取得 + PostgREST 1000行制限回避
    const [stepsResult, usersResult] = await Promise.all([
        fetchDailyStepsPaginated<DailyStepRecord>({
            startDate: queryStartStr,
            userIds: uniqueUserIds,
        }),
        supabase
            .from('users')
            .select('id, name, image, username')
            .in('id', uniqueUserIds)
            .returns<RankingUserSummary[]>()
    ]);

    const { data: rawSteps, error } = stepsResult;
    const users = usersResult.data;

    if (error) {
        console.error('Error fetching batch group rankings');
        return {};
    }

    // 4. Aggregate Steps per User
    // Map<UserId, { user: User, DAILY: number, ... }>
    const userStats = new Map<string, UserStats>();

    // Initialize for ALL users
    users?.forEach(u => {
        userStats.set(u.id, {
            users: u,
            DAILY: 0,
            WEEKLY: 0,
            MONTHLY: 0,
            YEARLY: 0,
            PREV_DAILY: 0,
            PREV_WEEKLY: 0,
            PREV_MONTHLY: 0
        });
    });

    rawSteps?.forEach((row) => {
        const userId = row.user_id;
        const entry = userStats.get(userId);

        if (!entry) return; // Should not happen

        const steps = Number(row.steps);
        const date = row.date;

        if (date >= yearlyStartStr) entry.YEARLY += steps;
        if (date >= monthlyStartStr) entry.MONTHLY += steps;
        if (date >= weeklyStartStr) entry.WEEKLY += steps;
        if (date === todayStr) entry.DAILY += steps;

        // Previous periods
        if (date === yesterdayStr) entry.PREV_DAILY += steps;
        if (date >= lastWeekStartStr && date < weeklyStartStr) entry.PREV_WEEKLY += steps;
        if (date >= lastMonthStartStr && date < monthlyStartStr) entry.PREV_MONTHLY += steps;
    });

    // 5. Distribute to Groups
    const result: Record<string, Record<Period, RankingAccumulatorEntry[]>> = {};

    // Initialize result for all requested groups
    groupIds.forEach(gid => {
        result[gid] = { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    });

    // Build Map<GroupId, UserIDs[]>
    const groupUsersMap = new Map<string, string[]>();
    groupMembers.forEach(m => {
        if (!groupUsersMap.has(m.group_id)) {
            groupUsersMap.set(m.group_id, []);
        }
        groupUsersMap.get(m.group_id)?.push(m.user_id);
    });

    // Build rankings for each group
    const prevKeyMap: Record<string, PrevPeriodKey | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

    groupIds.forEach(gid => {
        const memberIds = groupUsersMap.get(gid) || [];
        const groupEntries: UserStats[] = [];

        memberIds.forEach(uid => {
            const stats = userStats.get(uid);
            if (stats) {
                groupEntries.push(stats);
            }
        });

        // Split into periods and sort
        (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
            const prevKey = prevKeyMap[key];
            result[gid][key] = sortPositiveStepRankings(groupEntries.map(e => ({
                steps: e[key],
                users: e.users,
                ...(prevKey ? { prevSteps: e[prevKey] } : {})
            })));
        });
    });

    return result;
};

// ⚡ Bolt Optimization: Derive group rankings from cached global rankings to avoid expensive DB calls
export const deriveBatchGroupRankings = async (
    groupIds: string[],
    globalRankings: Record<Period, RankingAccumulatorEntry[]> | GlobalRankingMap
) => {
    if (groupIds.length === 0) return {};

    // 1. Fetch Members for ALL groups
    const { data: groupMembers, error: groupMembersError } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds);

    if (groupMembersError) {
        reportError('ranking-service:deriveBatchGroupRankings:members', groupMembersError, { groupIds });
        throw new Error('GROUP_MEMBER_RANKING_DATABASE_ERROR');
    }
    if (!groupMembers || groupMembers.length === 0) return {};

    // 2. Build User Stats Map from Global Rankings (In-Memory pivot)
    // Map<UserId, { user: User, DAILY: number, WEEKLY: number, ..., PREV_DAILY: number, ... }>
    const userStats = new Map<string, UserStats>();

    // Optimization: Filter for target users immediately
    const targetUserIds = new Set(groupMembers.map(m => m.user_id));

    // Check if input is Map or Record<Period, Array>
    // If it has 'DAILY' as an array property, it's the old format
    // But wait, GlobalRankingMap is Record<string, UserStats>. UserStats has DAILY as number.
    // We can check type of 'DAILY'.

    const isLegacyFormat = (
        input: Record<Period, RankingAccumulatorEntry[]> | GlobalRankingMap
    ): input is Record<Period, RankingAccumulatorEntry[]> => {
        return Array.isArray(input.DAILY);
    };

    if (isLegacyFormat(globalRankings)) {
        const prevFieldMap: Record<string, PrevPeriodKey> = {
            DAILY: 'PREV_DAILY',
            WEEKLY: 'PREV_WEEKLY',
            MONTHLY: 'PREV_MONTHLY'
        };

        (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(period => {
            const list = globalRankings[period];
            if (list) {
                list.forEach((entry) => {
                    const userId = entry.users.id;

                    // ⚡ Bolt Optimization: Only process users relevant to the requested groups
                    if (!targetUserIds.has(userId)) return;

                    if (!userStats.has(userId)) {
                        userStats.set(userId, {
                            users: entry.users,
                            DAILY: 0, WEEKLY: 0, MONTHLY: 0, YEARLY: 0,
                            PREV_DAILY: 0, PREV_WEEKLY: 0, PREV_MONTHLY: 0
                        });
                    }
                    const stats = userStats.get(userId)!;
                    stats[period] = entry.steps;
                    // Carry prevSteps from global rankings
                    const prevField = prevFieldMap[period];
                    if (prevField && entry.prevSteps !== undefined) {
                        stats[prevField] = entry.prevSteps;
                    }
                });
            }
        });
    } else {
        // New Optimized Path: Direct Map Lookup O(M)
        const rankingMap = globalRankings;
        targetUserIds.forEach(userId => {
            if (rankingMap[userId]) {
                userStats.set(userId, rankingMap[userId]);
            }
        });
    }

    // 3. Identify Missing Users (who have 0 steps across all periods, so not in global rankings)
    const missingUserIds: string[] = [];

    targetUserIds.forEach(uid => {
        if (!userStats.has(uid)) {
            missingUserIds.push(uid);
        }
    });

    // 4. Fetch Missing Users Profile Data
    if (missingUserIds.length > 0) {
        const { data: users } = await supabase
            .from('users')
            .select('id, name, image, username')
            .in('id', missingUserIds)
            .returns<RankingUserSummary[]>();

        users?.forEach(u => {
            userStats.set(u.id, {
                users: u,
                DAILY: 0, WEEKLY: 0, MONTHLY: 0, YEARLY: 0,
                PREV_DAILY: 0, PREV_WEEKLY: 0, PREV_MONTHLY: 0
            });
        });
    }

    // 5. Distribute to Groups
    const result: Record<string, Record<Period, RankingEntry[]>> = {};
    groupIds.forEach(gid => {
        result[gid] = { DAILY: [], WEEKLY: [], MONTHLY: [], YEARLY: [] };
    });

    const groupUsersMap = new Map<string, string[]>();
    groupMembers.forEach(m => {
        if (!groupUsersMap.has(m.group_id)) {
            groupUsersMap.set(m.group_id, []);
        }
        groupUsersMap.get(m.group_id)?.push(m.user_id);
    });

    const prevKeyMap: Record<string, PrevPeriodKey | null> = {
        DAILY: 'PREV_DAILY',
        WEEKLY: 'PREV_WEEKLY',
        MONTHLY: 'PREV_MONTHLY',
        YEARLY: null
    };

    groupIds.forEach(gid => {
        const memberIds = groupUsersMap.get(gid) || [];
        const groupEntries: UserStats[] = [];

        memberIds.forEach(uid => {
            const stats = userStats.get(uid);
            if (stats) {
                groupEntries.push(stats);
            }
        });

        (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(key => {
            const prevKey = prevKeyMap[key];
            result[gid][key] = sortPositiveStepRankings(groupEntries.map(e => ({
                steps: e[key],
                users: { ...e.users }, // Clone to avoid mutating shared/cached objects
                ...(prevKey ? { prevSteps: e[prevKey] } : {})
            })))
                .map((entry, index) => ({
                    ...entry,
                    originalRank: index + 1,
                }));
        });
    });

    return result;
};

export const getCachedGlobalRankings = unstable_cache(
    async () => getAllRankings('GLOBAL'),
    ['global-rankings'],
    { revalidate: 60, tags: ['rankings'] }
);
