import { getServerSession } from "next-auth/next";
import ProfileImageEditor from "@/components/ProfileImageEditor";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProfileForm from "@/components/ProfileForm";
import UsernameForm from "@/components/UsernameForm";
import UserMenu from "@/components/UserMenu";
import ActivityGraph from "@/components/ActivityGraph";
import StepGoalForm from "@/components/StepGoalForm";
import ProfileHeader from "@/components/ProfileHeader";
import SyncHistoryButton from "@/components/SyncHistoryButton";

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
    const session = await getServerSession(authOptions);

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

    if (user) {
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
                    <Link href="/" className="text-gray-500 hover:text-indigo-600 font-medium flex items-center gap-1 w-fit transition-colors group">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 group-hover:-translate-x-1 transition-transform">
                            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                        </svg>
                        Back to Dashboard
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1 space-y-6 order-last md:order-none">
                        <h2 className="text-2xl font-bold text-gray-900">Profile</h2>
                        <div>
                            <ProfileHeader user={user} />

                            <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 p-4">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Daily Goal</p>
                                <StepGoalForm initialGoal={user.step_goal || 10000} />
                            </div>
                        </div>
                    </div>


                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6 order-first md:order-none">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-gray-900">Your Activity</h2>
                            <SyncHistoryButton />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 text-center md:text-left">
                                <p className="text-sm font-medium text-gray-500">Total Steps Recorded</p>
                                <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-bold text-gray-900">{totalSteps.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 text-center md:text-left">
                                <p className="text-sm font-medium text-gray-500">Monthly Steps (MTD)</p>
                                {(() => {
                                    const now = new Date();
                                    const currentMonth = now.getMonth();
                                    const currentYear = now.getFullYear();
                                    const currentDay = now.getDate();

                                    // Calculate previous month
                                    const prevDate = new Date(now);
                                    prevDate.setMonth(now.getMonth() - 1);
                                    const prevMonth = prevDate.getMonth();
                                    const prevYear = prevDate.getFullYear();

                                    let currentMonthSteps = 0;
                                    let prevMonthSteps = 0;

                                    if (allHistoryData) {
                                        allHistoryData.forEach((record: any) => {
                                            const d = new Date(record.date);
                                            const rYear = d.getFullYear();
                                            const rMonth = d.getMonth();
                                            const rDay = d.getDate();

                                            // Current Month
                                            if (rYear === currentYear && rMonth === currentMonth) {
                                                currentMonthSteps += record.steps;
                                            }

                                            // Previous Month (Same Period)
                                            if (rYear === prevYear && rMonth === prevMonth && rDay <= currentDay) {
                                                prevMonthSteps += record.steps;
                                            }
                                        });
                                    }

                                    const diff = currentMonthSteps - prevMonthSteps;
                                    const isUp = diff >= 0;

                                    return (
                                        <div className="mt-1 sm:mt-2">
                                            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{currentMonthSteps.toLocaleString()}</p>
                                            <p className={`text-xs font-medium mt-0.5 sm:mt-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                                                {isUp ? '↑' : '↓'} {Math.abs(diff).toLocaleString()} vs last month
                                            </p>
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 text-center md:text-left">
                                <p className="text-sm font-medium text-gray-500">All-time Best Day</p>
                                <div className="mt-1 sm:mt-2">
                                    <p className="text-2xl sm:text-3xl font-bold text-green-600">{bestDay.steps.toLocaleString()}</p>
                                    <p className="text-xs font-medium mt-0.5 sm:mt-1 text-gray-500">
                                        on {bestDay.date}
                                    </p>
                                </div>
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
