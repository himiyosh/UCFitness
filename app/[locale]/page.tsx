export const runtime = 'edge';

import { supabaseAdmin } from '@/lib/supabase';
import { Link } from '@/navigation';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import RefreshButton from '@/components/RefreshButton';
import UserMenu from '@/components/UserMenu';
import { auth } from "@/lib/auth";
import { getCachedGlobalRankingMap, transformRankingMapToLists } from '@/lib/ranking-service';
import nextDynamic from 'next/dynamic';
import { optimizeRankingsForPayload } from '@/lib/ranking-utils';
import AutoSync from '@/components/AutoSync';
import Footer from '@/components/Footer';
import LandingPage from '@/components/LandingPage';
import HomePortal from '@/components/HomePortal';

import type { RankingEntry } from '@/lib/ranking-utils';

// ⚡ パフォーマンス: 重いクライアントコンポーネントを遅延読み込み
const LoginBonusToast = nextDynamic(() => import('@/components/LoginBonusToast'));
const NotificationBell = nextDynamic(() => import('@/components/NotificationBell'));

// スケルトンローディングプレースホルダー（チャンク読み込み中に表示）
const CardSkeleton = ({ h = 'h-32', title }: { h?: string; title?: string }) => (
  <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-5 animate-pulse">
    {title && <div className="flex items-center gap-2 mb-3"><span className="text-lg">{title}</span><div className="h-4 w-28 bg-gray-200 rounded" /></div>}
    <div className={`${h} bg-gray-100 rounded-lg`} />
  </div>
);

// デスクトップ用コンポーネント（モバイルでは不要）
const RunnerAnimation = nextDynamic(() => import('@/components/RunnerAnimation'));
const StepCalendar = nextDynamic(() => import('@/components/StepCalendar'), {
  loading: () => <CardSkeleton h="h-48" title="📊" />,
});
const DashboardChallenges = nextDynamic(() => import('@/components/DashboardChallenges'), {
  loading: () => <CardSkeleton h="h-24" title="🏆" />,
});
const DailyMissions = nextDynamic(() => import('@/components/DailyMissions'), {
  loading: () => <CardSkeleton h="h-40" title="🎯" />,
});
const FollowingPanel = nextDynamic(() => import('@/components/FollowingPanel'), {
  loading: () => <CardSkeleton h="h-32" title="👥" />,
});
const PersonalizedGear = nextDynamic(() => import('@/components/PersonalizedGear'), {
  loading: () => <CardSkeleton h="h-36" title="🎁" />,
});
const TrendingGear = nextDynamic(() => import('@/components/TrendingGear'), {
  loading: () => <CardSkeleton h="h-36" title="🔥" />,
});
const DynamicLeaderboard = nextDynamic(() => import('@/components/DynamicLeaderboard'), {
  loading: () => <CardSkeleton h="h-64" title="🏅" />,
});

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth();
  const t = await getTranslations('Dashboard');

  if (!session?.user) {
    return <LandingPage />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id;
  let username = '';
  let mySteps = 0;
  let yesterdaySteps = 0;
  let weeklySteps = 0;
  let monthlySteps = 0;
  let lastWeekSteps = 0;
  let lastMonthSteps = 0;
  let stepGoal = 10000;
  let dbUserName: string | null = null;
  let dbUserImage: string | null = null;
  let bannerUrl: string | null = null;

  // JST 日付計算（同期処理）
  const now = new Date();
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jstDate.toISOString().split('T')[0];
  const yesterdayDate = new Date(jstDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  // 週間計算
  const currentDate = new Date(`${today}T00:00:00Z`);
  const utcDay = currentDate.getUTCDay();
  const daysToSubtract = (utcDay + 6) % 7;
  const thisWeekMonday = new Date(currentDate);
  thisWeekMonday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
  const thisWeekStartStr = thisWeekMonday.toISOString().split('T')[0];
  // 先週の計算（デスクトップ StepCalendar 用）
  const lastWeekMonday = new Date(thisWeekMonday);
  lastWeekMonday.setUTCDate(thisWeekMonday.getUTCDate() - 7);
  const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

  // 月間計算
  const [y, m] = today.split('-');
  const thisMonthStartStr = `${y}-${m}-01`;
  // 先月の計算（デスクトップ StepCalendar 用）
  const thisMonthDate = new Date(`${thisMonthStartStr}T00:00:00Z`);
  const lastMonthDate = new Date(thisMonthDate);
  lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
  const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

  // ⚡ パフォーマンス: ユーザー情報・歩数・グループ情報を並列取得
  const [userResult, stepsResult, membershipResult, rankingMap] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('username, step_goal, image, name, banner_url')
      .eq('id', userId)
      .single(),
    supabaseAdmin
      .from('daily_steps')
      .select('steps, date')
      .eq('user_id', userId)
      .gte('date', lastMonthStartStr),
    supabaseAdmin
      .from('group_members')
      .select('groups(keyword, header_image_url)')
      .eq('user_id', userId),
    getCachedGlobalRankingMap(),
  ]);

  const userData = userResult.data;
  stepGoal = userData?.step_goal || 10000;
  username = userData?.username || '';
  dbUserName = userData?.name || null;
  dbUserImage = userData?.image || null;
  bannerUrl = userData?.banner_url || null;

  // Override session image with fresh DB image
  if (userData) {
    if (userData.image) session.user.image = userData.image;
    if (userData.name) session.user.name = userData.name;
  }

  if (!userData?.username) {
    redirect('/setup');
  }

  // グループキーワード・バナー画像を抽出
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupKeywords = (membershipResult.data ?? [])
    .map((m: any) => m.groups?.keyword)
    .filter(Boolean) as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primaryGroupBanner = bannerUrl || (membershipResult.data ?? [])
    .map((m: any) => m.groups?.header_image_url)
    .find(Boolean) || null;

  // 歩数をメモリ内で集計
  const stepsMap = new Map<string, number>();
  stepsResult.data?.forEach(row => {
    stepsMap.set(row.date, row.steps);
  });
  mySteps = stepsMap.get(today) || 0;
  yesterdaySteps = stepsMap.get(yesterday) || 0;

  // 週間歩数: 今週月曜日〜今日
  weeklySteps = (stepsResult.data ?? [])
    .filter(row => row.date >= thisWeekStartStr && row.date <= today)
    .reduce((sum, row) => sum + row.steps, 0);

  // 先週歩数: 先週月曜日〜先週日曜日
  const lastWeekSundayDate = new Date(thisWeekMonday);
  lastWeekSundayDate.setUTCDate(thisWeekMonday.getUTCDate() - 1);
  const lastWeekSundayStr = lastWeekSundayDate.toISOString().split('T')[0];
  lastWeekSteps = (stepsResult.data ?? [])
    .filter(row => row.date >= lastWeekStartStr && row.date <= lastWeekSundayStr)
    .reduce((sum, row) => sum + row.steps, 0);

  // 月間歩数: 今月1日〜今日
  monthlySteps = (stepsResult.data ?? [])
    .filter(row => row.date >= thisMonthStartStr && row.date <= today)
    .reduce((sum, row) => sum + row.steps, 0);

  // 先月歩数
  const lastMonthEndDate = new Date(thisMonthDate);
  lastMonthEndDate.setUTCDate(lastMonthEndDate.getUTCDate() - 1);
  const lastMonthEndStr = lastMonthEndDate.toISOString().split('T')[0];
  lastMonthSteps = (stepsResult.data ?? [])
    .filter(row => row.date >= lastMonthStartStr && row.date <= lastMonthEndStr)
    .reduce((sum, row) => sum + row.steps, 0);

  // グローバルランキングからユーザーの週間順位を取得
  const rawGlobalRankings = transformRankingMapToLists(rankingMap);
  const optimizedRankings = optimizeRankingsForPayload(rawGlobalRankings, userId, 100);
  const myWeeklyEntry = optimizedRankings['WEEKLY'].find((r: RankingEntry) => r.users.id === userId);
  const globalRank = myWeeklyEntry ? optimizedRankings['WEEKLY'].indexOf(myWeeklyEntry) + 1 : null;

  const userImage = dbUserImage || session.user.image || null;

  return (
    <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
      {/* ヘッダー: モバイルではコンパクト (h-12) */}
      <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: '"Inter", sans-serif' }}>
                {t('title', { defaultMessage: 'UCFitness' })}
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20">
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

      {/* ===== モバイル: ポータルホーム画面 (sm未満のみ表示) ===== */}
      <div className="sm:hidden flex-1 flex flex-col">
        <HomePortal
          todaySteps={mySteps}
          yesterdaySteps={yesterdaySteps}
          weeklySteps={weeklySteps}
          monthlySteps={monthlySteps}
          stepGoal={stepGoal}
          userName={dbUserName || session.user.name || null}
          userImage={userImage}
          username={username}
          globalRank={globalRank}
        />
      </div>

      {/* ===== デスクトップ: リッチダッシュボード (sm以上のみ表示) ===== */}
      <div className="hidden sm:block">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-6">

            {/* モチベーションパネル */}
            <div className="motivation-panel flex flex-col justify-center h-full rounded-2xl p-4 sm:p-8 text-white shadow-xl shadow-[var(--theme-primary)]/20 relative overflow-hidden group min-h-[180px]">
              {primaryGroupBanner ? (
                <>
                  <div className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105" style={{ backgroundImage: `url(${primaryGroupBanner})` }} />
                  <div className="motivation-overlay absolute inset-0 bg-gradient-to-r from-[var(--theme-primary)]/90 to-[var(--theme-secondary)]/80" />
                </>
              ) : (
                <div className="motivation-overlay absolute inset-0 bg-gradient-to-br from-[var(--theme-gradient-from)] via-[var(--theme-secondary)] to-[var(--theme-gradient-to)]" />
              )}

              {/* 装飾円 */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" aria-hidden="true" />
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-40 h-40 bg-white/10 rounded-full blur-2xl" aria-hidden="true" />

              {/* ランナーアニメーション */}
              <div className="absolute top-1/2 right-2 transform -translate-y-1/2 opacity-100 pointer-events-none">
                <RunnerAnimation userImage={userImage} />
              </div>

              <div className="relative z-10 flex flex-col h-full">
                <div className="max-w-[65%]">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center justify-center p-2 bg-white/20 backdrop-blur-sm rounded-lg flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h4 className="font-black text-2xl tracking-tight whitespace-nowrap">{t('keepStepping')}</h4>
                  </div>
                  <p className="opacity-90 text-sm leading-snug font-medium text-indigo-50 mt-3 whitespace-nowrap">
                    {t('joinGroups').split('\n').map((line: string, i: number, arr: string[]) => (
                      <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                    ))}
                  </p>
                </div>

                {/* ナビゲーションボタン */}
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={username ? `/user/${username}` : '/profile'} className="motivation-btn-primary px-5 py-2 bg-white text-[var(--theme-primary)] text-sm font-bold rounded-full shadow-lg hover:bg-[var(--theme-primary-light)] transition-colors inline-flex items-center gap-1">
                    {t('profile')}
                  </Link>
                  <Link href="/groups" className="motivation-btn-secondary px-5 py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                    {t('groups')}
                  </Link>
                  <Link href="/wallet" className="motivation-btn-secondary px-5 py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                    <span className="text-sm">💰</span>{t('wallet')}
                  </Link>
                  <Link href="/challenges" className="motivation-btn-secondary px-5 py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                    <span className="text-sm">🏆</span>{t('challenges')}
                  </Link>
                  <Link href="/analytics" className="motivation-btn-secondary px-5 py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                    <span className="text-sm">📊</span>{t('analytics')}
                  </Link>
                  <Link href="/shop" className="motivation-btn-secondary px-5 py-2 bg-[var(--theme-primary)]/30 backdrop-blur-md text-white border border-white/20 text-sm font-bold rounded-full hover:bg-[var(--theme-primary)]/50 transition-colors inline-flex items-center gap-1">
                    <span className="text-sm">🛍️</span>{t('shop')}
                  </Link>
                </div>
              </div>
            </div>

            {/* アクティブチャレンジ */}
            <DashboardChallenges />

            {/* アクティビティ + デイリーミッション */}
            <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-5 gap-4 lg:items-stretch">
              <div className="lg:col-span-8 flex [&>div]:w-full [&>div>div]:h-full">
                <div className="w-full">
                  <StepCalendar
                    userId={userId}
                    showCalendar={false}
                    activity={{
                      todaySteps: mySteps,
                      yesterdaySteps,
                      weeklySteps,
                      lastWeekSteps,
                      monthlySteps,
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

            {/* フォロー中ユーザー */}
            <FollowingPanel />

            {/* リーダーボード */}
            <DynamicLeaderboard userId={userId} groupKeywords={groupKeywords} />

            {/* おすすめギア + 人気ギア */}
            <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-5 gap-4 lg:items-stretch">
              <div className="lg:col-span-5 flex [&>div]:w-full">
                <div className="w-full"><PersonalizedGear /></div>
              </div>
              <div className="lg:col-span-7 flex [&>div]:w-full">
                <div className="w-full"><TrendingGear userId={userId} /></div>
              </div>
            </div>

          </div>
        </div>
        <Footer />
      </div>

      {/* 非表示ユーティリティ */}
      <LoginBonusToast userId={userId} />
      <AutoSync />
    </main>
  );
}
