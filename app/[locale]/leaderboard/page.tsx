export const runtime = 'edge';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Link } from '@/navigation';
import RefreshButton from '@/components/layout/RefreshButton';
import UserMenu from '@/components/layout/UserMenu';
import NotificationBell from '@/components/layout/NotificationBell';
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import DynamicLeaderboard from '@/components/dashboard/DynamicLeaderboard';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const session = await auth();
  const t = await getTranslations('Leaderboard');
  const dashboardT = await getTranslations('Dashboard');

  if (!session?.user) {
    redirect('/');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id;

  // ユーザー情報とグループ所属を並列取得
  const [userResult, membershipResult] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('name, image, username')
      .eq('id', userId)
      .single(),
    supabaseAdmin
      .from('group_members')
      .select('groups(keyword, image_url)')
      .eq('user_id', userId),
  ]);

  const dbUser = userResult.data;
  if (!dbUser?.username) {
    redirect('/setup');
  }

  // グループキーワードと画像情報を抽出
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupData = (membershipResult.data ?? [])
    .map((m: any) => m.groups)
    .filter(Boolean) as { keyword: string; image_url: string | null }[];
  const groupKeywords = groupData.map(g => g.keyword);
  const groupInfo = groupData.map(g => ({ keyword: g.keyword, imageUrl: g.image_url }));

  return (
    <main className="min-h-screen bg-[var(--theme-page-bg)]">
      <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <h1
                className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity"
                style={{ fontFamily: '"Inter", sans-serif' }}
              >
                {dashboardT('title')}
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20">
                {dashboardT('beta')}
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <RefreshButton />
            <NotificationBell />
            <UserMenu
              user={{
                id: userId,
                name: dbUser?.name || session.user.name,
                email: session.user.email,
                image: dbUser?.image || session.user.image,
              }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* パンくずリスト */}
        <div className="mb-4 sm:mb-6">
          <Breadcrumbs items={[{ label: t('leaderboard') }]} />
        </div>

        {/* ヒーローセクション — モバイルで目を引くグラデーションカード */}
        <div className="mb-6 sm:mb-8 relative overflow-hidden rounded-2xl leaderboard-hero-bg p-5 sm:p-6 text-white leaderboard-card-enter">
          {/* 背景デコレーション */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="absolute -top-4 -right-4 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-1/4 w-16 h-16 sm:w-20 sm:h-20 bg-white/5 rounded-full blur-xl" />
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight flex items-center gap-2.5">
                <span className="trophy-bounce inline-block">🏅</span>
                <span>{t('leaderboard')}</span>
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-white/80">
                {t('headerDesc')}
              </p>
            </div>
            {/* デスクトップのみ: ミニスタッツ */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex flex-col items-center px-4 py-2 bg-white/15 backdrop-blur-sm rounded-xl">
                <span className="text-2xl font-black tabular-nums">{t('periods.daily')}</span>
                <span className="text-xs text-white/70 font-medium">{t('rankHeader')}</span>
              </div>
            </div>
          </div>
          {/* グラデーションライン装飾 */}
          <div className="mt-4 h-0.5 w-20 rounded-full bg-white/30" />
        </div>

        {/* リーダーボード本体 */}
        <DynamicLeaderboard userId={userId} groupKeywords={groupKeywords} groupInfo={groupInfo} />
      </div>
    </main>
  );
}
