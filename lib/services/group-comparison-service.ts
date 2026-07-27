import { AppError, reportError } from '@/lib/errors';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { isRecord, isValidISODate, isValidUUID } from '@/lib/validation';

import type { Period } from '@/components/dashboard/LeaderboardTabs';

export interface ComparisonDataPoint {
    date: string; // YYYY-MM-DD or YYYY-MM
    label: string; // Display label (e.g. "Mon", "Jan", "1/15")
    values: Record<string, number>;
}

export interface ComparisonSeries {
    seriesKey: string;
    displayName: string;
    displayLabel: string;
    color: string;
    isCurrentUser: boolean;
}

export interface ChartData {
    data: ComparisonDataPoint[];
    users: ComparisonSeries[];
}

type GroupComparisonStage = 'input' | 'members' | 'users' | 'steps';
type GroupComparisonLogStage = GroupComparisonStage | 'unexpected';
type GroupComparisonLogOperation = 'groups/detail:comparison';

interface MemberRow {
    groupId: string;
    userId: string;
}

interface StepRow {
    steps: number;
    date: string;
    user_id: string;
}

const GROUP_COMPARISON_ROW_LIMIT = 1000;
const GROUP_COMPARISON_OPERATION = 'getAllGroupComparisonData';
const GROUP_COMPARISON_FAILURES = {
    invalidInput: ['Invalid group comparison input', 'GROUP_COMPARISON_INPUT_INVALID', 'input'],
    membersDatabase: ['Failed to load comparison members', 'GROUP_COMPARISON_MEMBERS_DATABASE_ERROR', 'members'],
    membersInvalid: ['Invalid comparison member data', 'GROUP_COMPARISON_MEMBERS_INVALID', 'members'],
    membersIncomplete: ['Incomplete comparison member data', 'GROUP_COMPARISON_MEMBERS_INCOMPLETE', 'members'],
    usersDatabase: ['Failed to load comparison users', 'GROUP_COMPARISON_USERS_DATABASE_ERROR', 'users'],
    usersInvalid: ['Invalid comparison user data', 'GROUP_COMPARISON_USERS_INVALID', 'users'],
    usersIncomplete: ['Incomplete comparison user data', 'GROUP_COMPARISON_USERS_INCOMPLETE', 'users'],
    stepsDatabase: ['Failed to load comparison steps', 'GROUP_COMPARISON_STEPS_DATABASE_ERROR', 'steps'],
    stepsInvalid: ['Invalid comparison step data', 'GROUP_COMPARISON_STEPS_INVALID', 'steps'],
    stepsIncomplete: ['Incomplete comparison step data', 'GROUP_COMPARISON_STEPS_INCOMPLETE', 'steps'],
} as const satisfies Record<string, readonly [string, string, GroupComparisonStage]>;

type GroupComparisonFailureKey = keyof typeof GROUP_COMPARISON_FAILURES;

const GROUP_COMPARISON_CODES_BY_STAGE: Readonly<Record<GroupComparisonStage, readonly string[]>> = {
    input: [GROUP_COMPARISON_FAILURES.invalidInput[1]],
    members: [
        GROUP_COMPARISON_FAILURES.membersDatabase[1],
        GROUP_COMPARISON_FAILURES.membersInvalid[1],
        GROUP_COMPARISON_FAILURES.membersIncomplete[1],
    ],
    users: [
        GROUP_COMPARISON_FAILURES.usersDatabase[1],
        GROUP_COMPARISON_FAILURES.usersInvalid[1],
        GROUP_COMPARISON_FAILURES.usersIncomplete[1],
    ],
    steps: [
        GROUP_COMPARISON_FAILURES.stepsDatabase[1],
        GROUP_COMPARISON_FAILURES.stepsInvalid[1],
        GROUP_COMPARISON_FAILURES.stepsIncomplete[1],
    ],
};

function createEmptyComparisonData(): Record<Period, ChartData> {
    return {
        DAILY: { data: [], users: [] },
        WEEKLY: { data: [], users: [] },
        MONTHLY: { data: [], users: [] },
        YEARLY: { data: [], users: [] },
    };
}

function throwGroupComparisonFailure(key: GroupComparisonFailureKey): never {
    const [message, code, stage] = GROUP_COMPARISON_FAILURES[key];
    throw new AppError(message, code, {
        operation: GROUP_COMPARISON_OPERATION,
        stage,
    });
}

function parseCompleteRows(
    data: unknown,
    count: unknown,
    invalidKey: GroupComparisonFailureKey,
    incompleteKey: GroupComparisonFailureKey,
): unknown[] {
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || Number(count) < 0) {
        throwGroupComparisonFailure(invalidKey);
    }
    if (Number(count) > GROUP_COMPARISON_ROW_LIMIT || data.length !== Number(count)) {
        throwGroupComparisonFailure(incompleteKey);
    }
    return data;
}

function parseMemberRows(data: unknown, count: unknown, groupId: string): MemberRow[] {
    const rows = parseCompleteRows(data, count, 'membersInvalid', 'membersIncomplete');
    const memberIds = new Set<string>();

    return rows.map((value) => {
        if (
            !isRecord(value)
            || value.group_id !== groupId
            || !isValidUUID(value.user_id)
            || memberIds.has(value.user_id)
        ) {
            throwGroupComparisonFailure('membersInvalid');
        }
        memberIds.add(value.user_id);
        return { groupId, userId: value.user_id };
    });
}

function parseDisplayName(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string' || value.trim().length === 0) {
        throwGroupComparisonFailure('usersInvalid');
    }
    return value;
}

function parseUserDisplayNames(
    data: unknown,
    count: unknown,
    memberIds: readonly string[],
): Map<string, string> {
    const rows = parseCompleteRows(data, count, 'usersInvalid', 'usersIncomplete');
    if (rows.length !== memberIds.length) {
        throwGroupComparisonFailure('usersIncomplete');
    }

    const expectedIds = new Set(memberIds);
    const displayNames = new Map<string, string>();
    for (const value of rows) {
        if (
            !isRecord(value)
            || !isValidUUID(value.id)
            || !expectedIds.has(value.id)
            || displayNames.has(value.id)
        ) {
            throwGroupComparisonFailure('usersInvalid');
        }

        const username = parseDisplayName(value.username);
        const name = parseDisplayName(value.name);
        const displayName = username ?? name;
        if (displayName === null) {
            throwGroupComparisonFailure('usersInvalid');
        }
        displayNames.set(value.id, displayName);
    }

    if (memberIds.some((memberId) => !displayNames.has(memberId))) {
        throwGroupComparisonFailure('usersIncomplete');
    }
    return displayNames;
}

function parseStepRows(
    data: unknown,
    count: unknown,
    memberIds: ReadonlySet<string>,
    minDate: string,
    maxDate: string,
): StepRow[] {
    const rows = parseCompleteRows(data, count, 'stepsInvalid', 'stepsIncomplete');
    const recordedDays = new Set<string>();

    return rows.map((value) => {
        if (
            !isRecord(value)
            || !isValidUUID(value.user_id)
            || !memberIds.has(value.user_id)
            || !isValidISODate(value.date)
            || value.date < minDate
            || value.date > maxDate
            || !Number.isSafeInteger(value.steps)
            || Number(value.steps) < 0
        ) {
            throwGroupComparisonFailure('stepsInvalid');
        }

        const rowKey = `${value.user_id}:${value.date}`;
        if (recordedDays.has(rowKey)) {
            throwGroupComparisonFailure('stepsInvalid');
        }
        recordedDays.add(rowKey);
        return {
            user_id: value.user_id,
            date: value.date,
            steps: Number(value.steps),
        };
    });
}

function addSafeSteps(current: number, increment: number): number {
    const total = current + increment;
    if (!Number.isSafeInteger(total)) {
        throwGroupComparisonFailure('stepsInvalid');
    }
    return total;
}

function createSeriesKey(userId: string): string {
    return `series_${userId.replaceAll('-', '_')}`;
}

function createUniqueDisplayLabel(
    displayName: string,
    ordinal: number,
    duplicateCount: number,
    usedLabels: Set<string>,
): string {
    let disambiguator = duplicateCount > 1 ? ordinal : 0;
    let label = disambiguator > 0 ? `${displayName} (${disambiguator})` : displayName;
    while (usedLabels.has(label)) {
        disambiguator += 1;
        label = `${displayName} (${disambiguator})`;
    }
    usedLabels.add(label);
    return label;
}

function isGroupComparisonStage(value: unknown): value is GroupComparisonStage {
    return value === 'input' || value === 'members' || value === 'users' || value === 'steps';
}

function createGroupComparisonLogError(error: unknown): AppError {
    if (error instanceof AppError) {
        const operation = error.context?.operation;
        const stage = error.context?.stage;
        if (
            operation === GROUP_COMPARISON_OPERATION
            && isGroupComparisonStage(stage)
            && GROUP_COMPARISON_CODES_BY_STAGE[stage].includes(error.code)
        ) {
            return new AppError('Group comparison service failure', error.code, {
                operation,
                stage,
            });
        }
    }

    return new AppError(
        'Group comparison service failure',
        'GROUP_COMPARISON_UNEXPECTED_ERROR',
        { operation: GROUP_COMPARISON_OPERATION, stage: 'unexpected' satisfies GroupComparisonLogStage },
    );
}

export function reportGroupComparisonServiceFailure(
    operation: GroupComparisonLogOperation,
    error: unknown,
): void {
    reportError(operation, createGroupComparisonLogError(error));
}

export const getAllGroupComparisonData = async (groupId: string, currentUserId?: string): Promise<Record<Period, ChartData>> => {
    if (!isValidUUID(groupId) || (currentUserId !== undefined && !isValidUUID(currentUserId))) {
        throwGroupComparisonFailure('invalidInput');
    }

    // Helper to get formatted date
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const now = new Date();
    const todayStr = formatter.format(now);
    // 1. Define Date Ranges for each period

    // DAILY: Last 7 Days (Context for "Today")
    const dailyStart = new Date(now);
    dailyStart.setDate(dailyStart.getDate() - 6);
    const dailyStartStr = formatter.format(dailyStart);

    // WEEKLY: Last 12 Weeks (Monday Start - This Week's Sunday End)
    // 1. Get "This Week's Monday" based on todayStr to align strictly with Leaderboard
    const currentDate = new Date(`${todayStr}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay(); // 0(Sun) - 6(Sat) of Today
    const daysToSubtract = (utcDay + 6) % 7; // Distance to Monday
    const thisMonday = new Date(currentDate);
    thisMonday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);

    // 2. Start Date = This Monday - 11 weeks (to show 12 weeks total including current)
    const startMonday = new Date(thisMonday);
    startMonday.setUTCDate(thisMonday.getUTCDate() - (11 * 7));
    const weeklyStartStr = startMonday.toISOString().split('T')[0];

    // 3. End Date = This Week's Sunday (This Monday + 6 days)
    const thisSunday = new Date(thisMonday);
    thisSunday.setUTCDate(thisMonday.getUTCDate() + 6);
    const weeklyEndStr = thisSunday.toISOString().split('T')[0];


    // MONTHLY: Last 12 Months (1st of 11 months ago to End of This Month)
    // todayStr is YYYY-MM-DD
    const [year, month] = todayStr.split('-');
    // year/month are strings from todayStr split (1-based month)
    const mDate = new Date(Number(year), Number(month) - 1, 1); // Current Month 1st
    mDate.setMonth(mDate.getMonth() - 11); // Go back 11 months
    const monthlyStartStr = formatter.format(mDate);

    // Get last day of current month
    // new Date(y, m, 0) gives last day of month m-1.
    // We want last day of 'month' (which is 1-based string, e.g. "01").
    // new Date(2025, 1, 0) -> Feb 0 -> Jan 31. Correct.
    const lastDayOfMonth = new Date(Number(year), Number(month), 0);
    const monthlyEndStr = formatter.format(lastDayOfMonth);

    // YEARLY: This Year (Jan 1st to Dec 31st)
    const yearlyStartStr = `${year}-01-01`;
    const yearlyEndStr = `${year}-12-31`;

    // Determine the earliest date needed for fetching (Min Date)
    // Max date doesn't matter for fetching (we fetch >= min), but we need to build full range in chart
    const dates = [dailyStartStr, weeklyStartStr, monthlyStartStr, yearlyStartStr].sort();
    const minDateStr = dates[0]; // The earliest date

    // 2. Fetch Group Members
    const { data: members, error: membersError, count: memberCount } = await supabase
        .from('group_members')
        .select('group_id, user_id', { count: 'exact' })
        .eq('group_id', groupId)
        .order('user_id', { ascending: true })
        .limit(GROUP_COMPARISON_ROW_LIMIT);

    if (membersError) {
        throwGroupComparisonFailure('membersDatabase');
    }
    const memberIds = parseMemberRows(members, memberCount, groupId).map((member) => member.userId);
    if (memberIds.length === 0) {
        return createEmptyComparisonData();
    }

    const { data: users, error: usersError, count: userCount } = await supabase
        .from('users')
        .select('id, username, name', { count: 'exact' })
        .in('id', memberIds)
        .order('id', { ascending: true })
        .limit(GROUP_COMPARISON_ROW_LIMIT);

    if (usersError) {
        throwGroupComparisonFailure('usersDatabase');
    }
    const userIdToName = parseUserDisplayNames(users, userCount, memberIds);

    const { data: stepData, error: stepsError, count: stepCount } = await supabase
        .from('daily_steps')
        .select('steps, date, user_id', { count: 'exact' })
        .in('user_id', memberIds)
        .gte('date', minDateStr)
        .lte('date', todayStr)
        .order('date', { ascending: true })
        .order('user_id', { ascending: true })
        .limit(GROUP_COMPARISON_ROW_LIMIT);

    if (stepsError) {
        throwGroupComparisonFailure('stepsDatabase');
    }
    const allSteps = parseStepRows(
        stepData,
        stepCount,
        new Set(memberIds),
        minDateStr,
        todayStr,
    );

    if (allSteps.length === 0) {
        return createEmptyComparisonData();
    }

    // Identify Top 10 based on Total Steps in the fetched range
    const userTotals = new Map<string, number>();
    allSteps.forEach((row) => {
        userTotals.set(row.user_id, addSafeSteps(userTotals.get(row.user_id) ?? 0, row.steps));
    });

    const topUserIds = Array.from(userTotals.entries())
        .sort(([firstId, firstSteps], [secondId, secondSteps]) =>
            secondSteps - firstSteps || firstId.localeCompare(secondId))
        .slice(0, 10)
        .map(([userId]) => userId);

    if (currentUserId && memberIds.includes(currentUserId) && !topUserIds.includes(currentUserId)) {
        topUserIds.push(currentUserId);
    }

    // Generate Colors
    const colors = [
        '#4F46E5', '#EC4899', '#10B981', '#F59E0B', '#3B82F6',
        '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16', '#F97316'
    ];
    const displayNameCounts = new Map<string, number>();
    topUserIds.forEach((userId) => {
        const displayName = userIdToName.get(userId) ?? throwGroupComparisonFailure('usersIncomplete');
        displayNameCounts.set(displayName, (displayNameCounts.get(displayName) ?? 0) + 1);
    });
    const displayNameOrdinals = new Map<string, number>();
    const usedDisplayLabels = new Set<string>();
    const chartUsers = topUserIds.map((uid, i) => {
        const displayName = userIdToName.get(uid) ?? throwGroupComparisonFailure('usersIncomplete');
        const ordinal = (displayNameOrdinals.get(displayName) ?? 0) + 1;
        displayNameOrdinals.set(displayName, ordinal);
        return {
            seriesKey: createSeriesKey(uid),
            displayName,
            displayLabel: createUniqueDisplayLabel(
                displayName,
                ordinal,
                displayNameCounts.get(displayName) ?? 0,
                usedDisplayLabels,
            ),
            color: colors[i % colors.length],
            isCurrentUser: uid === currentUserId,
        };
    });
    const seriesKeyByUserId = new Map(
        topUserIds.map((userId) => [userId, createSeriesKey(userId)]),
    );

    // Filter steps to only top users
    const topUserIdSet = new Set(topUserIds);
    const relevantSteps = allSteps.filter((row) => topUserIdSet.has(row.user_id));

    // 4. Build Data for each Period

    const buildChartData = (startStr: string, endStr: string, aggregation: 'day' | 'week' | 'month'): ComparisonDataPoint[] => {
        const map = new Map<string, ComparisonDataPoint>();
        const weekStartByDate = new Map<string, string>();

        const current = new Date(startStr);
        // Ensure end comparison handles string correctly or use dates loop
        // The previous string comparison loop `formatter.format(current) <= endStr` works for YYYY-MM-DD

        if (aggregation === 'day') {
            while (formatter.format(current) <= endStr) {
                const dStr = formatter.format(current);
                const dateObj = new Date(dStr);
                // Label: MM/DD
                const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

                map.set(dStr, { date: dStr, label, values: {} });
                current.setDate(current.getDate() + 1);
            }
        } else if (aggregation === 'week') {
            // Align start to start of week?
            // For simplicity, just step 7 days from startStr until past endStr
            while (formatter.format(current) <= endStr) {
                const weekStartStr = formatter.format(current);

                // Determine Week End for range check
                const weekEnd = new Date(current);
                weekEnd.setDate(weekEnd.getDate() + 6);
                // const weekEndStr = formatter.format(weekEnd); // Not used directly for map key

                const dateObj = new Date(weekStartStr);
                const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

                // Use weekStartStr as key
                map.set(weekStartStr, { date: weekStartStr, label, values: {} });
                const weekStartUtc = new Date(`${weekStartStr}T00:00:00Z`);
                for (let offset = 0; offset < 7; offset += 1) {
                    const day = new Date(weekStartUtc);
                    day.setUTCDate(day.getUTCDate() + offset);
                    const dayStr = day.toISOString().split('T')[0];
                    if (dayStr <= endStr) {
                        weekStartByDate.set(dayStr, weekStartStr);
                    }
                }

                current.setDate(current.getDate() + 7);
            }
        } else {
            // Monthly
            let cY = parseInt(startStr.split('-')[0]);
            let cM = parseInt(startStr.split('-')[1]);

            // Iterate months
            while (true) {
                const mStr = `${cY}-${String(cM).padStart(2, '0')}`;
                // Compare YYYY-MM
                if (mStr > endStr.slice(0, 7)) break;

                const dateObj = new Date(cY, cM - 1, 1);
                const label = dateObj.toLocaleDateString('en-US', { month: 'short' });

                map.set(mStr, { date: mStr, label, values: {} });

                cM++;
                if (cM > 12) { cM = 1; cY++; }
            }
        }

        // Initialize all users to 0 for every point to ensure continuous lines
        for (const point of map.values()) {
            chartUsers.forEach((user) => {
                point.values[user.seriesKey] = 0;
            });
        }

        // Fill Data
        relevantSteps.forEach((row) => {
            const rowDateStr = row.date;

            if (rowDateStr < startStr || rowDateStr > endStr) return;

            let key = rowDateStr; // Default for 'day'

            if (aggregation === 'month') {
                key = rowDateStr.substring(0, 7); // YYYY-MM
            } else if (aggregation === 'week') {
                // 期間生成時に作成した日付→週開始キーMapをO(1)で参照する。
                key = weekStartByDate.get(rowDateStr) ?? '';
            }

            if (map.has(key)) {
                const p = map.get(key);
                if (!p) {
                    throwGroupComparisonFailure('stepsInvalid');
                }
                const seriesKey = seriesKeyByUserId.get(row.user_id);
                if (!seriesKey) {
                    throwGroupComparisonFailure('usersIncomplete');
                }
                p.values[seriesKey] = addSafeSteps(p.values[seriesKey] ?? 0, row.steps);
            }
        });

        return Array.from(map.values());
    };

    const result = {
        DAILY: {
            data: buildChartData(dailyStartStr, todayStr, 'day'), // Daily stays as "Last 7 days to Today" usually
            users: chartUsers
        },
        WEEKLY: {
            data: buildChartData(weeklyStartStr, weeklyEndStr, 'week'),
            users: chartUsers
        },
        MONTHLY: {
            data: buildChartData(monthlyStartStr, monthlyEndStr, 'month'),
            users: chartUsers
        },
        YEARLY: {
            data: buildChartData(yearlyStartStr, yearlyEndStr, 'month'),
            users: chartUsers
        }
    };

    return result;
};
