export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/navigation";
import UserMenu from "@/components/UserMenu";
import RefreshButton from '@/components/RefreshButton';
import Breadcrumbs from "@/components/Breadcrumbs";
import nextDynamic from 'next/dynamic';
import { supabaseAdmin } from "@/lib/supabase";
import Footer from '@/components/Footer';

// ⚡ パフォーマンス: クライアントコンポーネントを遅延読み込み
const PersonalAnalytics = nextDynamic(() => import('@/components/PersonalAnalytics'));

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
    const session = await auth();
    const t = await getTranslations('Analytics');
    const dashboardT = await getTranslations('Dashboard');

    if (!session?.user) {
        redirect("/");
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
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-1">
                        <RefreshButton />
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

                <PersonalAnalytics userId={userId} />
            </div>
            <Footer />
        </main>
    );
}
