
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import ActivityGraph from "@/components/ActivityGraph";
import ProfileHeader from "@/components/ProfileHeader";

export const dynamic = 'force-dynamic';

export default async function PublicProfilePage(props: { params: Promise<{ username: string }> }) {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    const { username } = params;

    // Fetch target user data
    const { data: user } = await supabase
        .from("users")
        .select("id, name, email, image, group_keyword, username, step_goal, is_custom_image")
        .eq("username", username)
        .single();

    if (!user) {
        notFound();
    }

    // Fetch stats
    let totalSteps = 0;
    let bestDay = { date: '-', steps: 0 };
    let allHistoryData: any[] = [];

    // Fetch All History for target user
    const { data: allHistory } = await supabase
        .from('daily_steps')
        .select('steps, date')
        .eq("user_id", user.id)
        .order('date', { ascending: true });

    if (allHistory && allHistory.length > 0) {
        allHistoryData = allHistory;
        totalSteps = allHistory.reduce((acc, curr) => acc + curr.steps, 0);
        const best = allHistory.reduce((max, curr) => curr.steps > max.steps ? curr : max, { steps: 0, date: '' });
        bestDay = {
            date: new Date(best.date).toLocaleDateString(),
            steps: best.steps
        };
    }

    // Calculate Monthly Steps
    let monthlySteps = 0;
    let monthlyDiff = 0;
    let isUp = false;

    // Monthly Calculation Logic
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const jstDateStr = formatter.format(now);
    const [y, m, d] = jstDateStr.split('-').map(Number);
    const currentYear = y;
    const currentMonth = m - 1; // 0-indexed for comparison
    const currentDay = d;

    // Previous Month Logic
    const prevDate = new Date(currentYear, currentMonth - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth();

    let currentMonthSteps = 0;
    let prevMonthSteps = 0;

    if (allHistoryData) {
        allHistoryData.forEach((record: any) => {
            const dateObj = new Date(record.date);
            const rYear = dateObj.getFullYear();
            const rMonth = dateObj.getMonth();
            const rDay = dateObj.getDate();

            if (rYear === currentYear && rMonth === currentMonth) {
                currentMonthSteps += record.steps;
            }

            if (rYear === prevYear && rMonth === prevMonth && rDay <= currentDay) {
                prevMonthSteps += record.steps;
            }
        });
    }

    monthlySteps = currentMonthSteps;
    monthlyDiff = currentMonthSteps - prevMonthSteps;
    isUp = monthlyDiff >= 0;

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
                    {session?.user && <UserMenu user={session.user} />}
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

                <div className="mb-6">
                    <Link href="/" className="text-gray-500 hover:text-indigo-600 font-medium flex items-center gap-1 w-fit transition-colors group">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 group-hover:-translate-x-1 transition-transform">
                            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                        </svg>
                        Back to Dashboard
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1 space-y-6">
                        {/* Profile Header (Read Only) */}
                        <ProfileHeader user={user} readonly={true} />

                        {/* Navigation Actions for Owner */}
                        {session?.user?.email === user.email && (
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
                                <h3 className="text-sm font-bold text-gray-700">Quick Links</h3>
                                <Link
                                    href="/groups"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.191a.844.844 0 01-.277-.71c.076-.814.237-1.596.454-2.336a4.718 4.718 0 001.974.89c.034.008.069.017.103.025a5.619 5.619 0 01-2.254 2.131zM10.66 14.676a.75.75 0 01-.66 0 4.718 4.718 0 001.974-.89c.217.74.378 1.522.454 2.336a.844.844 0 01-.277.71 5.619 5.619 0 01-2.254-2.131z" />
                                    </svg>
                                    Manage My Groups
                                </Link>
                                <Link
                                    href="/profile"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-50 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors border border-gray-100"
                                >
                                    Edit Profile
                                </Link>
                            </div>
                        )}


                        {/* No Edit Controls or Goal Form for Public View */}
                    </div>

                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-gray-900">{user.name}'s Activity</h2>
                            {/* No Sync Button */}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                                <p className="text-sm font-medium text-gray-500">Total Steps Recorded</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900">{totalSteps.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                                <p className="text-sm font-medium text-gray-500">Monthly Steps (MTD)</p>
                                <div className="mt-2">
                                    <p className="text-3xl font-bold text-gray-900">{monthlySteps.toLocaleString()}</p>
                                    <p className={`text-xs font-medium mt-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                                        {isUp ? '↑' : '↓'} {Math.abs(monthlyDiff).toLocaleString()} vs last month
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                                <p className="text-sm font-medium text-gray-500">All-time Best Day</p>
                                <div className="mt-2">
                                    <p className="text-3xl font-bold text-green-600">{bestDay.steps.toLocaleString()}</p>
                                    <p className="text-xs font-medium mt-1 text-gray-500">
                                        on {bestDay.date}
                                    </p>
                                </div>
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
