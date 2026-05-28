export const runtime = 'edge';

import { supabaseAdmin } from '@/lib/supabase';
import { Link } from '@/navigation';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import RefreshButton from '@/components/layout/RefreshButton';
import UserMenu from '@/components/layout/UserMenu';
import { auth } from "@/lib/auth";
import nextDynamic from 'next/dynamic';
import AutoSync from '@/components/AutoSync';
import Footer from '@/components/layout/Footer';
import LandingPage from '@/components/LandingPage';
import HomePortal from '@/components/dashboard/HomePortal';
import QuickActions from '@/components/dashboard/QuickActions';
import HomeHero from '@/components/dashboard/HomeHero';

// ⚡ パフォーマンス: 重いクライアントコンポーネントを遅延読み込み
const LoginBonusToast = nextDynamic(() => import('@/components/auth/LoginBonusToast'));
const NotificationBell = nextDynamic(() => import('@/components/layout/NotificationBell'));

// スケルトンローディングプレースホルダー（チャンク読み込み中に表示）
const CardSkeleton = ({ h = 'h-32' }: { h?: string }) => (
  <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-5 animate-pulse">
    <div className="mb-3 h-4 w-28 rounded bg-gray-200" />
    <div className={`${h} bg-gray-100 rounded-lg`} />
  </div>
);

const DashboardChallenges = nextDynamic(() => import('@/components/dashboard/DashboardChallenges'), {
  loading: () => <CardSkeleton h="h-24" />,
});
const DailyMissions = nextDynamic(() => import('@/components/dashboard/DailyMissions'), {
  loading: () => <CardSkeleton h="h-40" />,
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

  const globalRank = null;
  const nextRankGap = null;
  const userImage = dbUserImage || session.user.image || null;

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-[var(--theme-page-bg)]">
      {/* ヘッダー: モバイル〜md では表示、lg 以上ではサイドバーがあるためコンパクト */}
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:hidden">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
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

      <div className="flex-1 flex flex-col min-w-0">

      {/* lg 以上のヘッダー（サイドバーと共存するコンパクト版） */}
      <header className="sticky top-0 z-40 hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:block">
        <div className="mx-auto flex h-11 w-full max-w-7xl items-center justify-end px-3 lg:px-4 xl:px-5">
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
          stepGoal={stepGoal}
          userName={dbUserName || session.user.name || null}
          userImage={userImage}
          username={username}
          globalRank={globalRank}
          hasTodaySteps={hasTodayStepRecord}
          nextRankGap={nextRankGap}
        />
      </div>

      {/* ===== デスクトップ: 1カラムレイアウト (sm以上のみ表示) ===== */}
      <div className="hidden sm:flex flex-1 flex-col mx-auto max-w-7xl w-full">
        <div className="w-full px-3 lg:px-4 xl:px-5 py-2 pb-3 flex flex-col gap-2">

            {/* 上部: Today Command Center / デイリーミッション */}
            <div className="grid grid-cols-1 gap-2 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(220px,0.55fr)] lg:items-stretch">
              <div>
                <HomeHero
                  todaySteps={mySteps}
                  stepGoal={stepGoal}
                  userName={dbUserName || session.user.name || null}
                  userImage={userImage}
                  username={username}
                  globalRank={globalRank}
                  hasTodaySteps={hasTodayStepRecord}
                  nextRankGap={nextRankGap}
                />
              </div>
              <div>
                <DailyMissions />
              </div>
              <div>
                <DashboardChallenges />
              </div>
            </div>

            <div>
              <QuickActions />
            </div>

        </div>
        <Footer />
      </div>

      </div>{/* /メインコンテンツ領域 */}

      {/* 非表示ユーティリティ */}
      <LoginBonusToast userId={userId} />
      <AutoSync />
    </main>
  );
}
