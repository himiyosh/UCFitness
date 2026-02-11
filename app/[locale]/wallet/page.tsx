export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { Link } from '@/navigation';
import UserMenu from "@/components/UserMenu";
import UCHintBalloon from "@/components/UCHintBalloon";
import Breadcrumbs from "@/components/Breadcrumbs";
import CoinBalanceCard from "@/components/CoinBalanceCard";
import CoinGrowthChart from "@/components/CoinGrowthChart";
import TransactionHistory from "@/components/TransactionHistory";
import InvestorRankPanel from "@/components/InvestorRankPanel";
import { getCoinBalance, getRecentTransactions, getDailyBalanceHistory } from "@/lib/coin-service";
import { getTranslations } from "next-intl/server";

export const dynamic = 'force-dynamic';

export default async function BankPage() {
    const session = await auth();
    const t = await getTranslations('Bank');
    const dashboardT = await getTranslations('Dashboard');

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
    const [balance, transactions, balanceHistory] = await Promise.all([
        getCoinBalance(userId),
        getRecentTransactions(userId, 60),
        getDailyBalanceHistory(userId, 30),
    ]);

    // 今日の獲得コインを計算
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstDate.toISOString().split('T')[0];
    const todayEarned = transactions
        .filter(tx => tx.date === today)
        .reduce((sum, tx) => sum + tx.amount, 0);

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
                    <UserMenu user={{
                        ...session.user,
                        name: user?.name || session.user.name,
                        image: user?.image || session.user.image
                    }} />
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
                {/* パンくずリスト */}
                <div className="mb-6">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                </div>

                {/* ページヘッダー */}
                <div className="mb-8">
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2.5">
                        <span>👛</span>
                        <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
                            {t('title')}
                        </span>
                    </h2>
                    <p className="mt-2.5 text-base text-gray-500">
                        {t('headerDesc')} <UCHintBalloon />
                    </p>
                    <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
                </div>

                {/* コンテンツ */}
                <div className="space-y-6">
                    {/* 残高カード + 統計 */}
                    <CoinBalanceCard balance={balance} todayEarned={todayEarned} />

                    {/* 資産推移チャート */}
                    <CoinGrowthChart data={balanceHistory} />

                    {/* ショップ導線 */}
                    <Link href="/shop" className="block group">
                        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--theme-primary)] via-[var(--theme-primary)]/85 to-purple-600 p-4 sm:p-5 shadow-md hover:shadow-xl hover:scale-[1.005] transition-all duration-300">
                            <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full -translate-y-14 translate-x-14"></div>
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-10 -translate-x-10"></div>
                            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                                <div className="flex items-center gap-3 sm:gap-4">
                                    <span className="text-2xl sm:text-3xl drop-shadow-md">🛍️</span>
                                    <div>
                                        <h3 className="text-base sm:text-lg font-extrabold text-white drop-shadow-sm">{t('shopCta')}</h3>
                                        <p className="text-xs sm:text-sm text-white/80">{t('shopCtaDesc')}</p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-white text-[var(--theme-primary)] text-sm font-extrabold shadow-lg group-hover:shadow-xl group-hover:gap-3 transition-all duration-300 whitespace-nowrap self-stretch sm:self-auto">
                                    {t('shopCtaButton')}
                                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                </span>
                            </div>
                        </div>
                    </Link>

                    {/* 投資家ランクパネル + 取引履歴（横並び 1:4） */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1">
                            <InvestorRankPanel currentRank={balance.investor_rank} lifetimeEarnings={balance.total_earned + balance.total_bonus} />
                        </div>
                        <div className="md:col-span-2">
                            <TransactionHistory transactions={transactions} />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
