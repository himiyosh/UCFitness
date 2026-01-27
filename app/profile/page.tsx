import { auth } from "@/lib/auth";
import ProfileImageEditor from "@/components/ProfileImageEditor";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProfileForm from "@/components/ProfileForm";
import UsernameForm from "@/components/UsernameForm";
import UserMenu from "@/components/UserMenu";
import ActivityGraph from "@/components/ActivityGraph";
import ProfileHeader from "@/components/ProfileHeader";
import ProfileBadges from "@/components/ProfileBadges";
import SyncHistoryButton from "@/components/SyncHistoryButton";
import Breadcrumbs from "@/components/Breadcrumbs";
import { getUserBadges } from "@/lib/badge-service";

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
    const session = await auth();

    if (!session || !session.user) {
        redirect("/");
    }

    // Fetch current user data
    const { data: user } = await supabase
        .from("users")
        .select("name, email, image, group_keyword, username, step_goal, is_custom_image") // Added username, step_goal
        .eq("id", (session.user as any).id)
        .single();

    if (!user) {
        console.error("ProfilePage: User not found for ID:", (session.user as any).id);
    }

    // Fetch stats (Total steps, etc.)
    let totalSteps = 0;
    let bestDay = { date: '-', steps: 0 };
    let allHistoryData: any[] = [];
    let userBadges: any[] = [];

    if (user) {
        // Fetch Badges
        userBadges = await getUserBadges((session.user as any).id);

        // Fetch All History

        // Fetch All History
        const { data: allHistory } = await supabase
            .from('daily_steps')
            .select('steps, date')
            .eq("user_id", (session.user as any).id)
            .order('date', { ascending: true }); // Ensure sorted for graph

        if (allHistory && allHistory.length > 0) {
            allHistoryData = allHistory;
            totalSteps = allHistory.reduce((acc, curr) => acc + curr.steps, 0);
            const best = allHistory.reduce((max, curr) => curr.steps > max.steps ? curr : max, { steps: 0, date: '' });
            bestDay = {
                date: new Date(best.date).toLocaleDateString(),
                steps: best.steps
            };
        }
    }



    if (!user) {
        return <div>User not found</div>;
    }



    return (
        <main className="min-h-screen bg-white">
            {/* Rich Header */}
            <header className="bg-indigo-50/80 backdrop-blur-md border-b border-indigo-100 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:opacity-80 transition-opacity">
                                UCFitness
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold tracking-wide uppercase border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
                                Beta
                            </span>
                        </Link>
                    </div>
                    <UserMenu user={session.user} />
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

                <div className="mb-6">
                    <Breadcrumbs items={[{ label: 'Profile' }]} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1 space-y-6 order-last md:order-none">
                        <h2 className="text-2xl font-bold text-gray-900">Profile</h2>
                        <div>
                            <ProfileHeader user={user} badges={userBadges} />

                            <div className="mt-6">
                                <ProfileBadges badges={userBadges} />
                            </div>
                        </div>
                    </div>


                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6 order-first md:order-none">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-gray-900">Your Activity</h2>
                            <SyncHistoryButton />
                        </div>

                        {/* Top Row: Total & Best Day (2 columns on mobile) */}
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                <p className="text-xs sm:text-sm font-medium text-gray-500">Total Steps Recorded</p>
                                <p className="mt-1 text-xl sm:text-3xl font-bold text-gray-900">{totalSteps.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                <p className="text-xs sm:text-sm font-medium text-gray-500">All-time Best Day</p>
                                <div className="mt-1">
                                    <p className="text-xl sm:text-3xl font-bold text-green-600">{bestDay.steps.toLocaleString()}</p>
                                    <p className="text-[10px] sm:text-xs font-medium mt-0.5 text-gray-500">
                                        on {bestDay.date}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Row: Daily / Weekly / Monthly (Single Container, 3 cols) - Compact */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="grid grid-cols-3 divide-x divide-gray-100">
                                {(() => {
                                    const now = new Date();
                                    // JST Adjustment: Add 9 hours to current UTC time to get JST time
                                    // We use this shifted time's UTC components to form the YYYY-MM-DD string
                                    const jstOffset = 9 * 60 * 60 * 1000;
                                    const jstDate = new Date(now.getTime() + jstOffset);

                                    const currentYear = jstDate.getUTCFullYear();
                                    const currentMonth = jstDate.getUTCMonth(); // 0-indexed

                                    const year = jstDate.getUTCFullYear();
                                    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
                                    const day = String(jstDate.getUTCDate()).padStart(2, '0');
                                    const todayYMD = `${year}-${month}-${day}`;

                                    // Week start (Sunday)
                                    // We need "Start of Week" in JST.
                                    const dayOfWeek = jstDate.getUTCDay(); // 0 (Sun) - 6 (Sat)
                                    const startOfWeek = new Date(jstDate);
                                    startOfWeek.setUTCDate(jstDate.getUTCDate() - dayOfWeek);
                                    startOfWeek.setUTCHours(0, 0, 0, 0);

                                    // Previous Week Start
                                    const startOfLastWeek = new Date(startOfWeek);
                                    startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 7);

                                    // Previous Month logic
                                    // currentMonth is 0-indexed.
                                    // If current is Jan (0), prev is Dec (11) of prev year.
                                    const prevMonthDate = new Date(year, currentMonth - 1, 1);
                                    const prevMonthYear = prevMonthDate.getFullYear();
                                    const prevMonthIndex = prevMonthDate.getMonth();

                                    // Logic
                                    let dailySteps = 0;
                                    let weeklySteps = 0;
                                    let monthlySteps = 0;

                                    let prevWeeklySteps = 0;
                                    let prevMonthlySteps = 0;

                                    // Comparison data (dummy for now or strict prev period)
                                    let prevDailySteps = 0; // Yesterday

                                    if (allHistoryData) {
                                        allHistoryData.forEach((record: any) => {
                                            // record.date is "YYYY-MM-DD" string
                                            // We treat this string as if it's JST Date (because it WAS saved as JST date string)

                                            // Simpler Weekly Comparison:
                                            // Convert record.date "YYYY-MM-DD" to a Timestamp that represents that day at 00:00 UTC (effectively treating it as JST-value-but-in-UTC-variable)
                                            // because 'startOfWeek' is also JST-value-but-in-UTC-variable.
                                            const recordDateParts = record.date.split('-').map(Number);
                                            const recordTime = Date.UTC(recordDateParts[0], recordDateParts[1] - 1, recordDateParts[2]);

                                            if (record.date === todayYMD) {
                                                dailySteps += record.steps;
                                            }

                                            // Weekly
                                            if (recordTime >= startOfWeek.getTime()) {
                                                weeklySteps += record.steps;
                                            }
                                            // Previous Weekly
                                            else if (recordTime >= startOfLastWeek.getTime() && recordTime < startOfWeek.getTime()) {
                                                prevWeeklySteps += record.steps;
                                            }

                                            // Monthly
                                            const rYear = recordDateParts[0];
                                            const rMonth = recordDateParts[1] - 1; // 0-indexed
                                            if (rYear === currentYear && rMonth === currentMonth) {
                                                monthlySteps += record.steps;
                                            }
                                            // Previous Monthly
                                            else if (rYear === prevMonthYear && rMonth === prevMonthIndex) {
                                                prevMonthlySteps += record.steps;
                                            }

                                            // Yesterday logic
                                            // Calculate Yesterday YMD from our JST Date
                                            const y = new Date(jstDate);
                                            y.setUTCDate(y.getUTCDate() - 1);
                                            const yy = y.getUTCFullYear();
                                            const ym = String(y.getUTCMonth() + 1).padStart(2, '0');
                                            const yd = String(y.getUTCDate()).padStart(2, '0');
                                            const yesterdayYMD = `${yy}-${ym}-${yd}`;

                                            if (record.date === yesterdayYMD) {
                                                prevDailySteps = record.steps;
                                            }
                                        });
                                    }



                                    // Render Block
                                    const dailyDiff = dailySteps - prevDailySteps;
                                    const weeklyDiff = weeklySteps - prevWeeklySteps;
                                    const monthlyDiff = monthlySteps - prevMonthlySteps;

                                    const formatDiff = (diff: number) => {
                                        return diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
                                    };

                                    return (
                                        <>
                                            <div className="p-3 sm:p-4 text-center">
                                                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Daily</p>
                                                <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{dailySteps.toLocaleString()}</p>
                                                <p className={`text-[10px] font-medium mt-1 ${dailySteps >= prevDailySteps ? 'text-green-600' : 'text-red-500'}`}>
                                                    {dailySteps >= prevDailySteps ? '↑' : '↓'} {formatDiff(dailyDiff)} vs Yest.
                                                </p>
                                            </div>

                                            <div className="p-3 sm:p-4 text-center">
                                                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Weekly</p>
                                                <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{weeklySteps.toLocaleString()}</p>
                                                <p className={`text-[10px] font-medium mt-1 ${weeklySteps >= prevWeeklySteps ? 'text-green-600' : 'text-red-500'}`}>
                                                    {weeklySteps >= prevWeeklySteps ? '↑' : '↓'} {formatDiff(weeklyDiff)} vs L.Wk
                                                </p>
                                            </div>

                                            <div className="p-3 sm:p-4 text-center">
                                                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Monthly</p>
                                                <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{monthlySteps.toLocaleString()}</p>
                                                <p className={`text-[10px] font-medium mt-1 ${monthlySteps >= prevMonthlySteps ? 'text-green-600' : 'text-red-500'}`}>
                                                    {monthlySteps >= prevMonthlySteps ? '↑' : '↓'} {formatDiff(monthlyDiff)} vs L.Mo
                                                </p>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Activity Graph */}
                        <ActivityGraph data={allHistoryData} stepGoal={user.step_goal || 10000} />

                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                            <h3 className="text-lg font-bold mb-2">Keep it up!</h3>
                            <p className="opacity-90">
                                Integrating fitness into your daily routine is the best way to stay healthy.
                                Check back daily to see how you stack up against the competition.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

export const runtime = 'edge';
