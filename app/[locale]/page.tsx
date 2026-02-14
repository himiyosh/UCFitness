export const runtime = 'edge';

import { supabaseAdmin } from '@/lib/supabase';
import { Link } from '@/navigation';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import AuthButtons from '@/components/AuthButtons';
import RefreshButton from '@/components/RefreshButton';
import UserMenu from '@/components/UserMenu';
import { auth } from "@/lib/auth";
import { getAllRankings, getAllGroupRankings, getCachedGlobalRankings, deriveBatchGroupRankings } from '@/lib/ranking-service';
import { getCachedCombinedGroupCompetitionRankings } from '@/lib/group-ranking-service';
import nextDynamic from 'next/dynamic';
import { RankingEntry, enrichRankingsWithEquip, optimizeRankingsForPayload, enrichAllGroupRankingsWithEquip } from '@/lib/ranking-utils';
import AutoSync from '@/components/AutoSync';
import LandingPage from '@/components/LandingPage';
import { Period } from '@/components/LeaderboardTabs';

// ⚡ パフォーマンス: 重いクライアントコンポーネントを遅延読み込み
const AnimatedLeaderboard = nextDynamic(() => import('@/components/AnimatedLeaderboard'));
const GoalProgressChart = nextDynamic(() => import('@/components/GoalProgressChart'));
const RunnerAnimation = nextDynamic(() => import('@/components/RunnerAnimation'));
const StepCalendar = nextDynamic(() => import('@/components/StepCalendar'));
const LoginBonusToast = nextDynamic(() => import('@/components/LoginBonusToast'));
const DashboardChallenges = nextDynamic(() => import('@/components/DashboardChallenges'));
const TrendingGear = nextDynamic(() => import('@/components/TrendingGear'));
const DailyMissions = nextDynamic(() => import('@/components/DailyMissions'));
const FollowingPanel = nextDynamic(() => import('@/components/FollowingPanel'));

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth();
  const t = await getTranslations('Dashboard');

  if (!session?.user) {
    return <LandingPage />;
  }

  let groupKeywords: string[] = [];
  let username: string | undefined;
  let mySteps = 0;
  let yesterdaySteps = 0;
  let lastWeekSteps = 0;
  let lastMonthSteps = 0;
  let stepGoal = 10000;
  let bannerUrl: string | null | undefined;

  if (session?.user && (session.user as any).id) {
    const userId = (session.user as any).id;

    // Use JST (date calculations are synchronous — compute before queries)
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstDate.toISOString().split('T')[0];
    const yesterdayDate = new Date(jstDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    const currentDate = new Date(`${today}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay();
    const daysToSubtract = (utcDay + 6) % 7;
    const thisWeekMonday = new Date(currentDate);
    thisWeekMonday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const thisWeekStartStr = thisWeekMonday.toISOString().split('T')[0];
    const lastWeekMonday = new Date(thisWeekMonday);
    lastWeekMonday.setUTCDate(thisWeekMonday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];
    const [y, m] = today.split('-');
    const thisMonthStartStr = `${y}-${m}-01`;
    const thisMonthDate = new Date(`${thisMonthStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // ⚡ パフォーマンス: 3つの独立クエリを並列実行（逐次→並列で ~3x 高速化）
    const [userResult, membershipResult, stepsResult] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('username, step_goal, banner_url, image, name')
        .eq('id', userId)
        .single(),
      supabaseAdmin
        .from('group_members')
        .select('groups(keyword)')
        .eq('user_id', userId),
      supabaseAdmin
        .from('daily_steps')
        .select('steps, date')
        .eq('user_id', userId)
        .gte('date', lastMonthStartStr),
    ]);

    const userData = userResult.data;
    const memberships = membershipResult.data;
    const userStepsData = stepsResult.data;

    stepGoal = userData?.step_goal || 10000;
    username = userData?.username;
    bannerUrl = userData?.banner_url;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groupKeywords = memberships?.map((m: any) => m.groups?.keyword).filter(Boolean) || [];

    // レガシー users.group_keyword をサイレント同期 (他機能の整合性維持)
    supabaseAdmin
      .from('users')
      .update({ group_keyword: groupKeywords })
      .eq('id', userId)
      .then(
        () => {/* fire-and-forget */},
        (err: unknown) => console.error('[group_keyword sync]', err)
      );

    // Override session image with fresh DB image if available
    if (userData) {
      if (session.user) {
        if (userData.image) session.user.image = userData.image;
        if (userData.name) session.user.name = userData.name;
      }
    }

    // Redirect to setup if username is missing
    if (!userData?.username) {
      redirect('/setup');
    }

    // Process results in memory
    const stepsMap = new Map<string, number>();
    userStepsData?.forEach(row => {
      stepsMap.set(row.date, row.steps);
    });

    mySteps = stepsMap.get(today) || 0;
    yesterdaySteps = stepsMap.get(yesterday) || 0;

    lastWeekSteps = (userStepsData ?? []).filter(row => row.date >= lastWeekStartStr && row.date < thisWeekStartStr)
      .reduce((sum, row) => sum + row.steps, 0) || 0;

    lastMonthSteps = (userStepsData ?? []).filter(row => row.date >= lastMonthStartStr && row.date < thisMonthStartStr)
      .reduce((sum, row) => sum + row.steps, 0) || 0;
  }

  // Pre-load ALL rankings (Optimization: Single query per scope)
  const rawGlobalRankings = await getCachedGlobalRankings();

  // ⚡ Bolt Optimization: Truncate rankings to reduce HTML payload size (Top 100 + You)
  const optimizedRankings = optimizeRankingsForPayload(rawGlobalRankings, (session?.user as any)?.id, 100);

  // 装備アイテム情報を注入（フレーム・称号）
  const allGlobalRankings = await enrichRankingsWithEquip(optimizedRankings) as Record<string, RankingEntry[]>;

  // Extract Stats for Current User
  const userId = (session?.user as any)?.id;
  const myWeeklyEntry = userId ? allGlobalRankings['WEEKLY'].find((r: RankingEntry) => r.users.id === userId) : undefined;
  const myWeeklySteps = myWeeklyEntry?.steps || 0;

  const myMonthlyEntry = userId ? allGlobalRankings['MONTHLY'].find((r: RankingEntry) => r.users.id === userId) : undefined;
  const myMonthlySteps = myMonthlyEntry?.steps || 0;

  // ⚡ Bolt Optimization: Bulk fetch group metadata to avoid N+1 queries
  const groupMetadataMap = new Map<string, { id: string; header_image_url: string | null; image_url: string | null }>();
  const validGroupIds: string[] = [];

  if (groupKeywords.length > 0) {
    const { data: groupsData } = await supabaseAdmin
      .from('groups')
      .select('id, keyword, header_image_url, image_url')
      .in('keyword', groupKeywords);

    groupsData?.forEach(g => {
      groupMetadataMap.set(g.keyword, g);
      validGroupIds.push(g.id);
    });
  }

  // ⚡ Bolt Optimization: Batch fetch rankings for all groups to avoid N+1 queries
  // ⚡ Bolt Optimization: Use cached global rankings to derive group rankings (Avoids heavy DB query)
  // Use rawGlobalRankings (full list) to ensure we find all group members
  const batchGroupRankings = await deriveBatchGroupRankings(validGroupIds, rawGlobalRankings);

  const allGroupRankings = (await Promise.all(
    groupKeywords
      .filter(keyword => groupMetadataMap.has(keyword)) // 存在するグループのみ
      .map(async (keyword) => {
      // Lookup groupId & images from memory
      const grp = groupMetadataMap.get(keyword);
      const groupId = grp?.id;

      let neighbors: Record<Period, RankingEntry[]>;
      if (groupId && batchGroupRankings[groupId]) {
        neighbors = batchGroupRankings[groupId];
      } else if (groupId) {
        // Fallback (should normally be covered by batch)
        neighbors = await getAllGroupRankings(groupId);
      } else {
        // Fallback if no group ID found (shouldn't happen if keyword exists)
        neighbors = await getAllRankings('GROUP', keyword);
      }

      // Robustness: Ensure *Current User* is in the list
      // This handles cases where `group_members` table is out of sync with `users.group_keyword`
      // or if the user has 0 steps and was excluded by some upstream logic.
      if (session?.user && (session.user as any).id) {
        const myId = (session.user as any).id;

        (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).forEach(periodKey => {
          const list = neighbors[periodKey];
          const inList = list.find(r => r.users.id === myId);

          if (!inList) {
            // User missing! We must inject them to ensure UI doesn't break.
            // Try to find real stats from Global Ranking
            const globalEntry = allGlobalRankings[periodKey].find(r => r.users.id === myId);

            const injectedEntry: RankingEntry = globalEntry ? { ...globalEntry } : {
              steps: 0,
              users: {
                id: myId,
                username: username || '',
                name: session.user?.name || '',
                image: session.user?.image || '',
              },
              originalRank: 0
            };

            // Add and resort
            list.push(injectedEntry);
            list.sort((a, b) => b.steps - a.steps);
          }
        });
      }

      return {
        keyword,
        groupId,
        header_image_url: grp?.header_image_url,
        image_url: grp?.image_url,
        neighbors: neighbors
      };
    })
  ));

  // ⚡ Bolt Optimization: Enrich Group Rankings with equipment info (Fix regression from truncating global)
  const enrichedGroupRankings = await enrichAllGroupRankingsWithEquip(allGroupRankings);

  // Fetch Group Competition Rankings
  // ⚡ Bolt Optimization: Combined call to reduce DB queries (12 -> 3)
  const {
    DAILY: compDaily,
    WEEKLY: compWeekly,
    MONTHLY: compMonthly,
    YEARLY: compYearly
  } = await getCachedCombinedGroupCompetitionRankings();

  const groupCompetitionRankings = {
    DAILY: compDaily,
    WEEKLY: compWeekly,
    MONTHLY: compMonthly,
    YEARLY: compYearly
  };

  // Determine Banner Image (Priority: User Banner -> First group's header image -> Default Gradient)
  const userDataBanner = bannerUrl;
  const primaryGroupBanner = userDataBanner || (allGroupRankings.length > 0 ? allGroupRankings[0].header_image_url : null);
  const userImage = session?.user?.image;

  return (
    <main className="min-h-screen bg-[var(--theme-page-bg)]">
      {/* Rich Header */}
      <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: '"Inter", sans-serif' }}>
                {t('title', { defaultMessage: 'UCFitness' })}
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                {t('beta')}
              </span>
            </Link>
          </div>
          <div className="flex gap-4 items-center">
            <RefreshButton />
            {session?.user ? (
              <UserMenu user={session.user} />
            ) : (
              <AuthButtons />
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* MAIN LAYOUT CONTAINER */}
        <div className="flex flex-col gap-8">

          {/* TOP SECTION: Stats & Motivation (Equal Height on Desktop) */}
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8 min-h-[220px]">
            {/* My Stats Panel (Left: 5 cols) - Premium Design */}
            {session && (
              <div className="lg:col-span-5 flex flex-col h-full overflow-hidden rounded-2xl bg-white shadow-lg shadow-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/10 relative group">
                {/* Decorative Background Blob */}
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-gradient-to-br from-[var(--theme-primary)]/20 to-[var(--theme-secondary)]/20 rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity"></div>

                <div className="p-6 relative z-10 flex flex-col h-full justify-between">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-[var(--theme-primary)] rounded-lg text-white shadow-md shadow-[var(--theme-primary)]/30">
                      {/* Bolt Icon */}
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 tracking-tight">{t('yourActivity')}</h3>
                  </div>

                  {/* Today's Main Stat */}
                  <div className="mb-6 flex items-start justify-between relative">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] drop-shadow-sm" style={{ fontFamily: '"Inter", sans-serif' }}>
                          {mySteps.toLocaleString()}
                        </span>
                        <span className="text-sm font-semibold text-gray-400">{t('stepsToday')}</span>
                      </div>

                      {/* Comparison Badge */}
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${mySteps - yesterdaySteps >= 0
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-600 border border-red-100'
                          }`}>
                          {mySteps - yesterdaySteps >= 0 ? (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                          )}
                          {Math.abs(mySteps - yesterdaySteps).toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">{t('vsYesterday')}</span>
                      </div>
                    </div>

                    {/* Goal Progress Chart */}
                    <div className="absolute right-4 -top-7 animate-in fade-in zoom-in duration-500 delay-150">
                      <GoalProgressChart current={mySteps} goal={stepGoal} size={100} />
                    </div>
                  </div>

                  {/* Secondary Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 mt-auto">
                    {/* Weekly */}
                    <Link
                      href={username ? `/user/${username}#weekly-graph` : '/profile'}
                      className="block bg-gray-50 p-3 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all duration-300 group/item cursor-pointer"
                    >
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        {t('thisWeek')}
                      </p>
                      <div className="flex flex-col">
                        <span className="text-2xl font-black text-gray-800 group-hover/item:text-indigo-600 transition-colors leaderboard-steps activity-stats-number">
                          {myWeeklySteps.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[11px] font-bold ${myWeeklySteps >= lastWeekSteps ? 'delta-up' : 'delta-down'}`}>
                            {myWeeklySteps >= lastWeekSteps ? '▲' : '▼'} {Math.abs(myWeeklySteps - lastWeekSteps).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-400">{t('vsLastWeek')}</span>
                        </div>
                      </div>
                    </Link>

                    {/* Monthly */}
                    <Link
                      href={username ? `/user/${username}#monthly-graph` : '/profile'}
                      className="block bg-gray-50 p-3 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all duration-300 group/item cursor-pointer"
                    >
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        {t('thisMonth')}
                      </p>
                      <div className="flex flex-col">
                        <span className="text-2xl font-black text-gray-800 group-hover/item:text-indigo-600 transition-colors leaderboard-steps activity-stats-number">
                          {myMonthlySteps.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[11px] font-bold ${myMonthlySteps >= lastMonthSteps ? 'delta-up' : 'delta-down'}`}>
                            {myMonthlySteps >= lastMonthSteps ? '▲' : '▼'} {Math.abs(myMonthlySteps - lastMonthSteps).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-400">{t('vsLastMonth')}</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Motivation / Status (Right: 7 cols) - Adjusted styling to match */}
            {session && (
              <div className="motivation-panel lg:col-span-7 flex flex-col justify-center h-full rounded-2xl p-4 sm:p-8 text-white shadow-xl shadow-[var(--theme-primary)]/20 relative overflow-hidden group">

                {/* Background Image or Gradient */}
                {primaryGroupBanner ? (
                  <>
                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105" style={{ backgroundImage: `url(${primaryGroupBanner})` }}></div>
                    <div className="motivation-overlay absolute inset-0 bg-gradient-to-r from-[var(--theme-primary)]/90 to-[var(--theme-secondary)]/80"></div>
                  </>
                ) : (
                  <div className="motivation-overlay absolute inset-0 bg-gradient-to-br from-[var(--theme-gradient-from)] via-[var(--theme-secondary)] to-[var(--theme-gradient-to)]"></div>
                )}


                {/* Decorative circles */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>

                {/* Animation */}
                <div className="absolute top-1/2 -right-4 sm:right-2 transform -translate-y-1/2 opacity-100 pointer-events-none">
                  <RunnerAnimation userImage={userImage} />
                </div>

                <div className="relative z-10">
                  <div className="flex items-center gap-3 sm:block">
                    <div className="mb-0 sm:mb-4 inline-flex items-center justify-center p-1.5 sm:p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                      <svg className="w-4 h-4 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h4 className="font-black text-lg sm:text-2xl mb-0 sm:mb-2 tracking-tight">{t('keepStepping')}</h4>
                  </div>

                  <p className="opacity-90 text-[10px] sm:text-sm leading-relaxed max-w-md font-medium text-indigo-50 mt-1 sm:mt-0">
                    {t('joinGroups').split('\n').map((line, i, arr) => (
                      <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                    ))}
                  </p>

                  <div className="mt-3 sm:mt-6 flex flex-wrap gap-2 sm:gap-3">
                    <Link href={username ? `/user/${username}` : '/profile'} className="motivation-btn-primary px-3 py-1 sm:px-5 sm:py-2 bg-white text-[var(--theme-primary)] text-[10px] sm:text-sm font-bold rounded-full shadow-lg hover:bg-[var(--theme-primary-light)] transition-colors inline-flex items-center gap-2">
                      {t('profile')}
                    </Link>
                    <Link href="/groups" className="motivation-btn-secondary px-3 py-1 sm:px-5 sm:py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-2">
                      {t('groups')}
                    </Link>
                    <Link href="/wallet" className="motivation-btn-secondary px-3 py-1 sm:px-5 sm:py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm">💰</span>{t('wallet')}
                    </Link>
                    <Link href="/shop" className="motivation-btn-secondary px-3 py-1 sm:px-5 sm:py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm">🛍️</span>{t('shop')}
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* アクティブチャレンジ ウィジェット */}
          {session && userId && (
            <DashboardChallenges />
          )}

          {/* デイリーミッション + ギアレコメンド統合パネル */}
          {session && userId && (
            <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-8 gap-6 lg:items-stretch">
              <div className="lg:col-span-8 flex [&>div]:w-full">
                <div className="w-full"><DailyMissions /></div>
              </div>
              <div className="lg:col-span-4 flex [&>div]:w-full">
                <div className="w-full"><TrendingGear /></div>
              </div>
            </div>
          )}

          {/* Step Heatmap Calendar + フォロー中ユーザー統合パネル */}
          {session && userId && (
            <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-8 gap-6 lg:items-stretch">
              <div className="lg:col-span-8 flex [&>div]:w-full [&>div>div]:h-full">
                <div className="w-full"><StepCalendar userId={userId} /></div>
              </div>
              <div className="lg:col-span-4 flex [&>div]:w-full">
                <div className="w-full"><FollowingPanel /></div>
              </div>
            </div>
          )}

          {/* BOTTOM SECTION: Leaderboards */}
          <AnimatedLeaderboard
            userId={(session?.user as any)?.id}
            allGlobalRankings={allGlobalRankings}
            allGroupRankings={enrichedGroupRankings}
            groupCompetitionRankings={groupCompetitionRankings}
          />

          {session && userId && <LoginBonusToast userId={userId} />}

          <AutoSync />

        </div>
      </div>
    </main>
  );
}
