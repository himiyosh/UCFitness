export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { createLoginRequiredRedirect } from '@/lib/auth-redirect';
import { reportError } from '@/lib/errors';
import { loadManagedChallengeGroups } from '@/lib/services/managed-challenge-groups';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import PageIntro from '@/components/layout/PageIntro';
import ChallengesPageClient from '@/components/challenge/ChallengesPageClient';
import Footer from '@/components/layout/Footer';

// ============================================
// チャレンジページ（Server Component）
// 標準ヘッダー + 認証チェック + クライアントコンポーネント描画
// ============================================

export const dynamic = 'force-dynamic';

export default async function ChallengesPage() {
    // ⭐ パフォーマンス: 認証と翻訳を並列取得
    const [session, t, dashboardT, locale] = await Promise.all([
        auth(),
        getTranslations('Challenge'),
        getTranslations('Dashboard'),
        getLocale(),
    ]);

    if (!session?.user) {
        redirect(createLoginRequiredRedirect(locale, '/challenges'));
    }

    const userId = session.user.id;

    const [dbUserResult, managedGroups] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('name, image, username')
            .eq('id', userId)
            .single(),
        loadManagedChallengeGroups(userId),
    ]);
    const { data: dbUser, error: dbUserError } = dbUserResult;

    if (dbUserError) {
        reportError('challenges:user', dbUserError, { userId });
        throw new Error('Failed to load challenge user');
    }

    if (!dbUser?.username) {
        redirect('/setup');
    }

    return (
        <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
            <AuthenticatedPageHeader
                appTitle={dashboardT('title')}
                betaLabel={dashboardT('beta')}
                contextLabel={t('title')}
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
                    headingId="challenges-page-title"
                    title={t('title')}
                    description={t('headerDesc')}
                    icon="challenges"
                    tone="competition"
                    breadcrumbs={[{ label: t('title') }]}
                />

                {/* チャレンジコンテンツ */}
                <ChallengesPageClient
                    currentUserId={userId}
                    managedGroups={managedGroups}
                />
            </div>
            <Footer />
        </main>
    );
}
