

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cookies } from 'next/headers';
import Link from 'next/link';
import ActivityGraph from '@/components/ActivityGraph';
import UserMenu from '@/components/UserMenu';
import ProfileHeader from '@/components/ProfileHeader';
import Breadcrumbs from '@/components/Breadcrumbs';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PublicProfilePage(props: { params: Promise<{ username: string }> }) {
    const params = await props.params;
    const session = await auth();
    const { username } = params;

    // Fetch target user data
    const { data: user } = await supabase
        .from("users")
        .select("id, name, email, image, group_keyword, username, step_goal, is_custom_image")
        .eq("username", username)
        .single();

    if (user) {
        // Fetch valid public groups for this user
        const { data: publicGroups } = await supabase
            .from('group_members')
            .select('groups!inner(keyword, is_public)')
            .eq('user_id', user.id)
            .eq('groups.is_public', true);

        // Override the denormalized group_keyword with actual public groups
        if (publicGroups) {
            // @ts-ignore
            user.group_keyword = publicGroups.map((g: any) => g.groups.keyword);
        } else {
            user.group_keyword = [];
        }
    }

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

    // --- Stats Calculation (Comparison) ---
    // JST Logic
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD

    // Weekly Start (Mon)
    const currentDate = new Date(`${todayStr}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const monday = new Date(currentDate);
    monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const weeklyStartStr = monday.toISOString().split('T')[0];

    // Monthly Start
    const [year, month] = todayStr.split('-');
    const monthlyStartStr = `${year}-${month}-01`;

    // Target User Stats (In-Memory from allHistory)
    const targetStats = {
        daily: allHistoryData.find((r: any) => r.date === todayStr)?.steps || 0,
        weekly: allHistoryData.filter((r: any) => r.date >= weeklyStartStr).reduce((acc: number, curr: any) => acc + curr.steps, 0),
        monthly: allHistoryData.filter((r: any) => r.date >= monthlyStartStr).reduce((acc: number, curr: any) => acc + curr.steps, 0)
    };

    // Viewer Stats (Fetch if logged in and different user)
    const isOwner = session?.user?.email === user.email;
    let viewerStats = { daily: 0, weekly: 0, monthly: 0 };
    let hasViewerStats = false;

    if (session?.user && !isOwner) {
        const viewerId = (session.user as any).id;
        // Optimization: Fetch from the earliest required date
        // Likely monthlyStart or weeklyStart. If default view is just these 3, we need max range.
        const minDate = weeklyStartStr < monthlyStartStr ? weeklyStartStr : monthlyStartStr;

        const { data: vData } = await supabase
            .from('daily_steps')
            .select('steps, date')
            .eq('user_id', viewerId)
            .gte('date', minDate);

        if (vData) {
            viewerStats.daily = vData.find(r => r.date === todayStr)?.steps || 0;
            viewerStats.weekly = vData.filter(r => r.date >= weeklyStartStr).reduce((acc, curr) => acc + curr.steps, 0);
            viewerStats.monthly = vData.filter(r => r.date >= monthlyStartStr).reduce((acc, curr) => acc + curr.steps, 0);
            hasViewerStats = true;
        }
    }

    return (
        <main className="min-h-screen bg-white">
            {/* ... Header and Nav (unchanged) ... */}
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
                    <Breadcrumbs items={[{ label: user.name || username }]} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1 space-y-6 order-last md:order-none">
                        <ProfileHeader user={user} readonly={true} />

                        {/* Comparison/Owner Actions */}
                        {isOwner ? (
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
                                <h3 className="text-sm font-bold text-gray-700">Quick Links</h3>
                                <Link
                                    href="/groups"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.191a.844.844 0 01-.277-.71c.076-.814.237-1.596.454-2.336a4.718 4.718 0 001.974.89c.034.008.069.017.103.025a5.619 5.619 0 01-2.254 2.131zM10.66 14.676a.75.75 0 01-.66 0 4.718 4.718 0 001.974-.89c.217.74.378 1.522.454 2.336a.844.844 0 01-.277.71 5.619 5.619 0 01-2.254 2.131z" />
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
                        ) : (
                            // Maybe add a "Friend Request" button later?
                            <div className="hidden"></div>
                        )}
                    </div>

                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6 order-first md:order-none">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-gray-900">{user.name}'s Activity</h2>
                        </div>

                        {/* New Comparison Stats Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                            {/* Daily */}
                            <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Today</p>
                                <div className="mt-2">
                                    <p className="text-3xl font-black text-gray-900">{targetStats.daily.toLocaleString()}</p>
                                    {!isOwner && hasViewerStats && (
                                        <p className={`text-xs font-bold mt-1 ${viewerStats.daily - targetStats.daily >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {viewerStats.daily - targetStats.daily >= 0 ? '+' : ''}{(viewerStats.daily - targetStats.daily).toLocaleString()} vs {user.name || user.username}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Weekly */}
                            <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">This Week</p>
                                <div className="mt-2">
                                    <p className="text-3xl font-black text-gray-900">{targetStats.weekly.toLocaleString()}</p>
                                    {!isOwner && hasViewerStats && (
                                        <p className={`text-xs font-bold mt-1 ${viewerStats.weekly - targetStats.weekly >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {viewerStats.weekly - targetStats.weekly >= 0 ? '+' : ''}{(viewerStats.weekly - targetStats.weekly).toLocaleString()} vs {user.name || user.username}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Monthly */}
                            <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">This Month</p>
                                <div className="mt-2">
                                    <p className="text-3xl font-black text-gray-900">{targetStats.monthly.toLocaleString()}</p>
                                    {!isOwner && hasViewerStats && (
                                        <p className={`text-xs font-bold mt-1 ${viewerStats.monthly - targetStats.monthly >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {viewerStats.monthly - targetStats.monthly >= 0 ? '+' : ''}{(viewerStats.monthly - targetStats.monthly).toLocaleString()} vs {user.name || user.username}
                                        </p>
                                    )}
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

export const runtime = 'edge';
