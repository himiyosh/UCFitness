export const runtime = 'edge';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Link } from '@/navigation';
import RefreshButton from '@/components/RefreshButton';
import UserMenu from '@/components/UserMenu';
import NotificationBell from '@/components/NotificationBell';
import Breadcrumbs from '@/components/Breadcrumbs';
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
      .select('groups(keyword)')
      .eq('user_id', userId),
  ]);

  const dbUser = userResult.data;
  if (!dbUser?.username) {
    redirect('/setup');
  }

  // グループキーワードを抽出
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupKeywords = (membershipResult.data ?? [])
    .map((m: any) => m.groups?.keyword)
    .filter(Boolean) as string[];

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

      <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* パンくずリスト */}
        <div className="mb-6">
          <Breadcrumbs items={[{ label: t('leaderboard') }]} />
        </div>

        {/* ページタイトル */}
        <div className="mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2.5">
            <span>🏅</span>
            <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
              {t('leaderboard')}
            </span>
          </h2>
          <p className="mt-2.5 text-base text-gray-500">{t('headerDesc')}</p>
          <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
        </div>

        {/* リーダーボード本体 */}
        <DynamicLeaderboard userId={userId} groupKeywords={groupKeywords} />
      </div>
    </main>
  );
}
