export const runtime = 'edge';

import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';

import { getLocale, getTranslations } from 'next-intl/server';

import { auth } from "@/lib/auth";
import { getPostLoginRedirect } from '@/lib/auth-flow';
import { reportError } from '@/lib/errors';
import {
  getCachedGlobalRankingMap,
  reportRankingServiceFailure,
} from '@/lib/services/ranking-service';
import { supabaseAdmin } from '@/lib/supabase';
import { Link } from '@/navigation';
import Footer from '@/components/layout/Footer';
import LandingPage from '@/components/LandingPage';

import type { ReactNode } from 'react';

// 未認証LPの初期JSへ認証ホーム専用のClient Componentsを混在させない。
const AutoSync = nextDynamic(() => import('@/components/AutoSync'));
const DailyMissions = nextDynamic(() => import('@/components/dashboard/DailyMissions'));
const DashboardChallenges = nextDynamic(() => import('@/components/dashboard/DashboardChallenges'));
const DashboardFollowing = nextDynamic(() => import('@/components/dashboard/DashboardFollowing'));
const QuickActions = nextDynamic(() => import('@/components/dashboard/QuickActions'));
const HomeHero = nextDynamic(() => import('@/components/dashboard/HomeHero'));
const RefreshButton = nextDynamic(() => import('@/components/layout/RefreshButton'));
const UserMenu = nextDynamic(() => import('@/components/layout/UserMenu'));
const UserAvatar = nextDynamic(() => import('@/components/UserAvatar'));
const LoginBonusToast = nextDynamic(() => import('@/components/auth/LoginBonusToast'));
const NotificationBell = nextDynamic(() => import('@/components/layout/NotificationBell'));
const TrendingGear = nextDynamic(() => import('@/components/TrendingGear'));

const LEADERBOARD_PREVIEW_MIN_ROWS = 5;

export const dynamic = 'force-dynamic';

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: HomePageProps): Promise<ReactNode> {
  const [session, locale, resolvedSearchParams] = await Promise.all([
    auth(),
    getLocale(),
    searchParams,
  ]);

  if (!session?.user) {
    return <LandingPage locale={locale} searchParams={resolvedSearchParams} />;
  }

  const [t, commonT] = await Promise.all([
    getTranslations('Dashboard'),
    getTranslations('Common'),
  ]);

  const userId = session.user.id;
  let username = '';
  let mySteps = 0;
  let stepGoal = 10000;
  let dbUserName: string | null = null;
  let dbUserImage: string | null = null;


  // JST 日付計算（同期処理）
  const now = new Date();
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jstDate.toISOString().split('T')[0];
  const daysSinceMonday = (jstDate.getUTCDay() + 6) % 7;
  const weekStartDate = new Date(jstDate);
  weekStartDate.setUTCDate(jstDate.getUTCDate() - daysSinceMonday);
  const weeklyDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStartDate);
    date.setUTCDate(weekStartDate.getUTCDate() + index);
    return date.toISOString().split('T')[0];
  });
  const weeklyStart = weeklyDates[0];

  // ⚡ パフォーマンス: 初期表示に必要なユーザー情報・7日歩数・UC残高を並列取得
  const [userResult, stepsResult, coinResult] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('username, step_goal, image, name')
      .eq('id', userId)
      .single(),
    supabaseAdmin
      .from('daily_steps')
      .select('steps, date')
      .eq('user_id', userId)
      .gte('date', weeklyStart)
      .lte('date', today)
      .order('date', { ascending: true }),
    supabaseAdmin
      .from('coin_balances')
      .select('total_balance, current_streak')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const userData = userResult.data;
  const dashboardDataError = Boolean(userResult.error || stepsResult.error);
  const rewardDataError = Boolean(coinResult.error);
  let rankingDataError = false;
  if (userResult.error) {
    reportError('home:user', userResult.error, { userId });
  }
  if (stepsResult.error) {
    reportError('home:steps', stepsResult.error, { userId, startDate: weeklyStart, endDate: today });
  }
  if (coinResult.error) {
    reportError('home:coins', coinResult.error, { userId });
  }
  stepGoal = userData?.step_goal || 10000;
  username = userResult.error ? '' : (userData?.username || '');
  dbUserName = userData?.name || null;
  dbUserImage = userData?.image || null;

  // Override session image with fresh DB image
  if (userData) {
    if (userData.image) session.user.image = userData.image;
    if (userData.name) session.user.name = userData.name;
  }

  const postLoginRedirect = getPostLoginRedirect(Boolean(userResult.error), userData?.username);
  if (postLoginRedirect) redirect(postLoginRedirect);

  // 歩数をメモリ内で集計
  const stepsMap = new Map<string, number>();
  stepsResult.data?.forEach(row => {
    stepsMap.set(row.date, row.steps);
  });
  const hasTodayStepRecord = stepsMap.has(today);
  const hasWeeklyStepRecord = weeklyDates.some(date => stepsMap.has(date));
  mySteps = stepsMap.get(today) || 0;
  const weekdayFormatter = new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const weeklySeries: WeeklyStepPoint[] = weeklyDates.map(date => ({
    date,
    label: weekdayFormatter.format(new Date(`${date}T00:00:00Z`)),
    steps: stepsMap.has(date) ? stepsMap.get(date) ?? 0 : null,
    isToday: date === today,
    isFuture: date > today,
  }));
  const ucBalance = coinResult.data?.total_balance ?? 0;
  const currentStreak = coinResult.data?.current_streak ?? 0;

  let rankingMap: Awaited<ReturnType<typeof getCachedGlobalRankingMap>> = {};
  if (!dashboardDataError) {
    try {
      rankingMap = await getCachedGlobalRankingMap();
    } catch (error: unknown) {
      reportRankingServiceFailure('home:ranking', error);
      rankingDataError = true;
    }
  }
  // 週次ラベルと同じ期間で、0歩のユーザーを除いた到達可能な差だけを示す。
  const weeklyRankings = Object.entries(rankingMap)
    .filter(([, stats]) => stats.WEEKLY > 0)
    .sort(([, first], [, second]) => second.WEEKLY - first.WEEKLY);
  const userRankIndex = weeklyRankings.findIndex(([rankingUserId]) => rankingUserId === userId);
  const userRankStats = userRankIndex >= 0 ? weeklyRankings[userRankIndex][1] : null;
  const precedingRankStats = userRankIndex > 0 ? weeklyRankings[userRankIndex - 1][1] : null;
  const globalRank = userRankIndex >= 0 ? userRankIndex + 1 : null;
  const nextRankGap = userRankStats && precedingRankStats
    ? Math.max(1, precedingRankStats.WEEKLY - userRankStats.WEEKLY + 1)
    : null;
  const nextRankTargetName = precedingRankStats?.users?.name?.trim()
    || precedingRankStats?.users?.username?.trim()
    || t('leaderboardPreviewNextRival');
  const leaderboardPreview: LeaderboardPreviewEntry[] = weeklyRankings
    .slice(0, LEADERBOARD_PREVIEW_MIN_ROWS)
    .map(([rankingUserId, stats], index) => {
      const rankingName = stats.users?.name?.trim();
      const rankingUsername = stats.users?.username?.trim();
      return {
        id: rankingUserId,
        rank: index + 1,
        name: rankingName || rankingUsername || t('leaderboardPreviewUnknownUser'),
        username: rankingUsername || null,
        image: stats.users?.image ?? null,
        steps: stats.WEEKLY,
        isCurrentUser: rankingUserId === userId,
      };
    });
  const userImage = dbUserImage || session.user.image || null;
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-[var(--theme-page-bg)]">
      <h1 className="sr-only">{t('todayCommandCenter')}</h1>
      {/* ヘッダー: モバイル〜md では表示、lg 以上ではサイドバーがあるためコンパクト */}
      <header data-auth-header className="uc-home-header app-safe-top sticky top-0 z-50 overflow-visible border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:hidden">
        <div className="mx-auto flex h-12 w-full max-w-[1440px] items-center justify-between px-3 sm:h-14 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <Link href="/" className="group flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2">
              <AppBrandMark />
              <span className="truncate text-lg font-black tracking-tight sm:text-xl" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                <span className="text-[var(--color-primary-strong)]">UC</span>
                <span className="text-[var(--color-text)]">Fitness</span>
              </span>
              <span className="hidden rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--color-primary-strong)] sm:inline-block">
                {t('beta')}
              </span>
            </Link>
          </div>
          <div className="header-action-cluster flex shrink-0 items-center gap-0.5 overflow-visible rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-0.5">
            <RefreshButton />
            <NotificationBell />
            <UserMenu user={{
              id: userId,
              username,
              name: dbUserName || session.user.name,
              email: session.user.email,
              image: userImage,
            }} />
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-w-0">

      {/* lg 以上のヘッダー（サイドバーと共存するコンパクト版） */}
      <header data-auth-header className="uc-home-header sticky top-0 z-40 hidden overflow-visible border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:block">
        <div className="mx-auto flex h-12 w-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-success)] shadow-[0_0_0_4px_var(--color-success-soft)]" aria-hidden="true" />
            <span className="truncate">{t('todayCommandCenter')}</span>
          </div>
          <div className="header-action-cluster flex shrink-0 items-center gap-0.5 overflow-visible rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-0.5">
            <RefreshButton />
            <NotificationBell />
            <UserMenu user={{
              id: userId,
              username,
              name: dbUserName || session.user.name,
              email: session.user.email,
              image: userImage,
            }} />
          </div>
        </div>
      </header>

      {/* ===== 今日の進捗 → 競争 → UC報酬 → 次の行動 ===== */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
        <div className="w-full px-4 py-3 sm:px-6 lg:px-8">
          {dashboardDataError ? (
            <section
              className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-surface)] p-4 shadow-sm sm:p-5"
              role="alert"
              aria-labelledby="dashboard-data-error-title"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-[var(--color-danger)]" aria-hidden="true">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <h2 id="dashboard-data-error-title" className="text-base font-bold text-[var(--color-text)]">
                      {t('dataUnavailableTitle')}
                    </h2>
                    <p className="mt-1 max-w-prose text-sm leading-6 text-[var(--color-text-muted)]">
                      {t('dataUnavailableDescription')}
                    </p>
                  </div>
                </div>
                <form action="/" method="get">
                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                  >
                    {commonT('retry')}
                  </button>
                </form>
              </div>
            </section>
          ) : (
            <>
          {rankingDataError && (
            <section className="mb-3 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-surface)] p-3 shadow-sm" role="status">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[var(--color-text)]">{t('rankingUnavailableTitle')}</h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t('rankingUnavailableDescription')}</p>
                </div>
                <form action="/" method="get">
                  <button type="submit" className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">
                    {commonT('retry')}
                  </button>
                </form>
              </div>
            </section>
          )}
          <HomeHero
            todaySteps={mySteps}
            stepGoal={stepGoal}
            userName={dbUserName || session.user.name || null}
            userImage={userImage}
            username={username}
            globalRank={globalRank}
            hasTodaySteps={hasTodayStepRecord}
            nextRankGap={nextRankGap}
            ucBalance={rewardDataError ? null : ucBalance}
            currentStreak={currentStreak}
            rewardDataError={rewardDataError}
            showNextAction={false}
            showMetricTiles={false}
          />

          <div className="home-module-grid mt-3 grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <div className="min-w-0 md:h-full">
              <DailyMissions />
            </div>
            <div className="min-w-0 md:h-full">
              <WeeklyPulsePanel
                points={weeklySeries}
                stepGoal={stepGoal}
                labels={{
                  title: t('weeklyPulseTitle'),
                  recordedTotal: t('weeklyRecordedTotal'),
                  bestDay: t('weeklyBestDay'),
                  recordedDays: t('weeklyRecordedDays'),
                  analytics: t('weeklyAnalytics'),
                  noData: t('weeklyNoData'),
                  upcoming: t('weeklyUpcoming'),
                  startHint: t('weeklyStartHint'),
                }}
              />
            </div>
            <div className="min-w-0 md:h-full">
              <RewardWalletPanel
                balance={ucBalance}
                streak={currentStreak}
                error={rewardDataError}
                labels={{
                  title: t('ucWalletTitle'),
                  balance: t('ucBalanceLabel'),
                  streak: t('ucStreak', { days: currentStreak }),
                  wallet: t('wallet'),
                  shop: t('shop'),
                  error: t('rewardDataUnavailable'),
                  retry: commonT('retry'),
                }}
              />
            </div>
            <div className="min-w-0 md:h-full">
              <DashboardChallenges />
            </div>
          </div>

          <section className="mt-4" aria-labelledby="home-explore-title">
            <div className="mb-2">
              <h2 id="home-explore-title" className="text-sm font-black text-[var(--color-text)] sm:text-base">
                {t('homeExploreTitle')}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t('homeExploreDescription')}</p>
            </div>
            <QuickActions className="mb-3" />
            <div className={`home-social-grid grid items-stretch gap-3 ${rankingDataError ? '' : 'xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.05fr)]'}`}>
              <DashboardFollowing className="home-friend-panel xl:h-full" />
              {!rankingDataError && (
                <LeaderboardPreviewPanel
                  entries={leaderboardPreview}
                  currentSteps={userRankStats?.WEEKLY ?? null}
                  hasWeeklyRecord={hasWeeklyStepRecord}
                  rankGapLabel={nextRankGap !== null
                    ? t('leaderboardPreviewNextGap', {
                        steps: nextRankGap.toLocaleString(),
                        name: nextRankTargetName,
                        rank: globalRank !== null ? Math.max(1, globalRank - 1) : 1,
                      })
                    : null}
                  labels={{
                    title: t('leaderboardPreviewTitle'),
                    subtitle: t('leaderboardPreviewSubtitle'),
                    viewAll: t('leaderboardPreviewViewAll'),
                    yourSteps: t('leaderboardPreviewYourSteps'),
                    steps: t('leaderboardPreviewSteps'),
                    noData: t('leaderboardPreviewNoData'),
                    unranked: t('rankUnavailable'),
                    you: t('leaderboardPreviewYou'),
                    profileLabel: name => t('leaderboardPreviewProfileLabel', { name }),
                    openSlots: [
                      t('leaderboardPreviewOpenSlot'),
                      t('leaderboardPreviewOpenSlotSync'),
                      t('leaderboardPreviewOpenSlotWalk'),
                      t('leaderboardPreviewOpenSlotFriends'),
                      t('leaderboardPreviewOpenSlotReachable'),
                    ],
                    recordedOpenSlots: [
                      t('leaderboardPreviewOpenSlot'),
                      t('leaderboardPreviewOpenSlotWalk'),
                      t('leaderboardPreviewOpenSlotFriends'),
                      t('leaderboardPreviewOpenSlotReachable'),
                      t('leaderboardPreviewRankedSlotMomentum'),
                    ],
                    rankedOpenSlots: [
                      t('leaderboardPreviewRankedSlotNext'),
                      t('leaderboardPreviewRankedSlotMomentum'),
                      t('leaderboardPreviewRankedSlotCommunity'),
                      t('leaderboardPreviewOpenSlotFriends'),
                      t('leaderboardPreviewOpenSlotReachable'),
                    ],
                  }}
                />
              )}
            </div>
            <div className="mt-3"><TrendingGear userId={userId} /></div>
          </section>
            </>
          )}
        </div>
        <div className="home-desktop-footer mt-auto">
          <Footer />
        </div>
      </div>

      </div>{/* /メインコンテンツ領域 */}

      {/* 非表示ユーティリティ */}
      <LoginBonusToast userId={userId} />
      <AutoSync />
    </main>
  );
}

function AppBrandMark(): ReactNode {
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] ring-1 ring-[var(--color-primary)]/20">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 15.5 8.5 11l3 3L20 5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19h14" stroke="var(--color-reward)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="18.5" cy="5.5" r="2.25" fill="var(--color-success)" />
      </svg>
    </span>
  );
}

interface WeeklyStepPoint {
  date: string;
  label: string;
  steps: number | null;
  isToday: boolean;
  isFuture: boolean;
}

interface WeeklyPulsePanelProps {
  points: WeeklyStepPoint[];
  stepGoal: number;
  labels: {
    title: string;
    recordedTotal: string;
    bestDay: string;
    recordedDays: string;
    analytics: string;
    noData: string;
    upcoming: string;
    startHint: string;
  };
}

function WeeklyPulsePanel({ points, stepGoal, labels }: WeeklyPulsePanelProps): ReactNode {
  const recordedPoints = points.filter((point): point is WeeklyStepPoint & { steps: number } => point.steps !== null);
  const total = recordedPoints.reduce((sum, point) => sum + point.steps, 0);
  const best = recordedPoints.reduce((maximum, point) => Math.max(maximum, point.steps), 0);
  const chartMaximum = Math.max(stepGoal, best, 1);
  const elapsedDays = points.filter(point => !point.isFuture).length;

  return (
    <section className="home-analysis-panel flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-surface)] p-3" aria-labelledby="weekly-pulse-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" aria-hidden="true">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 18V8m5 10V4m6 14v-7m5 7V6" />
            </svg>
          </span>
          <h2 id="weekly-pulse-title" className="text-balance text-sm font-bold leading-5 text-[var(--color-text)] sm:text-base">{labels.title}</h2>
        </div>
        <Link href="/analytics" className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">
          {labels.analytics}
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {recordedPoints.length === 0 ? (
        <p className="mt-3 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--color-text-muted)]">
          {labels.noData}
        </p>
      ) : total === 0 ? (
        <p className="mt-3 rounded-xl bg-[var(--color-primary-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-primary-strong)]">
          {labels.startHint}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MetricValue label={labels.recordedTotal} value={total.toLocaleString()} tone="primary" />
          <MetricValue label={labels.bestDay} value={best.toLocaleString()} tone="success" />
          <MetricValue label={labels.recordedDays} value={`${recordedPoints.length}/${elapsedDays}`} tone="neutral" />
        </div>
      )}

      <div className="home-week-chart mt-3 grid grid-cols-7 items-end gap-1.5 sm:gap-2" aria-hidden="true">
        {points.map(point => {
          const heightPercent = point.steps === null || point.steps === 0
            ? 0
            : Math.max(10, Math.round((point.steps / chartMaximum) * 100));
          const barTone = point.steps === null || point.steps === 0
            ? 'bg-[var(--color-surface-muted)]'
            : point.steps >= stepGoal
              ? 'bg-[var(--color-success)]'
              : 'bg-[var(--color-primary-solid)]';

          return (
            <div key={point.date} className="flex h-full min-w-0 flex-col justify-end gap-1">
              <div className={`relative flex flex-1 items-end overflow-hidden rounded-lg ${point.isFuture ? 'border border-dashed border-[var(--color-border)] bg-transparent' : 'bg-[var(--color-surface-muted)]'} ${point.isToday ? 'ring-2 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-surface)]' : ''}`}>
                <span
                  className={`home-week-bar block w-full rounded-md transition-[height] duration-500 ${barTone}`}
                  style={{ height: `${heightPercent}%` }}
                  title={point.isFuture ? labels.upcoming : point.steps === null ? labels.noData : point.steps.toLocaleString()}
                />
                {point.steps === null && (
                  <span className="absolute inset-x-0 bottom-1 text-center text-xs font-bold text-[var(--color-text-muted)]">—</span>
                )}
                {point.steps === 0 && (
                  <span className="absolute inset-x-0 bottom-2 mx-auto h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
                )}
              </div>
              <span className={`text-center text-xs ${point.isToday ? 'font-bold text-[var(--color-primary-strong)]' : 'text-[var(--color-text-muted)]'}`}>
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="sr-only">
        {points.map(point => (
          <li key={point.date}>
            {point.label}: {point.isFuture ? labels.upcoming : point.steps === null ? labels.noData : point.steps.toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface RewardWalletPanelProps {
  balance: number;
  streak: number;
  error: boolean;
  labels: {
    title: string;
    balance: string;
    streak: string;
    wallet: string;
    shop: string;
    error: string;
    retry: string;
  };
}

function RewardWalletPanel({ balance, streak, error, labels }: RewardWalletPanelProps): ReactNode {
  return (
    <section className="home-reward-module relative flex h-full flex-col justify-center overflow-hidden rounded-2xl border border-[var(--color-reward)]/35 bg-[var(--color-reward-soft)] p-3 shadow-sm" aria-labelledby="reward-wallet-title">
      <div className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full border-[12px] border-[var(--color-reward)]/10" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="home-reward-coin flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-reward-solid)] text-white shadow-sm" aria-hidden="true">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6c4.42 0 8-1.12 8-2.5S16.42 1 12 1 4 2.12 4 3.5 7.58 6 12 6Zm8-2.5V8c0 1.38-3.58 2.5-8 2.5S4 9.38 4 8V3.5M20 8v4.5c0 1.38-3.58 2.5-8 2.5s-8-1.12-8-2.5V8m16 4.5V17c0 1.38-3.58 2.5-8 2.5S4 18.38 4 17v-4.5" />
            </svg>
          </span>
          <h2 id="reward-wallet-title" className="text-sm font-bold text-[var(--color-reward-strong)] sm:text-base">{labels.title}</h2>
        </div>

        {error ? (
          <div className="mt-4" role="status">
            <p className="text-sm font-semibold text-[var(--color-text)]">{labels.error}</p>
            <form action="/" method="get" className="mt-2">
              <button type="submit" className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-reward-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)]">
                {labels.retry}
              </button>
            </form>
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs font-semibold text-[var(--color-reward-strong)]">{labels.balance}</p>
            <p className="mt-0.5 text-3xl font-black tracking-tight text-[var(--color-reward-strong)] tabular-nums">
              {balance.toLocaleString()} <span className="text-base">UC</span>
            </p>
            {streak > 0 && (
              <span className="mt-2 inline-flex rounded-full bg-[var(--color-success-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-success-strong)]">
                {labels.streak}
              </span>
            )}
          </>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/wallet" className="uc-interactive-panel inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-[var(--color-reward)]/30 bg-[var(--color-surface)] px-3 py-2 text-xs font-bold text-[var(--color-reward-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)]">
            {labels.wallet}<span aria-hidden="true">→</span>
          </Link>
          <Link href="/shop" className="uc-interactive-panel inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-[var(--color-reward-solid)] px-3 py-2 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)] focus-visible:ring-offset-2">
            {labels.shop}<span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

interface MetricValueProps {
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'neutral';
}

function MetricValue({ label, value, tone }: MetricValueProps): ReactNode {
  const valueTone = tone === 'primary'
    ? 'text-[var(--color-primary-strong)]'
    : tone === 'success'
      ? 'text-[var(--color-success-strong)]'
      : 'text-[var(--color-text)]';

  return (
    <div className="min-w-0 rounded-xl bg-[var(--color-surface-muted)] px-2.5 py-2">
      <p className="flex min-h-8 items-center justify-center text-center text-xs leading-4 text-[var(--color-text-muted)]">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-black tabular-nums sm:text-base ${valueTone}`}>{value}</p>
    </div>
  );
}

interface LeaderboardPreviewEntry {
  id: string;
  rank: number;
  name: string;
  username: string | null;
  image: string | null;
  steps: number;
  isCurrentUser: boolean;
}

interface LeaderboardPreviewPanelProps {
  entries: LeaderboardPreviewEntry[];
  currentSteps: number | null;
  hasWeeklyRecord: boolean;
  rankGapLabel: string | null;
  labels: {
    title: string;
    subtitle: string;
    viewAll: string;
    yourSteps: string;
    steps: string;
    noData: string;
    unranked: string;
    you: string;
    profileLabel: (name: string) => string;
    openSlots: string[];
    recordedOpenSlots: string[];
    rankedOpenSlots: string[];
  };
}

function LeaderboardPreviewPanel({
  entries,
  currentSteps,
  hasWeeklyRecord,
  rankGapLabel,
  labels,
}: LeaderboardPreviewPanelProps): ReactNode {
  const maximumSteps = Math.max(1, ...entries.map(entry => entry.steps));
  const emptyRowCount = Math.max(0, LEADERBOARD_PREVIEW_MIN_ROWS - entries.length);
  const contextualOpenSlots = currentSteps !== null
    ? labels.rankedOpenSlots
    : hasWeeklyRecord
      ? labels.recordedOpenSlots
      : labels.openSlots;

  return (
    <section className="home-rivalry-panel relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-competition)]/30 bg-[var(--color-surface)] p-3 shadow-sm sm:p-4" aria-labelledby="leaderboard-preview-title">
      <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[var(--color-competition-soft)]" aria-hidden="true" />
      <div className="relative flex h-full flex-col">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-competition-solid)] text-white" aria-hidden="true">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 20v-6h4v6m2 0V8h4v12m2 0V3h4v17M3 20h19" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 id="leaderboard-preview-title" className="text-sm font-bold text-[var(--color-text)] sm:text-base">{labels.title}</h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{labels.subtitle}</p>
            </div>
          </div>
          <Link href="/leaderboard?period=WEEKLY" className="inline-flex min-h-[44px] w-fit shrink-0 items-center gap-1 self-start rounded-lg px-2 text-xs font-semibold text-[var(--color-competition-strong)] active:bg-[var(--color-competition-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)]">
            {labels.viewAll}<span aria-hidden="true">→</span>
          </Link>
        </div>

        {entries.length === 0 && (
          <p className="mt-4 rounded-xl bg-[var(--color-surface-muted)] px-3 py-3 text-sm text-[var(--color-text-muted)]">{labels.noData}</p>
        )}
        <ol className="mt-3 grid flex-1 auto-rows-fr gap-2">
          {entries.map(entry => {
            const rowClassName = `leaderboard-row group relative flex min-h-[4.5rem] flex-col justify-center h-full overflow-visible rounded-xl border px-3 py-2 transition-colors sm:px-6 sm:py-2.5 ${
              entry.rank === 1 ? 'rank-row-1' : entry.rank === 2 ? 'rank-row-2' : entry.rank === 3 ? 'rank-row-3' : ''
            } ${
                    entry.isCurrentUser
                      ? 'border-[var(--color-primary)]/35 bg-[var(--color-primary-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`;
            const rowContent = (
              <span className="flex w-full items-center gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                    entry.rank === 1
                      ? 'bg-[var(--color-reward-solid)] text-white'
                      : entry.rank === 2
                        ? 'bg-[var(--color-surface-muted)] text-[var(--color-text)]'
                        : entry.rank === 3
                          ? 'bg-[var(--color-reward-soft)] text-[var(--color-reward-strong)]'
                          : 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'
                  }`}>
                    {entry.rank}
                  </span>
                  <UserAvatar src={entry.image} name={entry.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-[var(--color-text)]">{entry.name}</span>
                      {entry.isCurrentUser && (
                        <span className="shrink-0 rounded-full bg-[var(--color-primary-solid)] px-1.5 py-0.5 text-xs font-bold text-white">{labels.you}</span>
                      )}
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]" aria-hidden="true">
                      <span className="block h-full rounded-full bg-[var(--color-competition-solid)] transition-[width] duration-500" style={{ width: `${Math.max(8, Math.round((entry.steps / maximumSteps) * 100))}%` }} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black tabular-nums text-[var(--color-competition-strong)]">{entry.steps.toLocaleString()}</span>
                    <span className="block text-xs text-[var(--color-text-muted)]">{labels.steps}</span>
                  </span>
              </span>
            );
            return (
              <li key={entry.id} className="h-full">
                {entry.username ? (
                  <Link
                    href={`/user/${entry.username}`}
                    className={`${rowClassName} active:outline active:outline-2 active:outline-offset-[-2px] active:outline-[var(--color-competition)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)]`}
                  >
                    {rowContent}
                    <span className="sr-only">{labels.profileLabel(entry.name)}</span>
                    <span className="absolute right-2 text-[var(--color-competition-strong)] sm:right-3" aria-hidden="true">›</span>
                  </Link>
                ) : (
                  <div className={`pointer-events-none ${rowClassName}`}>{rowContent}</div>
                )}
              </li>
            );
          })}
          {Array.from({ length: emptyRowCount }, (_, index) => (
            <li
              key={`leaderboard-preview-empty-${index}`}
              className="leaderboard-row pointer-events-none flex h-full min-h-[4.5rem] flex-col justify-center rounded-xl border border-dashed border-[var(--color-competition)]/30 bg-[var(--color-competition-soft)]/30 px-3 py-2 sm:px-6 sm:py-2.5"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--color-competition)]/30 text-xs font-black text-[var(--color-competition-strong)]">
                  {entries.length + index + 1}
                </span>
                <span className="text-xs font-semibold leading-5 text-[var(--color-competition-strong)]">
                  {contextualOpenSlots[index % contextualOpenSlots.length]}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-3 flex flex-col gap-1 rounded-xl bg-[var(--color-competition-soft)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="min-w-0 break-words font-semibold text-[var(--color-competition-strong)]">
            {rankGapLabel ?? labels.yourSteps}
          </span>
          <span className="shrink-0 font-black tabular-nums text-[var(--color-competition-strong)]">
            {currentSteps !== null
              ? `${currentSteps.toLocaleString()} ${labels.steps}`
              : labels.unranked}
          </span>
        </div>
      </div>
    </section>
  );
}
