export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import UCHintBalloon from "@/components/ui/UCHintBalloon";
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import PageIntro from '@/components/layout/PageIntro';
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

    const userId = session.user.id;

    // ユーザー情報取得
    // ⚡ パフォーマンス: 必要なカラムのみ取得
    const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("name, image, username")
        .eq("id", userId)
        .single();

    if (userError) {
        reportError('shop:user', userError, { userId });
        throw new Error('Failed to load shop user');
    }
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
            <AuthenticatedPageHeader
                appTitle={dashboardT('title')}
                betaLabel={dashboardT('beta')}
                contextLabel={t('title')}
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
                    headingId="shop-page-title"
                    title={t('title')}
                    description={<>{t('headerDesc')} <UCHintBalloon /></>}
                    icon="shop"
                    tone="reward"
                    breadcrumbs={[{ label: t('title') }]}
                />

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
