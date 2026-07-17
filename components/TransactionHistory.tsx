'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';

interface Transaction {
    id: string;
    date: string;
    type: string;
    amount: number;
    description: string;
    balance: number;
}

interface TransactionHistoryProps {
    transactions: Transaction[];
}

const TYPE_CONFIG: Record<string, { color: string; icon: string; key: string }> = {
    STEPS: { color: 'text-green-700', icon: '🚶', key: 'steps' },
    GOAL_BONUS: { color: 'text-blue-700', icon: '🎯', key: 'goalBonus' },
    STREAK_BONUS: { color: 'text-orange-700', icon: '🔥', key: 'streakBonus' },
    STREAK_MILESTONE: {
        color: 'text-[var(--color-reward-strong)]',
        icon: '🏅',
        key: 'streakMilestone',
    },
    RANK_BONUS: { color: 'text-purple-700', icon: '🏆', key: 'rankBonus' },
    PURCHASE: { color: 'text-red-600', icon: '🛍️', key: 'purchase' },
};

const TRANSACTION_PAGE_SIZE = 10;

function formatDate(dateStr: string): string {
    const [, month = '', day = ''] = dateStr.split('-');
    return `${month}/${day}`;
}

export default function TransactionHistory({ transactions }: TransactionHistoryProps) {
    const t = useTranslations('Bank');
    const locale = useLocale();
    const [visibleCount, setVisibleCount] = useState(TRANSACTION_PAGE_SIZE);

    // descriptionからロケールに応じたアイテム名を取得
    // 新形式: "Shop: English Name / 日本語名"
    // 旧形式: "Shop: English Name"
    const getPurchaseItemName = useCallback((description: string) => {
        const content = description.replace(/^Shop:\s*/, '');
        const parts = content.split(' / ');
        if (parts.length === 2) {
            return locale === 'ja' ? parts[1] : parts[0];
        }
        return content; // 旧形式フォールバック
    }, [locale]);

    const filteredTransactions = useMemo(
        () => transactions?.filter(tx => tx.amount !== 0) ?? [],
        [transactions]
    );
    const visibleTransactions = useMemo(
        () => filteredTransactions.slice(0, visibleCount),
        [filteredTransactions, visibleCount],
    );
    const remainingCount = Math.max(0, filteredTransactions.length - visibleCount);

    if (filteredTransactions.length === 0) {
        return (
            <div className="midnight-solid-panel rounded-xl bg-white p-3 shadow-sm sm:p-5">
                <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-gray-900">
                    📒 {t('transactionHistory')}
                </h3>
                <p className="mb-3 text-xs leading-5 text-[var(--color-text-muted)]">
                    {t('transactionHistoryDescription')}
                </p>
                <div className="flex h-32 items-center justify-center text-sm text-[var(--color-text-muted)]">
                    {t('noTransactions')}
                </div>
            </div>
        );
    }

    return (
        <div className="midnight-solid-panel overflow-hidden rounded-xl bg-white p-3 shadow-sm transition-shadow hover:shadow-[0_8px_30px_-4px_var(--theme-glow-primary,rgba(79,70,229,0.08))] sm:p-5">
            <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                📒 {t('transactionHistory')}
            </h3>
            <p className="mb-3 text-xs leading-5 text-[var(--color-text-muted)]">
                {t('transactionHistoryDescription')}
            </p>

            {/* テーブルヘッダー */}
            <div className="grid grid-cols-[44px_1fr_72px_80px] gap-1 border-b border-gray-100/60 px-2 pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] sm:grid-cols-[56px_1fr_100px_120px] sm:gap-2">
                <span>{t('date')}</span>
                <span>{t('detail')}</span>
                <span className="text-right">{t('transactionAmount')}</span>
                <span className="text-right">{t('balance')}</span>
            </div>

            {/* トランザクション行 */}
            <div>
                {visibleTransactions.map((tx, i) => {
                    const config = TYPE_CONFIG[tx.type] || TYPE_CONFIG.STEPS;
                    const isPositive = tx.amount >= 0;
                    // 日付が前の行と同じなら非表示
                    const showDate = i === 0 || visibleTransactions[i - 1].date !== tx.date;

                    return (
                        <div
                            key={tx.id}
                            className={`grid grid-cols-[44px_1fr_72px_80px] sm:grid-cols-[56px_1fr_100px_120px] gap-1 sm:gap-2 items-center px-2 pr-4 py-1.5 text-xs
                                ${showDate ? 'border-t border-gray-100' : ''}
                                hover:bg-gray-50 transition-colors`}
                        >
                            {/* 日付 */}
                            <span className="tabular-nums text-[var(--color-text-muted)]">
                                {showDate ? formatDate(tx.date) : ''}
                            </span>

                            {/* 内容 */}
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm flex-shrink-0">{config.icon}</span>
                                <div className="min-w-0">
                                    <span className={`font-medium truncate block ${config.color}`}>
                                        {t(config.key)}
                                    </span>
                                    {tx.type === 'PURCHASE' && tx.description && (
                                        <span className="block truncate text-xs text-[var(--color-text-muted)]">
                                            {getPurchaseItemName(tx.description)}
                                        </span>
                                    )}
                                    {tx.type === 'STREAK_MILESTONE' && (
                                        <span className="block text-xs text-[var(--color-text-muted)]">
                                            {t('streakMilestoneNote')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 入出金額 */}
                            <span className={`text-right font-bold tabular-nums ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                                {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
                            </span>

                            {/* 残高 */}
                            <span className="text-right font-bold text-gray-900 tabular-nums">
                                {tx.balance.toLocaleString()}
                            </span>
                        </div>
                    );
                })}
            </div>
            {remainingCount > 0 && (
                <button
                    type="button"
                    onClick={() => setVisibleCount((current) => current + TRANSACTION_PAGE_SIZE)}
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                >
                    {t('loadMoreTransactions', {
                        count: Math.min(TRANSACTION_PAGE_SIZE, remainingCount),
                    })}
                </button>
            )}
        </div>
    );
}
