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
import CoinBalanceCard from "@/components/CoinBalanceCard";
import nextDynamic from 'next/dynamic';
import { getCoinBalance, getRecentTransactions, getDailyBalanceHistory } from "@/lib/services/coin-service";
import { getLocale, getTranslations } from "next-intl/server";
import Footer from '@/components/layout/Footer';

// ⚡ パフォーマンス: Recharts系の重いチャートコンポーネントを遅延読み込み
// ※ Server Component では ssr: false は使用不可 — Client Component 内でのみ使用可能
const CoinGrowthChart = nextDynamic(() => import('@/components/CoinGrowthChart'), {
    loading: () => <div className="w-full h-64 rounded-xl bg-gray-100 animate-pulse" />,
});
const TransactionHistory = nextDynamic(() => import('@/components/TransactionHistory'));
const InvestorRankPanel = nextDynamic(() => import('@/components/InvestorRankPanel'));
const EarningBreakdown = nextDynamic(() => import('@/components/EarningBreakdown'));

export const dynamic = 'force-dynamic';

export default async function BankPage() {
    const session = await auth();
    // ⚡ パフォーマンス: 翻訳取得を並列化
    const [t, dashboardT, locale] = await Promise.all([
        getTranslations('Bank'),
        getTranslations('Dashboard'),
        getLocale(),
    ]);

    if (!session || !session.user) {
        redirect(createLoginRequiredRedirect(locale, "/wallet"));
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
                            image: user?.image || session.user.image
                        }} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
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
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
                    <div className="min-w-0 space-y-3">
                        {/* 残高カード + 統計 */}
                        <CoinBalanceCard balance={balance} todayEarned={todayEarned} />

                        {/* 資産推移チャート */}
                        <CoinGrowthChart data={balanceHistory} />

                        {/* コイン獲得分析 */}
                        <EarningBreakdown transactions={transactions} />
                    </div>

                    <div className="min-w-0 space-y-3">
                        {/* ショップ導線 */}
                        <Link href="/shop" className="block group">
                            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--theme-primary)] via-[var(--theme-primary)]/85 to-purple-600 p-3 shadow-md transition-all duration-300 hover:shadow-xl">
                                <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full -translate-y-12 translate-x-12"></div>
                                <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/10 rounded-full translate-y-9 -translate-x-9"></div>
                                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl drop-shadow-md">🛍️</span>
                                        <div>
                                            <h3 className="text-base font-extrabold text-white drop-shadow-sm">{t('shopCta')}</h3>
                                            <p className="text-xs text-white/80">{t('shopCtaDesc')}</p>
                                        </div>
                                    </div>
                                    <span className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-[var(--theme-primary)] shadow-lg transition-all duration-300 group-hover:gap-3 group-hover:shadow-xl">
                                        {t('shopCtaButton')}
                                        <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                    </span>
                                </div>
                            </div>
                        </Link>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)] xl:grid-cols-1">
                            <InvestorRankPanel currentRank={balance.investor_rank} lifetimeEarnings={balance.total_earned + balance.total_bonus} />
                            <TransactionHistory transactions={transactions} />
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </main>
    );
}
