'use client';

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
    RANK_BONUS: { color: 'text-purple-700', icon: '🏆', key: 'rankBonus' },
    PURCHASE: { color: 'text-red-600', icon: '🛍️', key: 'purchase' },
};

export default function TransactionHistory({ transactions }: TransactionHistoryProps) {
    const t = useTranslations('Bank');
    const locale = useLocale();

    // descriptionからロケールに応じたアイテム名を取得
    // 新形式: "Shop: English Name / 日本語名"
    // 旧形式: "Shop: English Name"
    const getPurchaseItemName = (description: string) => {
        const content = description.replace(/^Shop:\s*/, '');
        const parts = content.split(' / ');
        if (parts.length === 2) {
            return locale === 'ja' ? parts[1] : parts[0];
        }
        return content; // 旧形式フォールバック
    };

    if (!transactions || transactions.length === 0) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-full">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    📒 {t('transactionHistory')}
                </h3>
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                    {t('noTransactions')}
                </div>
            </div>
        );
    }

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr + 'T00:00:00');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${month}/${day}`;
    };

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-full">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                📒 {t('transactionHistory')}
            </h3>

            {/* テーブルヘッダー */}
            <div className="grid grid-cols-[44px_1fr_72px_72px] sm:grid-cols-[56px_1fr_100px_110px] gap-1 sm:gap-2 px-2 pb-2 border-b border-gray-200 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                <span>{t('date')}</span>
                <span>{t('detail')}</span>
                <span className="text-right">{t('deposit')}</span>
                <span className="text-right">{t('balance')}</span>
            </div>

            {/* トランザクション行 */}
            <div className="max-h-[400px] overflow-y-auto">
                {transactions.filter(tx => tx.amount !== 0).map((tx, i, filtered) => {
                    const config = TYPE_CONFIG[tx.type] || TYPE_CONFIG.STEPS;
                    const isPositive = tx.amount >= 0;
                    // 日付が前の行と同じなら非表示
                    const showDate = i === 0 || filtered[i - 1].date !== tx.date;

                    return (
                        <div
                            key={tx.id}
                            className={`grid grid-cols-[44px_1fr_72px_72px] sm:grid-cols-[56px_1fr_100px_110px] gap-1 sm:gap-2 items-center px-2 py-1.5 text-xs
                                ${showDate ? 'border-t border-gray-100' : ''}
                                hover:bg-gray-50 transition-colors`}
                        >
                            {/* 日付 */}
                            <span className="text-gray-400 tabular-nums">
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
                                        <span className="text-[10px] text-gray-400 truncate block">
                                            {getPurchaseItemName(tx.description)}
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
        </div>
    );
}
