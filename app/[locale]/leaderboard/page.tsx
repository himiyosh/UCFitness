export const runtime = 'edge';

import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { createLoginRequiredRedirect } from '@/lib/auth-redirect';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import Footer from '@/components/layout/Footer';
import PageIntro from '@/components/layout/PageIntro';
import DynamicLeaderboard from '@/components/dashboard/DynamicLeaderboard';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const [session, t, dashboardT, locale] = await Promise.all([
    auth(),
    getTranslations('Leaderboard'),
    getTranslations('Dashboard'),
    getLocale(),
  ]);

  if (!session?.user) {
    redirect(createLoginRequiredRedirect(locale, '/leaderboard'));
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
  if (userResult.error) {
    reportError('leaderboard:user', userResult.error, { userId });
    throw new Error('Failed to load leaderboard user');
  }
  if (membershipResult.error) {
    reportError('leaderboard:memberships', membershipResult.error, { userId });
    throw new Error('Failed to load leaderboard memberships');
  }
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
      <AuthenticatedPageHeader
        appTitle={dashboardT('title')}
        betaLabel={dashboardT('beta')}
        contextLabel={t('leaderboard')}
        user={{
          id: userId,
          username: dbUser.username,
          name: dbUser.name || session.user.name,
          email: session.user.email,
          image: dbUser.image || session.user.image,
        }}
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <PageIntro
          headingId="leaderboard-page-title"
          title={t('leaderboard')}
          description={t('headerDesc')}
          icon="leaderboard"
          tone="competition"
          breadcrumbs={[{ label: t('leaderboard') }]}
        />

        {/* リーダーボード本体 */}
        <DynamicLeaderboard userId={userId} groupKeywords={groupKeywords} groupInfo={groupInfo} />
      </div>
      <Footer />
    </main>
  );
}
