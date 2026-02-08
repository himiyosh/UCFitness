import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { Link } from '@/navigation';
import UserMenu from "@/components/UserMenu";
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
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        👛 {t('title')}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
                </div>

                {/* コンテンツ */}
                <div className="space-y-6">
                    {/* 残高カード + 統計 */}
                    <CoinBalanceCard balance={balance} todayEarned={todayEarned} />

                    {/* 資産推移チャート */}
                    <CoinGrowthChart data={balanceHistory} />

                    {/* 投資家ランクパネル + 取引履歴（横並び 1:4） */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1">
                            <InvestorRankPanel currentRank={balance.investor_rank} totalBalance={balance.total_balance} />
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
