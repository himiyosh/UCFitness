export const runtime = 'edge';

import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';

import { getTranslations } from 'next-intl/server';

import { auth } from "@/lib/auth";
import { reportError } from '@/lib/errors';
import { getCachedGlobalRankingMap } from '@/lib/services/ranking-service';
import { supabaseAdmin } from '@/lib/supabase';
import { Link } from '@/navigation';
import AutoSync from '@/components/AutoSync';
import DailyMissions from '@/components/dashboard/DailyMissions';
import DashboardChallenges from '@/components/dashboard/DashboardChallenges';
import Footer from '@/components/layout/Footer';
import LandingPage from '@/components/LandingPage';
import QuickActions from '@/components/dashboard/QuickActions';
import HomeHero, { NextActionCard } from '@/components/dashboard/HomeHero';
import RefreshButton from '@/components/layout/RefreshButton';
import UserMenu from '@/components/layout/UserMenu';

import type { ReactNode } from 'react';

// ⚡ パフォーマンス: 補助的なクライアント機能だけを遅延読み込み
const LoginBonusToast = nextDynamic(() => import('@/components/auth/LoginBonusToast'));
const NotificationBell = nextDynamic(() => import('@/components/layout/NotificationBell'));

export const dynamic = 'force-dynamic';

export default async function Home(): Promise<ReactNode> {
  const session = await auth();
  const t = await getTranslations('Dashboard');
  const commonT = await getTranslations('Common');

  if (!session?.user) {
    return <LandingPage />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id;
  let username = '';
  let mySteps = 0;
  let stepGoal = 10000;
  let dbUserName: string | null = null;
  let dbUserImage: string | null = null;


  // JST 日付計算（同期処理）
  const now = new Date();
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jstDate.toISOString().split('T')[0];

  // ⚡ パフォーマンス: 初期表示に必要なユーザー情報・歩数だけを並列取得
  const [userResult, stepsResult] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('username, step_goal, image, name')
      .eq('id', userId)
      .single(),
    supabaseAdmin
      .from('daily_steps')
      .select('steps, date')
      .eq('user_id', userId)
      .eq('date', today),
  ]);

  const userData = userResult.data;
  const dashboardDataError = Boolean(userResult.error || stepsResult.error);
  let rankingDataError = false;
  if (userResult.error) {
    reportError('home:user', userResult.error, { userId });
  }
  if (stepsResult.error) {
    reportError('home:steps', stepsResult.error, { userId, date: today });
  }
  stepGoal = userData?.step_goal || 10000;
  username = userData?.username || '';
  dbUserName = userData?.name || null;
  dbUserImage = userData?.image || null;

  // Override session image with fresh DB image
  if (userData) {
    if (userData.image) session.user.image = userData.image;
    if (userData.name) session.user.name = userData.name;
  }

  if (!userResult.error && !userData?.username) {
    redirect('/setup');
  }

  // 歩数をメモリ内で集計
  const stepsMap = new Map<string, number>();
  stepsResult.data?.forEach(row => {
    stepsMap.set(row.date, row.steps);
  });
  const hasTodayStepRecord = stepsMap.has(today);
  mySteps = stepsMap.get(today) || 0;

  let rankingMap: Awaited<ReturnType<typeof getCachedGlobalRankingMap>> = {};
  if (!dashboardDataError) {
    try {
      rankingMap = await getCachedGlobalRankingMap();
    } catch (error: unknown) {
      reportError('home:ranking', error, { userId });
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
  const userImage = dbUserImage || session.user.image || null;
  const remainingSteps = Math.max(0, stepGoal - mySteps);

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
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.8fr)_minmax(280px,1fr)]">
            <div className="min-w-0 md:col-span-2 lg:col-span-1">
              <HomeHero
                todaySteps={mySteps}
                stepGoal={stepGoal}
                userName={dbUserName || session.user.name || null}
                userImage={userImage}
                username={username}
                globalRank={globalRank}
                hasTodaySteps={hasTodayStepRecord}
                nextRankGap={nextRankGap}
                nextActionTargetId="next-action"
                showNextAction={false}
                showMetricTiles={false}
              />
            </div>
            <div className="min-w-0">
              <DashboardChallenges />
            </div>
            <div className="min-w-0">
              <DailyMissions />
            </div>
          </div>

          <div className="mt-3 grid items-stretch gap-3 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
            <NextActionCard id="next-action" remainingSteps={remainingSteps} />
            <QuickActions className="h-full" />
          </div>
            </>
          )}
        </div>
        <div className="home-desktop-footer mt-auto hidden md:block">
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
