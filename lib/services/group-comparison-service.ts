import { supabaseAdmin as supabase } from '@/lib/supabase';
import { Period } from '@/components/dashboard/LeaderboardTabs';

export interface ComparisonDataPoint {
    date: string; // YYYY-MM-DD or YYYY-MM
    label: string; // Display label (e.g. "Mon", "Jan", "1/15")
    [username: string]: number | string;
}

export interface ChartData {
    data: ComparisonDataPoint[];
    users: { username: string, color: string }[];
}

/** daily_steps クエリ結果の行型 */
interface StepRow {
    steps: number;
    date: string;
    user_id: string;
}

export const getAllGroupComparisonData = async (groupId: string, currentUserId?: string): Promise<Record<Period, ChartData>> => {
    // 入力バリデーション
    if (!groupId || typeof groupId !== 'string' || groupId.trim().length === 0) {
        const empty = { data: [], users: [] };
        return { DAILY: empty, WEEKLY: empty, MONTHLY: empty, YEARLY: empty };
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
    const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    const memberIds = members?.map(m => m.user_id) || [];
    if (memberIds.length === 0) {
        const empty = { data: [], users: [] };
        return { DAILY: empty, WEEKLY: empty, MONTHLY: empty, YEARLY: empty };
    }

    // ⚡ Bolt Optimization: Fetch users separately to avoid payload bloat from Joins
    const { data: users } = await supabase
        .from('users')
        .select('id, username, name')
        .in('id', memberIds);

    const userMap = new Map<string, { username: string | null, name: string | null }>();
    users?.forEach(u => userMap.set(u.id, u));

    // 3. Determine Top 10 Members - Fetching ALL steps with pagination
    let allSteps: StepRow[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
        const { data: stepsChunk, error } = await supabase
            .from('daily_steps')
            .select(`
                steps,
                date,
                user_id
            `) // Optimization: Removed users!inner join
            .in('user_id', memberIds)
            .gte('date', minDateStr)
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error('[GroupChart] ステップデータ取得エラー:', error?.code ?? 'UNKNOWN');
            break;
        }

        if (!stepsChunk || stepsChunk.length === 0) break;

        allSteps = allSteps.concat(stepsChunk);

        if (stepsChunk.length < pageSize) break; // Reached end
        page++;
    }

    if (allSteps.length === 0) {
        const empty = { data: [], users: [] };
        return { DAILY: empty, WEEKLY: empty, MONTHLY: empty, YEARLY: empty };
    }

    // Identify Top 10 based on Total Steps in the fetched range
    const userTotals = new Map<string, number>();
    const userIdToName = new Map<string, string>();

    allSteps.forEach((row) => {
        const uid = row.user_id;
        const safeSteps = Number(row.steps);
        const stepsToAdd = isNaN(safeSteps) ? 0 : safeSteps;
        userTotals.set(uid, (userTotals.get(uid) || 0) + stepsToAdd);

        // Robust name resolution
        // Optimization: Use in-memory map instead of row.users
        const u = userMap.get(uid);
        const displayName = u?.username || u?.name || 'Unknown';
        userIdToName.set(uid, displayName);
    });

    const topUserIds = Array.from(userTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(e => e[0]);

    if (currentUserId && memberIds.includes(currentUserId) && !topUserIds.includes(currentUserId)) {
        topUserIds.push(currentUserId);
    }

    // Generate Colors
    const colors = [
        '#4F46E5', '#EC4899', '#10B981', '#F59E0B', '#3B82F6',
        '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16', '#F97316'
    ];
    const chartUsers = topUserIds.map((uid, i) => ({
        username: userIdToName.get(uid) || 'Unknown',
        color: colors[i % colors.length]
    }));

    // Filter steps to only top users
    const relevantSteps = allSteps.filter((r) => topUserIds.includes(r.user_id));

    // 4. Build Data for each Period

    const buildChartData = (startStr: string, endStr: string, aggregation: 'day' | 'week' | 'month'): ComparisonDataPoint[] => {
        const map = new Map<string, ComparisonDataPoint>();

        const current = new Date(startStr);
        // Ensure end comparison handles string correctly or use dates loop
        // The previous string comparison loop `formatter.format(current) <= endStr` works for YYYY-MM-DD

        if (aggregation === 'day') {
            while (formatter.format(current) <= endStr) {
                const dStr = formatter.format(current);
                const dateObj = new Date(dStr);
                // Label: MM/DD
                const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

                map.set(dStr, { date: dStr, label });
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
                map.set(weekStartStr, { date: weekStartStr, label });

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

                map.set(mStr, { date: mStr, label });

                cM++;
                if (cM > 12) { cM = 1; cY++; }
            }
        }

        // Initialize all users to 0 for every point to ensure continuous lines
        for (const point of map.values()) {
            chartUsers.forEach(u => {
                point[u.username] = 0;
            });
        }

        // ⚡ Bolt Optimization: Pre-calculate week keys for O(1) matching
        const mapKeys = Array.from(map.keys());
        let firstWeekMs = 0;
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        if (aggregation === 'week' && mapKeys.length > 0) {
            const firstWeekStr = mapKeys[0];
            firstWeekMs = Date.UTC(
                parseInt(firstWeekStr.substring(0, 4), 10),
                parseInt(firstWeekStr.substring(5, 7), 10) - 1,
                parseInt(firstWeekStr.substring(8, 10), 10)
            );
        }

        // Fill Data
        relevantSteps.forEach((row) => {
            // NORMALIZE DATE: Extract YYYY-MM-DD only
            const rowDateRaw = row.date;
            const rowDateStr = rowDateRaw.length >= 10 ? rowDateRaw.substring(0, 10) : rowDateRaw;

            if (rowDateStr < startStr || rowDateStr > endStr) return;

            let key = rowDateStr; // Default for 'day'

            if (aggregation === 'month') {
                key = rowDateStr.substring(0, 7); // YYYY-MM
            } else if (aggregation === 'week') {
                // ⚡ Bolt Optimization: O(1) week index calculation
                // Avoids O(N) array iteration for each step row
                const rY = parseInt(rowDateStr.substring(0, 4), 10);
                const rM = parseInt(rowDateStr.substring(5, 7), 10) - 1;
                const rD = parseInt(rowDateStr.substring(8, 10), 10);
                const rowMs = Date.UTC(rY, rM, rD);

                const diffMs = rowMs - firstWeekMs;
                if (diffMs >= 0) {
                    const weekIndex = Math.floor(diffMs / weekMs);
                    if (weekIndex >= 0 && weekIndex < mapKeys.length) {
                        key = mapKeys[weekIndex];
                    } else {
                        key = '';
                    }
                } else {
                    key = '';
                }
            }

            if (key && map.has(key)) {
                const p = map.get(key)!;
                const username = userIdToName.get(row.user_id);
                if (username) {
                    const currentVal = typeof p[username] === 'number' ? p[username] as number : 0;
                    const increment = Number(row.steps);
                    // Ensure we don't propagate NaNs
                    const safeIncrement = isNaN(increment) ? 0 : increment;
                    p[username] = currentVal + safeIncrement;
                }
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
