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
import QuickActions from '@/components/QuickActions';

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

// デスクトップ用コンポーネント（右カラムウィジェット群）
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
      .select('username, step_goal, image, name')
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

  // Override session image with fresh DB image
  if (userData) {
    if (userData.image) session.user.image = userData.image;
    if (userData.name) session.user.name = userData.name;
  }

  if (!userData?.username) {
    redirect('/setup');
  }

  // グループキーワード・バナー画像を抽出
  const groupKeywords = (membershipResult.data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => m.groups?.keyword)
    .filter(Boolean) as string[];

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
    <main className="min-h-screen flex flex-col bg-[var(--theme-page-bg)]">
      {/* ヘッダー: モバイルではコンパクト (h-12) */}
      <header className="glass-card border-b border-[var(--theme-primary)]/10 sticky top-0 z-50 !rounded-none">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: '"Inter", sans-serif' }}>
                {t('title', { defaultMessage: 'UCFitness' })}
              </h1>
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

      {/* ===== デスクトップ: 1カラムレイアウト (sm以上のみ表示) ===== */}
      <div className="hidden sm:flex flex-1 flex-col mx-auto max-w-7xl w-full">
        <div className="w-full px-4 lg:px-6 xl:px-8 py-3 lg:py-4 pb-4 flex flex-col gap-3">

            {/* 上部: アクティビティサマリー (左) / デイリーミッション & クイックアクション (右) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start lg:items-stretch">
              <div className="animate-fadeInUp">
                <StepCalendar
                  userId={userId}
                  userName={dbUserName || session.user.name || null}
                  userImage={userImage}
                  username={username}
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
              <div className="animate-fadeInUp delay-100 h-full">
                <DailyMissions />
              </div>
            </div>

            <div className="animate-fadeInUp delay-150">
              <QuickActions />
            </div>

            {/* リーダーボード */}
            <div className="animate-fadeInUp delay-300">
              <DynamicLeaderboard userId={userId} groupKeywords={groupKeywords} />
            </div>

            {/* 追加パネル */}
            <div className="flex flex-col gap-4 animate-fadeInUp delay-400">
                <DashboardChallenges />

                {/* フォロー中ユーザー */}
                <FollowingPanel />

                {/* おすすめギア + 人気ギア */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <PersonalizedGear />
                  <TrendingGear userId={userId} />
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




