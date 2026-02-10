export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { Link } from '@/navigation';
import UserMenu from "@/components/UserMenu";
import Breadcrumbs from "@/components/Breadcrumbs";
import ShopClient from "@/components/ShopClient";
import { getShopItems, getUserItems, getEquippedItems } from "@/lib/shop-service";
import { getCoinBalance, getInvestorRank } from "@/lib/coin-service";
import { getTranslations, getLocale } from "next-intl/server";

export const dynamic = 'force-dynamic';

export default async function ShopPage() {
    const session = await auth();
    const t = await getTranslations('Shop');
    const dashboardT = await getTranslations('Dashboard');
    const locale = await getLocale();

    if (!session || !session.user) {
        redirect("/");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    // ユーザー情報取得
    const { data: user } = await supabaseAdmin
        .from("users")
        .select("name, email, image, username, step_goal")
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

    const userRank = balance ? getInvestorRank(balance.total_balance) : { rank: 'BEGINNER' };

    return (
        <main className="min-h-screen bg-[var(--theme-page-bg)]">
            {/* ヘッダー */}
            <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity">
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    <UserMenu user={{
                        ...session.user,
                        name: user?.name || session.user.name,
                        image: user?.image || session.user.image,
                    }} />
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

                {/* ページヘッダー */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] p-5 sm:p-6 mb-6 shadow-md">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
                    <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/10 rounded-full translate-y-12 -translate-x-12" />
                    <div className="relative">
                        <h2 className="text-2xl sm:text-3xl font-black text-white drop-shadow-sm flex items-center gap-2">
                            🛍️ {t('title')}
                        </h2>
                        <p className="text-sm sm:text-base text-white/85 mt-1.5 font-medium">{t('headerDesc')}</p>
                    </div>
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
                />
            </div>
        </main>
    );
}
