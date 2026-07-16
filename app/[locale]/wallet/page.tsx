export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from "@/lib/supabase";
import { getJSTDateString } from '@/lib/date-utils';
import { isValidStepGoal } from '@/lib/step-goal';
import {
    getNextWalletReward,
    summarizeWalletTransactions,
} from '@/lib/wallet-summary';
import { redirect } from "next/navigation";
import { Link } from '@/navigation';
import UCHintBalloon from "@/components/ui/UCHintBalloon";
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import PageIntro from '@/components/layout/PageIntro';
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

interface CapturedWalletDependency<T> {
    data: T | null;
    failed: boolean;
}

async function captureWalletDependency<T>(
    operation: string,
    userId: string,
    promise: Promise<T>,
): Promise<CapturedWalletDependency<T>> {
    try {
        return { data: await promise, failed: false };
    } catch (error: unknown) {
        reportError(operation, error, { userId });
        return { data: null, failed: true };
    }
}

export default async function BankPage(): Promise<React.ReactNode> {
    const session = await auth();
    // ⚡ パフォーマンス: 翻訳取得を並列化
    const [t, dashboardT, locale] = await Promise.all([
        getTranslations('Bank'),
        getTranslations('Dashboard'),
        getLocale(),
    ]);

    if (!session?.user?.id) {
        redirect(createLoginRequiredRedirect(locale, "/wallet"));
    }

    const userId = session.user.id;

    // ユーザー情報取得
    // ⚡ パフォーマンス: 必要なカラムのみ取得
    const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("name, image, username, step_goal")
        .eq("id", userId)
        .single();

    if (userError) {
        reportError('wallet:user', userError, { userId });
        throw new Error('Failed to load wallet user');
    }
    if (!user?.username) {
        redirect('/setup');
    }

    const today = getJSTDateString();

    // データを並列取得し、各パネルの障害を相互に隔離
    const [
        balanceState,
        transactionsState,
        balanceHistoryState,
        todayTransactionsResult,
        todayStepsResult,
    ] = await Promise.all([
        captureWalletDependency('wallet:balance', userId, getCoinBalance(userId)),
        captureWalletDependency('wallet:transactions', userId, getRecentTransactions(userId, 60)),
        captureWalletDependency('wallet:balance-history', userId, getDailyBalanceHistory(userId, 30)),
        supabaseAdmin
            .from('coin_transactions')
            .select('date, amount')
            .eq('user_id', userId)
            .eq('date', today),
        supabaseAdmin
            .from('daily_steps')
            .select('steps')
            .eq('user_id', userId)
            .eq('date', today)
            .maybeSingle(),
    ]);
    if (todayStepsResult.error) {
        reportError('wallet:today-steps', todayStepsResult.error, { userId, today });
    }
    if (todayTransactionsResult.error) {
        reportError('wallet:today-transactions', todayTransactionsResult.error, { userId, today });
    }

    const balance = balanceState.data;
    const transactions = transactionsState.data ?? [];
    const balanceHistory = balanceHistoryState.data ?? [];
    const todaySummary = todayTransactionsResult.error
        ? null
        : summarizeWalletTransactions(todayTransactionsResult.data ?? [], today);
    const todaySteps = typeof todayStepsResult.data?.steps === 'number'
        ? todayStepsResult.data.steps
        : null;
    const stepGoal = isValidStepGoal(user.step_goal) ? user.step_goal : null;
    const nextReward = todayStepsResult.error
        ? null
        : getNextWalletReward(todaySteps, stepGoal);
    const nextRewardStatus = todayStepsResult.error
        ? 'unavailable' as const
        : todaySteps === null
            ? 'steps-missing' as const
            : stepGoal === null
                ? 'goal-missing' as const
                : 'ready' as const;

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

            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                <PageIntro
                    headingId="wallet-page-title"
                    title={t('title')}
                    description={<>{t('headerDesc')} <UCHintBalloon /></>}
                    icon="wallet"
                    tone="reward"
                    breadcrumbs={[{ label: t('title') }]}
                />

                {/* コンテンツ */}
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
                    <div className="min-w-0 space-y-3">
                        {/* 残高カード + 統計 */}
                        <CoinBalanceCard
                            balance={balance}
                            todaySummary={todaySummary}
                            nextReward={nextReward}
                            nextRewardStatus={nextRewardStatus}
                        />

                        {/* 資産推移チャート */}
                        {balanceHistoryState.failed ? (
                            <p role="status" className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)]">
                                {t('balanceHistoryUnavailable')}
                            </p>
                        ) : (
                            <CoinGrowthChart data={balanceHistory} />
                        )}

                        {/* コイン獲得分析 */}
                        {transactionsState.failed ? (
                            <p role="status" className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)]">
                                {t('transactionsUnavailable')}
                            </p>
                        ) : (
                            <EarningBreakdown transactions={transactions} />
                        )}
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

                        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)] xl:grid-cols-1">
                            {balance && (
                                <InvestorRankPanel currentRank={balance.investor_rank} lifetimeEarnings={balance.total_earned + balance.total_bonus} />
                            )}
                            <div className={!balance ? 'lg:col-span-2 xl:col-span-1' : undefined}>
                                {transactionsState.failed ? (
                                    <p role="status" className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)]">
                                        {t('transactionsUnavailable')}
                                    </p>
                                ) : (
                                    <TransactionHistory transactions={transactions} />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </main>
    );
}
