export const runtime = 'edge';

import { Suspense } from "react";

import { redirect } from "next/navigation";

import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/navigation";
import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { getPersonalAnalytics } from "@/lib/services/analytics-service";
import { supabaseAdmin } from "@/lib/supabase";

import Breadcrumbs from "@/components/layout/Breadcrumbs";
import Footer from '@/components/layout/Footer';
import NotificationBell from '@/components/layout/NotificationBell';
import UserMenu from "@/components/layout/UserMenu";
import RefreshButton from '@/components/layout/RefreshButton';
import PersonalAnalytics from '@/components/profile/PersonalAnalytics';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
    // ⚡ パフォーマンス: 翻訳取得を並列化
    const [session, t, dashboardT, locale] = await Promise.all([
        auth(),
        getTranslations('Analytics'),
        getTranslations('Dashboard'),
        getLocale(),
    ]);

    if (!session?.user) {
        redirect(createLoginRequiredRedirect(locale, "/analytics"));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;
    const user = session.user;

    // DB からカスタムプロフィール画像を取得（Fitbit OAuth 画像ではなく）
    const { data: dbUser } = await supabaseAdmin
        .from("users")
        .select("name, image, username")
        .eq("id", userId)
        .single();

    if (!dbUser?.username) {
        redirect('/setup');
    }

    return (
        <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
            {/* ヘッダー: 他ページ共通パターン */}
            <header data-auth-header className="sticky top-0 z-50 overflow-visible border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1
                                className="text-xl font-black tracking-tight text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary-strong)] sm:text-2xl"
                                style={{ fontFamily: 'var(--font-inter), sans-serif' }}
                            >
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
                            name: dbUser?.name || user.name,
                            email: user.email,
                            image: dbUser?.image || user.image,
                        }} />
                    </div>
                </div>
            </header>

            {/* コンテンツ */}
            <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
                {/* パンくずリスト */}
                <div className="mb-6">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                </div>

                {/* ページタイトル */}
                <div className="mb-8">
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2.5">
                        <span>📊</span>
                        <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
                            {t('title')}
                        </span>
                    </h2>
                    <p className="mt-2.5 text-base text-gray-500">{t('headerDesc')}</p>
                    <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
                </div>

                <Suspense fallback={<AnalyticsInlineSkeleton />}>
                    <PersonalAnalyticsSection userId={userId} />
                </Suspense>
            </div>
            <Footer />
        </main>
    );
}

async function PersonalAnalyticsSection({ userId }: { userId: string }) {
    const analyticsData = await getPersonalAnalytics(userId, 3);

    return <PersonalAnalytics initialData={analyticsData} />;
}

function AnalyticsInlineSkeleton() {
    return (
        <div className="space-y-3" aria-busy="true" aria-label="分析データを読み込み中">
            <div className="rounded-3xl border border-white/40 bg-white/80 p-4 shadow-sm">
                <div className="h-4 w-24 rounded-full bg-gray-200" />
                <div className="mt-3 h-8 w-40 rounded-full bg-gray-200" />
                <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-2xl bg-gray-100" />
                    <div className="h-16 rounded-2xl bg-gray-100" />
                    <div className="h-16 rounded-2xl bg-gray-100" />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="h-48 rounded-2xl bg-white/80 shadow-sm" />
                <div className="h-48 rounded-2xl bg-white/80 shadow-sm" />
            </div>
        </div>
    );
}
