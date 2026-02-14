export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { Link } from '@/navigation';
import UserMenu from "@/components/UserMenu";
import RefreshButton from '@/components/RefreshButton';
import Breadcrumbs from "@/components/Breadcrumbs";
import AmazonProductSearch from "@/components/AmazonProductSearch";
import { getTranslations, getLocale } from "next-intl/server";

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage() {
    const session = await auth();
    const t = await getTranslations('Recommendations');
    const dashboardT = await getTranslations('Dashboard');
    const locale = await getLocale();

    if (!session || !session.user) {
        redirect("/");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    const { data: user } = await supabaseAdmin
        .from("users")
        .select("name, email, image, username")
        .eq("id", userId)
        .single();

    if (!user?.username) {
        redirect('/setup');
    }

    return (
        <main className="min-h-screen bg-[var(--theme-page-bg)]">
            {/* ヘッダー */}
            <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: '"Inter", sans-serif' }}>
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
                            ...session.user,
                            name: user?.name || session.user.name,
                            image: user?.image || session.user.image,
                        }} />
                    </div>
                </div>
            </header>

            {/* コンテンツ */}
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
                {/* パンくずリスト */}
                <div className="mb-6">
                    <Breadcrumbs items={[
                        { label: t('title') },
                    ]} />
                </div>

                {/* ヒーローバナー */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 mb-8 shadow-lg">
                    <div className="absolute top-0 right-0 w-56 h-56 bg-white/10 rounded-full -translate-y-24 translate-x-24" />
                    <div className="absolute bottom-0 left-0 w-44 h-44 bg-white/10 rounded-full translate-y-20 -translate-x-20" />
                    <div className="absolute top-1/3 left-1/2 w-32 h-32 bg-white/5 rounded-full" />

                    <div className="relative z-10 p-6 sm:p-8">
                        <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)] leading-none">
                            {t('heroTitle')}
                        </h2>
                        <p className="mt-2 text-white/80 text-sm sm:text-base max-w-lg">
                            {t('heroDescription')}
                        </p>
                    </div>
                </div>

                {/* ページヘッダー */}
                <div className="mb-8">
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
                        <span>🔍</span>
                        <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
                            {t('searchTitle')}
                        </span>
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                        {t('searchDescription')}
                    </p>
                    <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
                </div>

                {/* 検索コンポーネント */}
                <AmazonProductSearch locale={locale} />
            </div>
        </main>
    );
}
