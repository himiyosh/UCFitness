export const runtime = 'edge';

import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';

import { getTranslations } from 'next-intl/server';

import { auth } from "@/lib/auth";
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
  stepGoal = userData?.step_goal || 10000;
  username = userData?.username || '';
  dbUserName = userData?.name || null;
  dbUserImage = userData?.image || null;

  // Override session image with fresh DB image
  if (userData) {
    if (userData.image) session.user.image = userData.image;
    if (userData.name) session.user.name = userData.name;
  }

  if (!userData?.username) {
    redirect('/setup');
  }

  // 歩数をメモリ内で集計
  const stepsMap = new Map<string, number>();
  stepsResult.data?.forEach(row => {
    stepsMap.set(row.date, row.steps);
  });
  const hasTodayStepRecord = stepsMap.has(today);
  mySteps = stepsMap.get(today) || 0;

  const rankingMap = await getCachedGlobalRankingMap();
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
    <main className="flex min-h-0 flex-1 flex-col bg-[var(--theme-page-bg)]">
      <h1 className="sr-only">{t('todayCommandCenter')}</h1>
      {/* ヘッダー: モバイル〜md では表示、lg 以上ではサイドバーがあるためコンパクト */}
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:hidden">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="group flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                {t('title', { defaultMessage: 'UCFitness' })}
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] text-white text-[10px] font-bold tracking-wide uppercase shadow-sm">
                {t('beta')}
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
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
      <header className="sticky top-0 z-40 hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:block">
        <div className="mx-auto flex h-11 w-full max-w-7xl items-center justify-end px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1">
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
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
        <div className="flex w-full flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
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

          <NextActionCard id="next-action" remainingSteps={remainingSteps} />
          <QuickActions />
        </div>
        <div className="home-desktop-footer hidden md:block">
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
