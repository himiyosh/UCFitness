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
import { getTranslations } from "next-intl/server";

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
    const session = await auth();
    const t = await getTranslations('Profile');
    const dashboardT = await getTranslations('Dashboard');

    if (!session || !session.user) {
        redirect("/");
    }

    // Fetch current user data
    const { data: user } = await supabase
        .from("users")
        .select("name, email, image, group_keyword, username, step_goal, is_custom_image, banner_url") // Added username, step_goal, banner_url
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
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold tracking-wide uppercase border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    <UserMenu user={{
                        ...session.user,
                        name: user?.name || session.user.name,
                        image: user?.image || session.user.image
                    }} />
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

                <div className="mb-6">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1 space-y-6 order-last md:order-none">
                        <h2 className="text-2xl font-bold text-gray-900">{t('title')}</h2>
                        <div>
                            <ProfileHeader user={user} badges={userBadges} />

                            <div className="mt-6">
                                <ProfileBadges badges={userBadges} />
                            </div>

                            <div className="mt-4">
                                <Link
                                    href="/settings"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transition-colors">
                                        <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
                                    </svg>
                                    {t('goToSettings')}
                                </Link>
                            </div>
                        </div>
                    </div>


                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6 order-first md:order-none">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-gray-900">{t('activityTitle')}</h2>
                            <SyncHistoryButton />
                        </div>

                        {/* Top Row: Total & Best Day (2 columns on mobile) */}
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                <p className="text-xs sm:text-sm font-medium text-gray-500">{t('totalStepsRecorded')}</p>
                                <p className="mt-1 text-xl sm:text-3xl font-bold text-gray-900">{totalSteps.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                <p className="text-xs sm:text-sm font-medium text-gray-500">{t('allTimeBestDay')}</p>
                                <div className="mt-1">
                                    <p className="text-xl sm:text-3xl font-bold text-green-600">{bestDay.steps.toLocaleString()}</p>
                                    <p className="text-[10px] sm:text-xs font-medium mt-0.5 text-gray-500">
                                        {t('onDate', { date: bestDay.date })}
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
                                                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('daily')}</p>
                                                <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{dailySteps.toLocaleString()}</p>
                                                <p className={`text-[10px] font-medium mt-1 ${dailySteps >= prevDailySteps ? 'text-green-600' : 'text-red-500'}`}>
                                                    {dailySteps >= prevDailySteps ? '↑' : '↓'} {formatDiff(dailyDiff)} {t('vsYest')}
                                                </p>
                                            </div>

                                            <div className="p-3 sm:p-4 text-center">
                                                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('weekly')}</p>
                                                <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{weeklySteps.toLocaleString()}</p>
                                                <p className={`text-[10px] font-medium mt-1 ${weeklySteps >= prevWeeklySteps ? 'text-green-600' : 'text-red-500'}`}>
                                                    {weeklySteps >= prevWeeklySteps ? '↑' : '↓'} {formatDiff(weeklyDiff)} {t('vsLWk')}
                                                </p>
                                            </div>

                                            <div className="p-3 sm:p-4 text-center">
                                                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('monthly')}</p>
                                                <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{monthlySteps.toLocaleString()}</p>
                                                <p className={`text-[10px] font-medium mt-1 ${monthlySteps >= prevMonthlySteps ? 'text-green-600' : 'text-red-500'}`}>
                                                    {monthlySteps >= prevMonthlySteps ? '↑' : '↓'} {formatDiff(monthlyDiff)} {t('vsLMo')}
                                                </p>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="hidden md:flex bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-4 items-center gap-4 text-white shadow-lg shadow-indigo-200 relative overflow-hidden group">
                            {/* Decorative Background */}
                            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors"></div>
                            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>

                            <div className="relative z-10 p-3 bg-white/20 backdrop-blur-sm rounded-xl shrink-0 border border-white/20 shadow-inner">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>

                            <div className="relative z-10">
                                <h3 className="font-bold text-base mb-0.5 tracking-tight">{t('keepItUp')}</h3>
                                <p className="text-xs sm:text-sm opacity-90 leading-relaxed font-medium">
                                    {t('keepItUpDesc')}
                                </p>
                            </div>
                        </div>

                        {/* Activity Graph */}
                        <ActivityGraph data={allHistoryData} stepGoal={user.step_goal || 10000} />


                    </div>
                </div>
            </div>
        </main>
    );
}

export const runtime = 'edge';
