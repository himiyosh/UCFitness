export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { createLoginRequiredRedirect } from '@/lib/auth-redirect';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/navigation';
import UserMenu from '@/components/layout/UserMenu';
import RefreshButton from '@/components/layout/RefreshButton';
import NotificationBell from '@/components/layout/NotificationBell';
import Breadcrumbs from '@/components/layout/Breadcrumbs';
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('name, image, username')
        .eq('id', userId)
        .single();

    if (!dbUser?.username) {
        redirect('/setup');
    }

    return (
        <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
            {/* ヘッダー */}
            <header data-auth-header className="sticky top-0 z-50 overflow-visible border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-xl font-black tracking-tight text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary-strong)] sm:text-2xl" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-1">
                        <RefreshButton />
                        <NotificationBell />
                        <UserMenu user={{
                            id: userId,
                            name: dbUser?.name || session.user.name,
                            email: session.user.email,
                            image: dbUser?.image || session.user.image,
                        }} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
                {/* パンくずリスト */}
                <div className="mb-6">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                </div>

                {/* ページタイトル */}
                <div className="mb-8">
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2.5">
                        <span>🎯</span>
                        <span className="text-[var(--color-competition-strong)]">
                            {t('title')}
                        </span>
                    </h2>
                    <p className="mt-2.5 text-base text-[var(--color-text-muted)]">{t('headerDesc')}</p>
                    <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
                </div>

                {/* チャレンジコンテンツ */}
                <ChallengesPageClient currentUserId={userId} />
            </div>
            <Footer />
        </main>
    );
}
