export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import Link from 'next/link';
import ActivityGraph from '@/components/ActivityGraph';
import UserMenu from '@/components/UserMenu';
import ProfileHeader from '@/components/ProfileHeader';
import ProfileBadges from '@/components/ProfileBadges';
import AchievementProgress from '@/components/AchievementProgress';
import RefreshButton from '@/components/RefreshButton';
import Breadcrumbs from '@/components/Breadcrumbs';
import { notFound } from 'next/navigation';
import { getUserBadges } from "@/lib/badge-service";
import { getEquippedItems } from "@/lib/shop-service";
import { getRankings } from "@/lib/ranking-service";
import { getTranslations } from "next-intl/server";
import RecommendedItems from '@/components/RecommendedItems';
import StepCalendar from '@/components/StepCalendar';
import FollowButtonWrapper from '@/components/FollowButtonWrapper';
import AchievementCard from '@/components/AchievementCard';
import ShareMilestone from '@/components/ShareMilestone';
import AdSlot from '@/components/AdSlot';
import Footer from '@/components/Footer';




export const dynamic = 'force-dynamic';

export default async function PublicProfilePage(props: { params: Promise<{ username: string; locale: string }> }) {
    const params = await props.params;
    const session = await auth();
    const { username, locale } = params;
    const t = await getTranslations('Profile');
    const commonT = await getTranslations('Common');
    const dashboardT = await getTranslations('Dashboard');

    // Fetch target user data
    // 🛡️ Sentinel: email を除外して PII 漏洩を防止
    const { data: user } = await supabaseAdmin
        .from("users")
        .select("id, name, image, group_keyword, username, step_goal, is_custom_image, banner_url")
        .eq("username", username)
        .single();

    if (!user) {
        notFound();
    }

    // ⚡ パフォーマンス: 独立クエリを並列実行
    // 📊 歩数データは Supabase PostgREST 1000行制限回避のため、直近400日 + 集計クエリに分割
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 400);
    const recentDateStr = recentDate.toISOString().split('T')[0];

    const [publicGroupsResult, userBadges, equippedItems, recommendedResult, recentHistoryResult, statsResult] = await Promise.all([
        supabaseAdmin
            .from('group_members')
            .select('groups!inner(keyword, is_public, name, header_image_url, image_url)')
            .eq('user_id', user.id)
            .eq('groups.is_public', true),
        getUserBadges(user.id),
        getEquippedItems(user.id),
        supabaseAdmin
            .from('recommended_items')
            .select('id, asin, title, image_url, affiliate_link, display_order')
            .eq('user_id', user.id)
            .order('display_order', { ascending: true })
            .limit(6),
        // 直近400日分の歩数データ（グラフ表示 + 今日/今週/今月の計算用）
        supabaseAdmin
            .from('daily_steps')
            .select('steps, date, updated_at')
            .eq("user_id", user.id)
            .gte('date', recentDateStr)
            .order('date', { ascending: true }),
        // 全期間の集計データ（totalSteps, bestDay, lastSynced）
        supabaseAdmin
            .rpc('get_user_step_stats', { p_user_id: user.id }),
    ]);

    let primaryGroup: any = undefined;
    const publicGroups = publicGroupsResult.data;

    // Override the denormalized group_keyword with actual public groups
    if (publicGroups) {
        // @ts-ignore
        user.group_keyword = publicGroups.map((g: any) => g.groups.keyword);
        // @ts-ignore
        primaryGroup = publicGroups[0]?.groups;
    } else {
        user.group_keyword = [];
    }
    let frameColor = equippedItems.ICON_FRAME?.shop_items?.preview_value || null;
    const titleName = (locale === 'ja'
        ? equippedItems.TITLE?.shop_items?.name_ja
        : equippedItems.TITLE?.shop_items?.name_en) || null;
    const titleEmoji = equippedItems.TITLE?.shop_items?.preview_value || null;
    if (frameColor) {
        const colorMap: Record<string, string> = { 'ring-green-400': '#4ade80', 'ring-blue-400': '#60a5fa', 'ring-yellow-400': '#facc15', 'ring-cyan-300': '#67e8f9', 'ring-purple-500': '#a855f7' };
        frameColor = colorMap[frameColor] || '#d1d5db';
    }

    // Fetch recommended items
    const rawRecommendedItems = recommendedResult.data;

    // アフィリエイトリンクのパートナータグを常に最新に置換
    const currentTag = process.env.AMAZON_PARTNER_TAG || 'studio344-22';
    const recommendedItems = rawRecommendedItems?.map(item => ({
        ...item,
        affiliate_link: item.affiliate_link.replace(/tag=[^&]+/, `tag=${currentTag}`),
        image_url: item.image_url.replace(/tag=[^&]+/, `tag=${currentTag}`),
    })) ?? null;

    // Fetch stats
    let totalSteps = 0;
    let bestDay = { date: '-', steps: 0 };
    let allHistoryData: any[] = [];
    let lastSyncedAt: string | null = null;

    // 集計データ（RPC から取得 — PostgREST 1000行制限を回避）
    // RPC が配列で返る場合と直接オブジェクトで返る場合の両方に対応
    const rawStats = statsResult.data;
    const statsData = Array.isArray(rawStats) ? rawStats[0] : rawStats;
    if (statsData) {
        totalSteps = statsData.total_steps || 0;
        bestDay = {
            date: statsData.best_date ? new Date(statsData.best_date).toLocaleDateString() : '-',
            steps: statsData.best_steps || 0
        };
        lastSyncedAt = statsData.last_synced || null;
    }

    // 直近の歩数データ（グラフ + 今日/今週/今月の計算用）
    const recentHistory = recentHistoryResult.data;
    if (recentHistory && recentHistory.length > 0) {
        allHistoryData = recentHistory;
    }

    // ランキング順位を取得
    let userWeeklyRank: number | null = null;
    try {
        const weeklyRankings = await getRankings('GLOBAL', 'WEEKLY');
        const rankIndex = weeklyRankings.findIndex((r: any) => r.users?.id === user.id);
        if (rankIndex >= 0) userWeeklyRank = rankIndex + 1;
    } catch (e) {
        // ランキング取得失敗時は表示しない
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
    // 🛡️ Sentinel: email ではなく ID で所有者判定
    const isOwner = (session?.user as any)?.id === user.id;
    let viewerStats = { daily: 0, weekly: 0, monthly: 0 };
    let hasViewerStats = false;
    let viewerUser = session?.user; // Default to session user
    let viewerHistoryData: any[] = []; // グラフ比較用

    if (session?.user && !isOwner) {
        const viewerId = (session.user as any).id;

        // Fetch viewer's fresh data (image) to ensure header is correct
        const { data: vUser } = await supabaseAdmin
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

        // グラフ比較に必要なため、閲覧者の直近400日分を取得（PostgREST 1000行制限回避）
        const { data: vData } = await supabaseAdmin
            .from('daily_steps')
            .select('steps, date')
            .eq('user_id', viewerId)
            .gte('date', recentDateStr)
            .order('date', { ascending: true });

        if (vData) {
            viewerHistoryData = vData;
            viewerStats.daily = vData.find(r => r.date === todayStr)?.steps || 0;
            viewerStats.weekly = vData.filter(r => r.date >= weeklyStartStr).reduce((acc, curr) => acc + curr.steps, 0);
            viewerStats.monthly = vData.filter(r => r.date >= monthlyStartStr).reduce((acc, curr) => acc + curr.steps, 0);
            hasViewerStats = true;
        }
    } else if (isOwner && user) {
        // If owner, we already have fresh user data
        viewerUser = {
            ...session!.user,
            name: user.name,
            image: user.image,
            username: user.username
        };
    }

    return (
        <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
            {/* ... Header and Nav ... */}
            <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: '"Inter", sans-serif' }}>
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    {/* Use updated viewerUser for correct image */}
                    <div className="flex items-center gap-1">
                        {session?.user && <RefreshButton />}
                        {session?.user && viewerUser && <UserMenu user={viewerUser} />}
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

                <div className="mb-6">
                    <Breadcrumbs items={[{ label: user.name || username }]} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1 space-y-6 order-last md:order-none">
                        {/* Heading for alignment — hidden on mobile since profile card is self-explanatory */}
                        <div className="hidden md:flex items-center justify-between h-8">
                            <h2 className="text-2xl font-bold text-gray-900 truncate">{t('profile')}</h2>
                        </div>

                        <ProfileHeader user={user} readonly={true} badges={userBadges} frameColor={frameColor} titleName={titleName} titleEmoji={titleEmoji}>
                            <ShareMilestone totalSteps={totalSteps} username={username} isOwner={isOwner} />
                        </ProfileHeader>

                        {/* フォローボタン（他ユーザーのプロフィール閲覧時のみ表示） */}
                        {session?.user && !isOwner && (
                            <div className="flex justify-center mt-3">
                                <FollowButtonWrapper targetUserId={user.id} />
                            </div>
                        )}

                        <div className="mt-2">
                            <ProfileBadges badges={userBadges} />
                        </div>

                        {/* アチーブメント進捗表示 */}
                        <div className="mt-2">
                            <AchievementProgress userId={user.id} />
                        </div>

                        {/* 公開実績カード */}
                        <div className="mt-2">
                            <AchievementCard username={username} />
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
                            {userWeeklyRank && (
                                <div className="flex items-center justify-between px-4 py-2.5">
                                    <span className="text-xs font-medium text-gray-500">{t('weeklyRank')}</span>
                                    <span className="text-sm font-bold text-[var(--theme-primary)] tabular-nums">#{userWeeklyRank}</span>
                                </div>
                            )}
                            {lastSyncedAt && (
                                <div className="flex items-center justify-between px-4 py-2.5">
                                    <span className="text-xs font-medium text-gray-500">{t('lastSynced')}</span>
                                    <span className="text-[11px] text-gray-400">{(() => {
                                        const diff = Date.now() - new Date(lastSyncedAt).getTime();
                                        const mins = Math.floor(diff / 60000);
                                        if (mins < 1) return 'Just now';
                                        if (mins < 60) return `${mins}m ago`;
                                        const hrs = Math.floor(mins / 60);
                                        if (hrs < 24) return `${hrs}h ago`;
                                        const days = Math.floor(hrs / 24);
                                        return `${days}d ago`;
                                    })()}</span>
                                </div>
                            )}
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
                        <div className="flex items-center justify-between gap-2"> {/* gap for spacing */}
                            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
                                {isOwner ? t('activityTitle') : t('activityTitleOther')}
                            </h2>

                        </div>


                        {/* Stats Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            {isOwner || !hasViewerStats ? (
                                /* Owner view: simple centered 3-column */
                                <>
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
                                {/* Goal Progress Bar */}
                                {(user.step_goal || 10000) > 0 && (
                                    <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t('goalProgress', { goal: (user.step_goal || 10000).toLocaleString() })}</span>
                                            <span className="text-[10px] font-bold text-gray-500 tabular-nums">{Math.min(100, Math.round((targetStats.daily / (user.step_goal || 10000)) * 100))}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${targetStats.daily >= (user.step_goal || 10000) ? 'bg-green-500' : 'bg-[var(--theme-primary)]'}`}
                                                style={{ width: `${Math.min(100, (targetStats.daily / (user.step_goal || 10000)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                </>
                            ) : (
                                /* Comparison view: 2-row table with name labels */
                                <>
                                    {/* Column Headers */}
                                    <div className="grid grid-cols-[auto_1fr_1fr_1fr] border-b border-gray-200 bg-gray-50/60">
                                        <div className="w-20 sm:w-28" />
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
                                        <div className="w-20 sm:w-28 px-2 sm:px-3 py-3 sm:py-4">
                                            <div className="flex flex-col items-center gap-0.5 min-w-0">
                                                {user.image && (
                                                    <img src={user.image} alt="" className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover flex-shrink-0" />
                                                )}
                                                <p className="text-[10px] sm:text-xs font-bold text-gray-900 leading-tight text-center min-w-0">{t('thisUser')}</p>
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
                                    {/* Viewer (You) Row — subdued */}
                                    <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center border-t border-gray-100 bg-gray-50/40">
                                        <div className="w-20 sm:w-28 px-2 sm:px-3 py-2 sm:py-2.5">
                                            <div className="flex flex-col items-center gap-0.5 min-w-0">
                                                {viewerUser?.image && (
                                                    <img src={viewerUser.image} alt="" className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover flex-shrink-0 opacity-70" />
                                                )}
                                                <p className="text-[9px] sm:text-xs font-semibold text-gray-400 leading-tight text-center min-w-0">{t('yourSteps')}</p>
                                            </div>
                                        </div>
                                        <div className="px-2 py-2 sm:px-3 sm:py-2.5 text-center">
                                            <p className={`text-sm sm:text-base font-semibold tabular-nums ${viewerStats.daily >= targetStats.daily ? 'text-green-500/70' : 'text-red-400/70'}`}>{viewerStats.daily.toLocaleString()}</p>
                                            <p className={`text-[9px] sm:text-[10px] tabular-nums ${viewerStats.daily >= targetStats.daily ? 'text-green-500/50' : 'text-red-400/50'}`}>
                                                ({viewerStats.daily - targetStats.daily >= 0 ? '▲' : '▼'}{Math.abs(viewerStats.daily - targetStats.daily).toLocaleString()})
                                            </p>
                                        </div>
                                        <div className="px-2 py-2 sm:px-3 sm:py-2.5 text-center">
                                            <p className={`text-sm sm:text-base font-semibold tabular-nums ${viewerStats.weekly >= targetStats.weekly ? 'text-green-500/70' : 'text-red-400/70'}`}>{viewerStats.weekly.toLocaleString()}</p>
                                            <p className={`text-[9px] sm:text-[10px] tabular-nums ${viewerStats.weekly >= targetStats.weekly ? 'text-green-500/50' : 'text-red-400/50'}`}>
                                                ({viewerStats.weekly - targetStats.weekly >= 0 ? '▲' : '▼'}{Math.abs(viewerStats.weekly - targetStats.weekly).toLocaleString()})
                                            </p>
                                        </div>
                                        <div className="px-2 py-2 sm:px-3 sm:py-2.5 text-center">
                                            <p className={`text-sm sm:text-base font-semibold tabular-nums ${viewerStats.monthly >= targetStats.monthly ? 'text-green-500/70' : 'text-red-400/70'}`}>{viewerStats.monthly.toLocaleString()}</p>
                                            <p className={`text-[9px] sm:text-[10px] tabular-nums ${viewerStats.monthly >= targetStats.monthly ? 'text-green-500/50' : 'text-red-400/50'}`}>
                                                ({viewerStats.monthly - targetStats.monthly >= 0 ? '▲' : '▼'}{Math.abs(viewerStats.monthly - targetStats.monthly).toLocaleString()})
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
                            comparisonData={!isOwner && hasViewerStats ? viewerHistoryData : undefined}
                            comparisonLabel={!isOwner && hasViewerStats ? (t('yourSteps') as string) : undefined}
                        />

                        {/* Step Heatmap Calendar */}
                        <StepCalendar userId={user.id} />

                        {/* Recommended Items — 愛用アイテム */}
                        {(isOwner || (recommendedItems && recommendedItems.length > 0)) && (
                            <RecommendedItems
                                items={recommendedItems || []}
                                isOwner={isOwner}
                                locale={locale}
                            />
                        )}

                        {/* 広告スロット（将来のAdSense用） */}
                        <AdSlot slot="content-between" />
                    </div>
                </div>
            </div>
            <Footer />
        </main>
    );
}

