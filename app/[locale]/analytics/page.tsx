export const runtime = 'edge';

import { Suspense } from "react";

import { redirect } from "next/navigation";

import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { getPersonalAnalytics } from "@/lib/services/analytics-service";
import { supabaseAdmin } from "@/lib/supabase";

import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import Footer from '@/components/layout/Footer';
import PageIntro from '@/components/layout/PageIntro';
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
            <AuthenticatedPageHeader
                appTitle={dashboardT('title')}
                betaLabel={dashboardT('beta')}
                contextLabel={t('title')}
                user={{
                    id: userId,
                    username: dbUser.username,
                    name: dbUser.name || user.name,
                    email: user.email,
                    image: dbUser.image || user.image,
                }}
            />

            {/* コンテンツ */}
            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                <PageIntro
                    headingId="analytics-page-title"
                    title={t('title')}
                    description={t('headerDesc')}
                    icon="analytics"
                    tone="primary"
                    breadcrumbs={[{ label: t('title') }]}
                />

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
