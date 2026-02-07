

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cookies } from 'next/headers';
import Link from 'next/link';
import ActivityGraph from '@/components/ActivityGraph';
import UserMenu from '@/components/UserMenu';
import ProfileHeader from '@/components/ProfileHeader';
import ProfileBadges from '@/components/ProfileBadges';
import Breadcrumbs from '@/components/Breadcrumbs';
import { notFound } from 'next/navigation';
import { getUserBadges } from "@/lib/badge-service";
import { getTranslations } from "next-intl/server";




export const dynamic = 'force-dynamic';

export default async function PublicProfilePage(props: { params: Promise<{ username: string }> }) {
    const params = await props.params;
    const session = await auth();
    const { username } = params;
    const t = await getTranslations('Profile');
    const commonT = await getTranslations('Common');
    const dashboardT = await getTranslations('Dashboard');

    // Fetch target user data
    const { data: user } = await supabase
        .from("users")
        .select("id, name, email, image, group_keyword, username, step_goal, is_custom_image, banner_url")
        .eq("username", username)
        .single();

    let primaryGroup: any = undefined;

    if (user) {
        // Fetch valid public groups for this user
        const { data: publicGroups } = await supabase
            .from('group_members')
            .select('groups!inner(keyword, is_public, name, header_image_url, image_url)')
            .eq('user_id', user.id)
            .eq('groups.is_public', true);

        // Override the denormalized group_keyword with actual public groups
        if (publicGroups) {
            // @ts-ignore
            user.group_keyword = publicGroups.map((g: any) => g.groups.keyword);
            // @ts-ignore
            primaryGroup = publicGroups[0]?.groups;
        } else {
            user.group_keyword = [];
        }
    }

    // Fetch Badges
    const userBadges = user ? await getUserBadges(user.id) : [];

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
    let viewerUser = session?.user; // Default to session user

    if (session?.user && !isOwner) {
        const viewerId = (session.user as any).id;

        // Fetch viewer's fresh data (image) to ensure header is correct
        const { data: vUser } = await supabase
            .from("users")
            .select("name, image, username")
            .eq("id", viewerId)
            .single();

        if (vUser) {
            viewerUser = {
                ...session.user,
                name: vUser.name || session.user.name,
                image: vUser.image || session.user.image,
                // @ts-ignore
                username: vUser.username || (session.user as any).username,
            };
        }

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
    } else if (isOwner && user) {
        // If owner, we already have fresh user data
        viewerUser = {
            ...session?.user,
            name: user.name,
            image: user.image,
            // @ts-ignore
            username: user.username
        };
    }

    return (
        <main className="min-h-screen bg-[var(--theme-page-bg)]">
            {/* ... Header and Nav ... */}
            <header className="bg-white/80 backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity">
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    {/* Use updated viewerUser for correct image */}
                    {session?.user && viewerUser && <UserMenu user={viewerUser} />}
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

                <div className="mb-6">
                    <Breadcrumbs items={[{ label: user.name || username }]} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1 space-y-6 order-last md:order-none">
                        {/* Heading for alignment */}
                        <div className="flex items-center justify-between h-8"> {/* Fixed height for alignment */}
                            <h2 className="text-2xl font-bold text-gray-900 truncate">{user.name || username}</h2>
                        </div>

                        <ProfileHeader user={user} readonly={true} badges={userBadges} />

                        <div className="mt-2">
                            <ProfileBadges badges={userBadges} />
                        </div>

                        {/* Comparison/Owner Actions */}
                        {isOwner ? (
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
                                <h3 className="text-sm font-bold text-gray-700">{t('quickLinks')}</h3>
                                <Link
                                    href="/groups"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--theme-primary-light)] text-[var(--theme-primary)] rounded-lg text-sm font-bold hover:bg-[var(--theme-primary)]/20 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
                                    </svg>
                                    {t('manageGroups')}
                                </Link>
                                <Link
                                    href="/profile"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-50 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors border border-gray-100"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400">
                                        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                    </svg>
                                    {t('editProfile')}
                                </Link>
                            </div>
                        ) : (
                            // Maybe add a "Friend Request" button later?
                            <div className="hidden"></div>
                        )}
                    </div>

                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6 order-first md:order-none">
                        <div className="flex items-center justify-between h-8"> {/* Fixed height for alignment */}
                            <h2 className="text-2xl font-bold text-gray-900">{t('activityTitle', { name: user.name })}</h2>
                        </div>


                        {/* Comparison Stats Grid */}
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                <p className="text-xs sm:text-sm font-medium text-gray-500">{t('totalStepsRecorded')}</p>
                                <p className="mt-1 text-xl sm:text-3xl font-bold text-gray-900">{totalSteps.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                <p className="text-xs sm:text-sm font-medium text-gray-500">{t('allTimeBestDay')}</p>
                                <div className="mt-1">
                                    <p className="text-xl sm:text-3xl font-bold text-green-600">{bestDay.steps.toLocaleString()}</p>
                                    <p className="text-[10px] sm:text-xs font-medium mt-0.5 text-gray-500">
                                        {bestDay.date !== '-' ? t('onDate', { date: bestDay.date }) : '-'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* New Comparison Stats Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                            {/* Daily */}
                            <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('today')}</p>
                                <div className="mt-2">
                                    <p className="text-3xl font-black text-gray-900">{targetStats.daily.toLocaleString()}</p>
                                    {!isOwner && hasViewerStats && (
                                        <p className={`text-xs font-bold mt-1 ${viewerStats.daily - targetStats.daily >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {viewerStats.daily - targetStats.daily >= 0 ? '+' : ''}{(viewerStats.daily - targetStats.daily).toLocaleString()} {t('vsUser', { name: user.name || user.username })}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Weekly */}
                            <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('thisWeek')}</p>
                                <div className="mt-2">
                                    <p className="text-3xl font-black text-gray-900">{targetStats.weekly.toLocaleString()}</p>
                                    {!isOwner && hasViewerStats && (
                                        <p className={`text-xs font-bold mt-1 ${viewerStats.weekly - targetStats.weekly >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {viewerStats.weekly - targetStats.weekly >= 0 ? '+' : ''}{(viewerStats.weekly - targetStats.weekly).toLocaleString()} {t('vsUser', { name: user.name || user.username })}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Monthly */}
                            <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('thisMonth')}</p>
                                <div className="mt-2">
                                    <p className="text-3xl font-black text-gray-900">{targetStats.monthly.toLocaleString()}</p>
                                    {!isOwner && hasViewerStats && (
                                        <p className={`text-xs font-bold mt-1 ${viewerStats.monthly - targetStats.monthly >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {viewerStats.monthly - targetStats.monthly >= 0 ? '+' : ''}{(viewerStats.monthly - targetStats.monthly).toLocaleString()} {t('vsUser', { name: user.name || user.username })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Activity Graph */}
                        <ActivityGraph
                            data={allHistoryData}
                            stepGoal={user.step_goal || 10000}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}

export const runtime = 'edge';
