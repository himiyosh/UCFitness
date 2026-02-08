

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cookies } from 'next/headers';
import Link from 'next/link';
import ActivityGraph from '@/components/ActivityGraph';
import UserMenu from '@/components/UserMenu';
import ProfileHeader from '@/components/ProfileHeader';
import ProfileBadges from '@/components/ProfileBadges';
import SyncHistoryButton from '@/components/SyncHistoryButton';
import Breadcrumbs from '@/components/Breadcrumbs';
import { notFound } from 'next/navigation';
import { getUserBadges } from "@/lib/badge-service";
import { getEquippedItems } from "@/lib/shop-service";
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

    // Fetch Badges & Equipped Items
    const userBadges = user ? await getUserBadges(user.id) : [];
    const equippedItems = user ? await getEquippedItems(user.id) : { ICON_FRAME: null, TITLE: null, THEME_COLOR: null };
    let frameColor = equippedItems.ICON_FRAME?.shop_items?.preview_value || null;
    const titleName = equippedItems.TITLE?.shop_items?.name_ja || null;
    const titleEmoji = equippedItems.TITLE?.shop_items?.preview_value || null;
    if (frameColor) {
        const colorMap: Record<string, string> = { 'ring-green-400': '#4ade80', 'ring-blue-400': '#60a5fa', 'ring-yellow-400': '#facc15', 'ring-cyan-300': '#67e8f9', 'ring-purple-500': '#a855f7' };
        frameColor = colorMap[frameColor] || '#d1d5db';
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
            <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
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
                            <h2 className="text-2xl font-bold text-gray-900 truncate">{t('profile')}</h2>
                        </div>

                        <ProfileHeader user={user} readonly={true} badges={userBadges} frameColor={frameColor} titleName={titleName} titleEmoji={titleEmoji} />

                        <div className="mt-2">
                            <ProfileBadges badges={userBadges} />
                        </div>

                        {/* Lifetime Stats */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-200">
                            <div className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-xs font-medium text-gray-500">{t('totalStepsRecorded')}</span>
                                <span className="text-sm font-bold text-gray-900 tabular-nums">{totalSteps.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-xs font-medium text-gray-500">{t('allTimeBestDay')}</span>
                                <div className="text-right">
                                    <span className="text-sm font-bold text-green-600 tabular-nums">{bestDay.steps.toLocaleString()}</span>
                                    {bestDay.date !== '-' && <span className="text-[10px] text-gray-400 ml-1.5">{bestDay.date}</span>}
                                </div>
                            </div>
                        </div>

                        {/* Owner: Settings Button */}
                        {isOwner && (
                            <div className="mt-4">
                                <Link
                                    href="/settings"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 hover:border-[var(--theme-primary)]/30 hover:text-[var(--theme-primary)] transition-all shadow-sm group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-400 group-hover:text-[var(--theme-primary)] transition-colors">
                                        <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
                                    </svg>
                                    {t('goToSettings')}
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6 order-first md:order-none">
                        <div className="flex items-center justify-between h-8"> {/* Fixed height for alignment */}
                            <h2 className="text-2xl font-bold text-gray-900">{t('activityTitle', { name: user.name })}</h2>
                            {isOwner && <SyncHistoryButton />}
                        </div>


                        {/* Stats Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            {isOwner || !hasViewerStats ? (
                                /* Owner view: simple centered 3-column */
                                <div className="grid grid-cols-3 divide-x divide-gray-200">
                                    <div className="px-3 py-4 sm:px-5 sm:py-5 text-center">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('today')}</p>
                                        <p className="mt-1 text-xl sm:text-3xl font-black text-gray-900 tabular-nums">{targetStats.daily.toLocaleString()}</p>
                                    </div>
                                    <div className="px-3 py-4 sm:px-5 sm:py-5 text-center">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('thisWeek')}</p>
                                        <p className="mt-1 text-xl sm:text-3xl font-black text-gray-900 tabular-nums">{targetStats.weekly.toLocaleString()}</p>
                                    </div>
                                    <div className="px-3 py-4 sm:px-5 sm:py-5 text-center">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('thisMonth')}</p>
                                        <p className="mt-1 text-xl sm:text-3xl font-black text-gray-900 tabular-nums">{targetStats.monthly.toLocaleString()}</p>
                                    </div>
                                </div>
                            ) : (
                                /* Comparison view: 2-row table with name labels */
                                <>
                                    {/* Column Headers */}
                                    <div className="grid grid-cols-[auto_1fr_1fr_1fr] border-b border-gray-200 bg-gray-50/60">
                                        <div className="w-24 sm:w-32" />
                                        <div className="px-2 py-2 sm:px-3 sm:py-2.5 text-center">
                                            <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">{t('today')}</p>
                                        </div>
                                        <div className="px-2 py-2 sm:px-3 sm:py-2.5 text-center">
                                            <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">{t('thisWeek')}</p>
                                        </div>
                                        <div className="px-2 py-2 sm:px-3 sm:py-2.5 text-center">
                                            <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">{t('thisMonth')}</p>
                                        </div>
                                    </div>
                                    {/* Target User Row */}
                                    <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center">
                                        <div className="w-24 sm:w-32 px-2 sm:px-3 py-3 sm:py-4">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {user.image && (
                                                    <img src={user.image} alt="" className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover flex-shrink-0" />
                                                )}
                                                <p className="text-[11px] sm:text-sm font-bold text-gray-900 leading-tight break-words min-w-0">{user.name || user.username}</p>
                                            </div>
                                        </div>
                                        <div className="px-2 py-3 sm:px-3 sm:py-4 text-center">
                                            <p className="text-lg sm:text-2xl font-black text-gray-900 tabular-nums">{targetStats.daily.toLocaleString()}</p>
                                        </div>
                                        <div className="px-2 py-3 sm:px-3 sm:py-4 text-center">
                                            <p className="text-lg sm:text-2xl font-black text-gray-900 tabular-nums">{targetStats.weekly.toLocaleString()}</p>
                                        </div>
                                        <div className="px-2 py-3 sm:px-3 sm:py-4 text-center">
                                            <p className="text-lg sm:text-2xl font-black text-gray-900 tabular-nums">{targetStats.monthly.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    {/* Viewer (You) Row */}
                                    <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center border-t border-gray-200 bg-gray-50/60">
                                        <div className="w-24 sm:w-32 px-2 sm:px-3 py-3 sm:py-4">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {viewerUser?.image && (
                                                    <img src={viewerUser.image} alt="" className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover flex-shrink-0" />
                                                )}
                                                <p className="text-[11px] sm:text-sm font-bold text-gray-500 leading-tight break-words min-w-0">{t('yourSteps')}</p>
                                            </div>
                                        </div>
                                        <div className="px-2 py-3 sm:px-3 sm:py-4 text-center">
                                            <p className={`text-lg sm:text-2xl font-extrabold tabular-nums ${viewerStats.daily >= targetStats.daily ? 'text-green-500/80' : 'text-red-400/80'}`}>{viewerStats.daily.toLocaleString()}</p>
                                            <p className={`text-[10px] sm:text-xs tabular-nums ${viewerStats.daily >= targetStats.daily ? 'text-green-500/60' : 'text-red-400/60'}`}>
                                                {viewerStats.daily - targetStats.daily >= 0 ? '+' : ''}{(viewerStats.daily - targetStats.daily).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="px-2 py-3 sm:px-3 sm:py-4 text-center">
                                            <p className={`text-lg sm:text-2xl font-extrabold tabular-nums ${viewerStats.weekly >= targetStats.weekly ? 'text-green-500/80' : 'text-red-400/80'}`}>{viewerStats.weekly.toLocaleString()}</p>
                                            <p className={`text-[10px] sm:text-xs tabular-nums ${viewerStats.weekly >= targetStats.weekly ? 'text-green-500/60' : 'text-red-400/60'}`}>
                                                {viewerStats.weekly - targetStats.weekly >= 0 ? '+' : ''}{(viewerStats.weekly - targetStats.weekly).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="px-2 py-3 sm:px-3 sm:py-4 text-center">
                                            <p className={`text-lg sm:text-2xl font-extrabold tabular-nums ${viewerStats.monthly >= targetStats.monthly ? 'text-green-500/80' : 'text-red-400/80'}`}>{viewerStats.monthly.toLocaleString()}</p>
                                            <p className={`text-[10px] sm:text-xs tabular-nums ${viewerStats.monthly >= targetStats.monthly ? 'text-green-500/60' : 'text-red-400/60'}`}>
                                                {viewerStats.monthly - targetStats.monthly >= 0 ? '+' : ''}{(viewerStats.monthly - targetStats.monthly).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
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
