export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { Link } from '@/navigation';
import UserMenu from "@/components/layout/UserMenu";
import RefreshButton from '@/components/layout/RefreshButton';
import NotificationBell from '@/components/layout/NotificationBell';
import UCHintBalloon from "@/components/ui/UCHintBalloon";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import ShopClient from "@/components/ShopClient";
import { getShopItems, getUserItems, getEquippedItems } from "@/lib/services/shop-service";
import { getCoinBalance, getInvestorRank } from "@/lib/services/coin-service";
import { getTranslations, getLocale } from "next-intl/server";
import Footer from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
    const resolvedParams = await searchParams;
    const session = await auth();
    // ⚡ パフォーマンス: 翻訳取得を並列化
    const [t, dashboardT, locale] = await Promise.all([
        getTranslations('Shop'),
        getTranslations('Dashboard'),
        getLocale(),
    ]);

    if (!session || !session.user) {
        const nextPath = resolvedParams.view
            ? `/shop?view=${encodeURIComponent(resolvedParams.view)}`
            : "/shop";
        redirect(createLoginRequiredRedirect(locale, nextPath));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    // ユーザー情報取得
    // ⚡ パフォーマンス: 必要なカラムのみ取得
    const { data: user } = await supabaseAdmin
        .from("users")
        .select("name, image, username")
        .eq("id", userId)
        .single();

    if (!user?.username) {
        redirect('/setup');
    }

    // データを並列取得
    const [items, userItems, equipped, balance] = await Promise.all([
        getShopItems(),
        getUserItems(userId),
        getEquippedItems(userId),
        getCoinBalance(userId),
    ]);

    const lifetimeEarnings = balance ? (balance.total_earned + balance.total_bonus) : 0;
    const userRank = balance ? getInvestorRank(lifetimeEarnings) : { rank: 'BEGINNER' };

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

                {/* ページヘッダー */}
                <div className="mb-8">
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2.5">
                        <span>🛍️</span>
                        <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
                            {t('title')}
                        </span>
                    </h2>
                    <p className="mt-2.5 text-base text-gray-500">
                        {t('headerDesc')} <UCHintBalloon />
                    </p>
                    <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
                </div>

                {/* ショップクライアント */}
                <ShopClient
                    items={items}
                    userItems={userItems}
                    equipped={equipped}
                    balance={balance?.total_balance ?? 0}
                    userRank={userRank.rank}
                    locale={locale}
                    userImage={user?.image ?? null}
                    userName={user?.name ?? null}
                    initialViewMode={resolvedParams.view === 'gear' ? 'gear' : resolvedParams.view === 'inventory' ? 'inventory' : 'shop'}
                />
            </div>
            <Footer />
        </main>
    );
}
