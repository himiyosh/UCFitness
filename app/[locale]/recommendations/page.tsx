export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import PageIntro from '@/components/layout/PageIntro';
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
            <AuthenticatedPageHeader
                appTitle={dashboardT('title')}
                betaLabel={dashboardT('beta')}
                contextLabel={t('heroTitle')}
                user={{
                    ...session.user,
                    id: userId,
                    username: user.username,
                    name: user.name || session.user.name,
                    image: user.image || session.user.image,
                }}
            />

            {/* コンテンツ */}
            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                <PageIntro
                    headingId="recommendations-page-title"
                    title={t('heroTitle')}
                    description={t('heroDescription')}
                    icon="recommendations"
                    tone="reward"
                    breadcrumbs={[{ label: t('heroTitle') }]}
                />

                {/* ページヘッダー */}
                <div className="mb-8">
                    <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)] sm:text-2xl">
                        <span>🔍</span>
                        <span>
                            {t('searchTitle')}
                        </span>
                    </h2>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                        {t('searchDescription')}
                    </p>
                </div>

                {/* 検索コンポーネント */}
                <AmazonProductSearch locale={locale} />
            </div>
            <Footer />
        </main>
    );
}
