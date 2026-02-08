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
                            <span className="text-2xl" role="img" aria-label="logo">🏃</span>
                            <span className="text-lg font-bold text-[var(--theme-primary)] hidden sm:inline group-hover:opacity-80 transition-opacity">
                                {dashboardT('title')}
                            </span>
                        </Link>
                    </div>
                    <UserMenu user={{
                        ...session.user,
                        username: user.username,
                        id: userId,
                    }} />
                </div>
            </header>

            {/* コンテンツ */}
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
                {/* パンくずリスト */}
                <Breadcrumbs items={[
                    { label: t('title') },
                ]} />

                {/* タイトル */}
                <div className="mb-6">
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
                        🛍️ {t('title')}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
                </div>

                {/* ショップクライアント */}
                <ShopClient
                    items={items}
                    userItems={userItems}
                    equipped={equipped}
                    balance={balance?.total_balance ?? 0}
                    userRank={userRank.rank}
                    locale={locale}
                />
            </div>
        </main>
    );
}
