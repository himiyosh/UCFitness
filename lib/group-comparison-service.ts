import { supabase } from '@/lib/supabase';
import { Period } from '@/components/LeaderboardTabs';

export interface ComparisonDataPoint {
    date: string; // YYYY-MM-DD or YYYY-MM
    label: string; // Display label (e.g. "Mon", "Jan", "1/15")
    [username: string]: number | string;
}

export interface ChartData {
    data: ComparisonDataPoint[];
    users: { username: string, color: string }[];
}

export const getAllGroupComparisonData = async (groupId: string, currentUserId?: string): Promise<Record<Period, ChartData>> => {
    // Helper to get formatted date
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const now = new Date();
    const todayStr = formatter.format(now);
    const [year, month] = todayStr.split('-');

    // 1. Define Date Ranges for each period

    // DAILY: Last 7 Days
    const dailyStart = new Date(now);
    dailyStart.setDate(dailyStart.getDate() - 6);
    const dailyStartStr = formatter.format(dailyStart);

    // WEEKLY: Last 12 Weeks
    const weeklyStart = new Date(now);
    weeklyStart.setDate(weeklyStart.getDate() - (12 * 7)); // 84 days ago
    // Adjust to start of that week (e.g. Sunday or Monday) - Optional, but cleaner.
    // Let's just stick to 84 days ago as rough start, or align to nearest Monday/Sunday if critical.
    // For simplicity: 84 days ago.
    const weeklyStartStr = formatter.format(weeklyStart);

    // MONTHLY: This Month (1st to now/end)
    const monthlyStartStr = `${year}-${month}-01`;

    // YEARLY: This Year (Jan 1st to now)
    const yearlyStartStr = `${year}-01-01`;

    // Determine the earliest date needed for fetching
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

    // 3. Determine Top 10 Members
    // Fetch steps from the earliest needed date
    const { data: allSteps } = await supabase
        .from('daily_steps')
        .select(`
            steps,
            date,
            user_id,
            users (username)
        `)
        .in('user_id', memberIds)
        .gte('date', minDateStr);

    if (!allSteps) {
        const empty = { data: [], users: [] };
        return { DAILY: empty, WEEKLY: empty, MONTHLY: empty, YEARLY: empty };
    }

    // Identify Top 10 based on Total Steps in the fetched range (Last 12 weeks or This Year)
    const userTotals = new Map<string, number>();
    const userIdToName = new Map<string, string>();

    allSteps.forEach((row: any) => {
        const uid = row.user_id;
        userTotals.set(uid, (userTotals.get(uid) || 0) + row.steps);
        if (row.users?.username) userIdToName.set(uid, row.users.username);
    });

    let topUserIds = Array.from(userTotals.entries())
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
    const relevantSteps = allSteps.filter((r: any) => topUserIds.includes(r.user_id));

    // 4. Build Data for each Period

    const buildChartData = (startStr: string, endStr: string, aggregation: 'day' | 'week' | 'month'): ComparisonDataPoint[] => {
        const map = new Map<string, ComparisonDataPoint>();

        let current = new Date(startStr);
        const end = new Date(endStr);

        if (aggregation === 'day') {
            while (formatter.format(current) <= endStr) {
                const dStr = formatter.format(current);
                const dateObj = new Date(dStr);
                // Label: MM/DD
                let label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

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
                const weekEndStr = formatter.format(weekEnd);

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
                if (mStr > endStr.slice(0, 7)) break;

                const dateObj = new Date(cY, cM - 1, 1);
                const label = dateObj.toLocaleDateString('en-US', { month: 'short' });

                map.set(mStr, { date: mStr, label });

                cM++;
                if (cM > 12) { cM = 1; cY++; }
            }
        }

        // Fill Data
        relevantSteps.forEach((row: any) => {
            if (row.date < startStr || row.date > endStr) return;

            let key = row.date; // Default for 'day'

            if (aggregation === 'month') {
                key = row.date.substring(0, 7); // YYYY-MM
            } else if (aggregation === 'week') {
                // Find which week this date belongs to
                // We generated weeks starting from startStr with +7 increments.
                // It's easiest to iterate our map keys (weekStarts) and find the one covering this date.
                // Or better: ensure we snapped startStr to something consistent (e.g. Sunday) 
                // and do math.
                // Let's use the Map keys for exact matching if range fits.

                const rowDate = new Date(row.date);
                // Find the latest key <= rowDate
                let bestKey = null;
                for (const k of map.keys()) {
                    if (k <= row.date) {
                        bestKey = k;
                    } else {
                        break; // Sorted insertion would optimize, but Map iteration order is insertion order
                    }
                }
                key = bestKey || '';
            }

            if (map.has(key)) {
                const p = map.get(key)!;
                const username = userIdToName.get(row.user_id);
                if (username) {
                    p[username] = (Number(p[username]) || 0) + row.steps;
                }
            }
        });

        return Array.from(map.values());
    };

    return {
        DAILY: {
            data: buildChartData(dailyStartStr, todayStr, 'day'),
            users: chartUsers
        },
        WEEKLY: {
            data: buildChartData(weeklyStartStr, todayStr, 'week'),
            users: chartUsers
        },
        MONTHLY: {
            data: buildChartData(monthlyStartStr, todayStr, 'day'),
            users: chartUsers
        },
        YEARLY: {
            data: buildChartData(yearlyStartStr, todayStr, 'month'),
            users: chartUsers
        }
    };
};
