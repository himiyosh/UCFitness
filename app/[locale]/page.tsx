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
import { RankingEntry, enrichRankingsWithEquip, optimizeRankingsForPayload, enrichAllGroupRankingsWithEquip, enrichCombinedRankings } from '@/lib/ranking-utils';
import AutoSync from '@/components/AutoSync';
import Footer from '@/components/Footer';
import LandingPage from '@/components/LandingPage';
import { Period } from '@/components/LeaderboardTabs';

// ⚡ パフォーマンス: 重いクライアントコンポーネントを遅延読み込み
const AnimatedLeaderboard = nextDynamic(() => import('@/components/AnimatedLeaderboard'));
const RunnerAnimation = nextDynamic(() => import('@/components/RunnerAnimation'));
const StepCalendar = nextDynamic(() => import('@/components/StepCalendar'));
const LoginBonusToast = nextDynamic(() => import('@/components/LoginBonusToast'));
const DashboardChallenges = nextDynamic(() => import('@/components/DashboardChallenges'));
const TrendingGear = nextDynamic(() => import('@/components/TrendingGear'));
const DailyMissions = nextDynamic(() => import('@/components/DailyMissions'));
const PersonalizedGear = nextDynamic(() => import('@/components/PersonalizedGear'));
const FollowingPanel = nextDynamic(() => import('@/components/FollowingPanel'));

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth();
  const t = await getTranslations('Dashboard');

  if (!session?.user) {
    return <LandingPage />;
  }

  const groupKeywords: string[] = [];
  const groupMetadataMap = new Map<string, { id: string; header_image_url: string | null; image_url: string | null }>();
  const validGroupIds: string[] = [];
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
        .select('groups(id, keyword, header_image_url, image_url)')
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

    // ⚡ Bolt Optimization: Process memberships to extract group data without extra query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    memberships?.forEach((m: any) => {
      const g = m.groups;
      if (g && g.keyword) {
        groupKeywords.push(g.keyword);
        groupMetadataMap.set(g.keyword, g);
        if (g.id) validGroupIds.push(g.id);
      }
    });

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

  // ⚡ Bolt Optimization: Delay enrichment until Group Rankings are ready to batch fetch equipment
  // const allGlobalRankings = await enrichRankingsWithEquip(optimizedRankings) as Record<string, RankingEntry[]>;

  // Extract Stats for Current User (Use optimizedRankings directly as it has steps info)
  const userId = (session?.user as any)?.id;
  const myWeeklyEntry = userId ? optimizedRankings['WEEKLY'].find((r: RankingEntry) => r.users.id === userId) : undefined;
  const myWeeklySteps = myWeeklyEntry?.steps || 0;

  const myMonthlyEntry = userId ? optimizedRankings['MONTHLY'].find((r: RankingEntry) => r.users.id === userId) : undefined;
  const myMonthlySteps = myMonthlyEntry?.steps || 0;



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
            const globalEntry = optimizedRankings[periodKey].find(r => r.users.id === myId);

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

  // ⚡ Bolt Optimization: Batch fetch equipment for BOTH Global and Group rankings (1 Query vs 2)
  await enrichCombinedRankings(optimizedRankings, allGroupRankings);

  // Re-assign for clarity (they are mutated in place)
  const allGlobalRankings = optimizedRankings;
  const enrichedGroupRankings = allGroupRankings;

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
    <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
      {/* Rich Header */}
      <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
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
          <div className="flex items-center gap-1">
            <RefreshButton />
            {session?.user ? (
              <UserMenu user={session.user} />
            ) : (
              <AuthButtons />
            )}
          </div>
        </div>
      </header>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* MAIN LAYOUT CONTAINER */}
        <div className="flex flex-col gap-6">

          {/* TOP SECTION: Motivation */}
          <div className="flex flex-col gap-6">
            {/* Motivation / Status - Full Width */}
            {session && (
              <div className="motivation-panel flex flex-col justify-center h-full rounded-2xl p-4 sm:p-8 text-white shadow-xl shadow-[var(--theme-primary)]/20 relative overflow-hidden group min-h-[180px]">

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
                <div className="absolute top-1/2 -right-10 sm:right-2 transform -translate-y-1/2 opacity-100 pointer-events-none scale-75 sm:scale-100">
                  <RunnerAnimation userImage={userImage} />
                </div>

                <div className="relative z-10 flex flex-col h-full">
                  {/* テキストエリア: アバターと重ならないよう幅制限 */}
                  <div className="max-w-[55%] sm:max-w-[65%]">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center justify-center p-1 sm:p-2 bg-white/20 backdrop-blur-sm rounded-lg flex-shrink-0">
                        <svg className="w-3.5 h-3.5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <h4 className="font-black text-base sm:text-2xl tracking-tight whitespace-nowrap">{t('keepStepping')}</h4>
                    </div>

                    <p className="opacity-90 text-[10px] sm:text-sm leading-snug font-medium text-indigo-50 mt-2 sm:mt-3 whitespace-nowrap">
                      {t('joinGroups').split('\n').map((line, i, arr) => (
                        <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                      ))}
                    </p>
                  </div>

                  {/* ナビゲーションボタン: パネル下部に全幅で配置 */}
                  <div className="mt-4 sm:mt-6 flex flex-wrap gap-1.5 sm:gap-3">
                    <Link href={username ? `/user/${username}` : '/profile'} className="motivation-btn-primary px-2.5 py-1 sm:px-5 sm:py-2 bg-white text-[var(--theme-primary)] text-[10px] sm:text-sm font-bold rounded-full shadow-lg hover:bg-[var(--theme-primary-light)] transition-colors inline-flex items-center gap-1">
                      {t('profile')}
                    </Link>
                    <Link href="/groups" className="motivation-btn-secondary px-2.5 py-1 sm:px-5 sm:py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                      {t('groups')}
                    </Link>
                    <Link href="/wallet" className="motivation-btn-secondary px-2.5 py-1 sm:px-5 sm:py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                      <span className="text-[10px] sm:text-sm">💰</span>{t('wallet')}
                    </Link>
                    <Link href="/challenges" className="motivation-btn-secondary px-2.5 py-1 sm:px-5 sm:py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                      <span className="text-[10px] sm:text-sm">🏆</span>{t('challenges')}
                    </Link>
                    <Link href="/analytics" className="motivation-btn-secondary px-2.5 py-1 sm:px-5 sm:py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                      <span className="text-[10px] sm:text-sm">📊</span>{t('analytics')}
                    </Link>
                    <Link href="/shop" className="motivation-btn-secondary px-2.5 py-1 sm:px-5 sm:py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                      <span className="text-[10px] sm:text-sm">🛍️</span>{t('shop')}
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

          {/* アクティビティ + デイリーミッション */}
          {session && userId && (
            <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-5 gap-4 lg:items-stretch">
              <div className="lg:col-span-8 flex [&>div]:w-full [&>div>div]:h-full">
                <div className="w-full">
                  <StepCalendar
                    userId={userId}
                    activity={{
                      todaySteps: mySteps,
                      yesterdaySteps,
                      weeklySteps: myWeeklySteps,
                      lastWeekSteps,
                      monthlySteps: myMonthlySteps,
                      lastMonthSteps,
                      stepGoal,
                    }}
                  />
                </div>
              </div>
              <div className="lg:col-span-4 flex [&>div]:w-full">
                <div className="w-full"><DailyMissions /></div>
              </div>
            </div>
          )}

          {/* フォロー中ユーザー */}
          {session && userId && (
            <FollowingPanel />
          )}

          {/* BOTTOM SECTION: Leaderboards */}
          <AnimatedLeaderboard
            userId={(session?.user as any)?.id}
            allGlobalRankings={allGlobalRankings}
            allGroupRankings={enrichedGroupRankings}
            groupCompetitionRankings={groupCompetitionRankings}
          />

          {/* あなたへのおすすめ + 愛用ギア */}
          {session && userId && (
            <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-5 gap-4 lg:items-stretch">
              <div className="lg:col-span-5 flex [&>div]:w-full">
                <div className="w-full"><PersonalizedGear /></div>
              </div>
              <div className="lg:col-span-7 flex [&>div]:w-full">
                <div className="w-full"><TrendingGear /></div>
              </div>
            </div>
          )}

          {session && userId && <LoginBonusToast userId={userId} />}

          <AutoSync />

        </div>
      </div>
      <Footer />
    </main>
  );
}
