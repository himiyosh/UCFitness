import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProfileForm from "@/components/ProfileForm";
import UsernameForm from "@/components/UsernameForm";
import UserMenu from "@/components/UserMenu";
import ActivityGraph from "@/components/ActivityGraph";
import StepGoalForm from "@/components/StepGoalForm";

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        redirect("/");
    }

    // Fetch current user data
    const { data: user } = await supabase
        .from("users")
        .select("name, email, image, group_keyword, username, step_goal") // Added username, step_goal
        .eq("id", (session.user as any).id)
        .single();

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
        <main className="min-h-screen bg-gray-50 p-8">
            <div className="mx-auto max-w-5xl">
                <div className="mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-indigo-600 hover:text-indigo-500 font-medium flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                            </svg>
                            Back to Dashboard
                        </Link>
                    </div>
                    <UserMenu user={session.user} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1">
                        <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 sticky top-8">
                            <div className="bg-indigo-600 h-32 w-full"></div>
                            <div className="px-6 pb-6 relative">
                                <div className="-mt-16 mb-4 flex justify-center">
                                    {user.image ? (
                                        <img className="h-32 w-32 rounded-full border-4 border-white shadow-md bg-white" src={user.image} alt="" />
                                    ) : (
                                        <div className="h-32 w-32 rounded-full border-4 border-white shadow-md bg-indigo-100 flex items-center justify-center text-4xl font-bold text-indigo-600">
                                            {user.name?.[0] || 'U'}
                                        </div>
                                    )}
                                </div>
                                <div className="text-center mb-6">
                                    <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
                                    <p className="text-sm text-gray-500">@{user.username || 'user'}</p>
                                    {user.group_keyword && (
                                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 mt-2">
                                            Group: {Array.isArray(user.group_keyword) ? user.group_keyword.join(', ') : user.group_keyword}
                                        </span>
                                    )}
                                </div>
                                <div className="border-t border-gray-100 pt-6">
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Daily Goal</p>
                                    <StepGoalForm initialGoal={user.step_goal || 10000} />
                                </div>
                                <div className="border-t border-gray-100 pt-6">
                                    <ProfileForm initialName={user.name || ""} />
                                </div>
                                <div className="border-t border-gray-100 pt-6">
                                    <UsernameForm initialUsername={user.username || ""} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Your Activity</h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                                <p className="text-sm font-medium text-gray-500">Total Steps Recorded</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900">{totalSteps.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                                <p className="text-sm font-medium text-gray-500">All-time Best Day</p>
                                <div className="mt-2 items-baseline flex gap-2">
                                    <p className="text-3xl font-bold text-green-600">{bestDay.steps.toLocaleString()}</p>
                                    <span className="text-sm text-gray-500">on {bestDay.date}</span>
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
