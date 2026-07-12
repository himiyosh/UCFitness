export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { Link } from '@/navigation';
import UserMenu from "@/components/layout/UserMenu";
import RefreshButton from '@/components/layout/RefreshButton';
import NotificationBell from '@/components/layout/NotificationBell';
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import AmazonProductSearch from "@/components/AmazonProductSearch";
import { getTranslations, getLocale } from "next-intl/server";
import Footer from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage() {
    // ⭐ パフォーマンス: 認証と翻訳を並列取得
    const [session, t, dashboardT, locale] = await Promise.all([
        auth(),
        getTranslations('Recommendations'),
        getTranslations('Dashboard'),
        getLocale(),
    ]);

    if (!session || !session.user) {
        redirect(createLoginRequiredRedirect(locale, "/recommendations"));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("name, email, image, username")
        .eq("id", userId)
        .single();

    if (userError) {
        reportError('recommendations:user', userError, { userId });
        throw new Error('Failed to load recommendation user');
    }
    if (!user?.username) {
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
                            ...session.user,
                            name: user?.name || session.user.name,
                            image: user?.image || session.user.image,
                        }} />
                    </div>
                </div>
            </header>

            {/* コンテンツ */}
            <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
                {/* パンくずリスト */}
                <div className="mb-6">
                    <Breadcrumbs items={[
                        { label: t('title') },
                    ]} />
                </div>

                {/* ヒーローバナー */}
                <div className="relative mb-8 overflow-hidden rounded-2xl border border-[var(--color-reward)]/30 bg-[var(--color-reward-soft)] shadow-sm">
                    <div className="absolute right-0 top-0 h-56 w-56 -translate-y-24 translate-x-24 rounded-full bg-[var(--color-reward)]/10" />
                    <div className="absolute bottom-0 left-0 h-44 w-44 -translate-x-20 translate-y-20 rounded-full bg-[var(--color-reward)]/10" />

                    <div className="relative z-10 p-6 sm:p-8">
                        <h2 className="text-3xl font-black leading-tight tracking-tight text-[var(--color-reward-strong)] sm:text-4xl">
                            {t('heroTitle')}
                        </h2>
                        <p className="mt-2 max-w-lg text-sm text-[var(--color-text)] sm:text-base">
                            {t('heroDescription')}
                        </p>
                    </div>
                </div>

                {/* ページヘッダー */}
                <div className="mb-8">
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
                        <span>🔍</span>
                        <span className="text-[var(--color-reward-strong)]">
                            {t('searchTitle')}
                        </span>
                    </h3>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                        {t('searchDescription')}
                    </p>
                    <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
                </div>

                {/* 検索コンポーネント */}
                <AmazonProductSearch locale={locale} />
            </div>
            <Footer />
        </main>
    );
}
