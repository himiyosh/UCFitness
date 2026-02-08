'use client';

import { useTranslations } from 'next-intl';

interface Transaction {
    id: string;
    date: string;
    type: string;
    amount: number;
    description: string;
}

interface TransactionHistoryProps {
    transactions: Transaction[];
}

const TYPE_CONFIG: Record<string, { color: string; bgColor: string; icon: string; key: string }> = {
    STEPS: { color: 'text-green-700', bgColor: 'bg-green-50', icon: '🚶', key: 'steps' },
    GOAL_BONUS: { color: 'text-blue-700', bgColor: 'bg-blue-50', icon: '🎯', key: 'goalBonus' },
    STREAK_BONUS: { color: 'text-orange-700', bgColor: 'bg-orange-50', icon: '🔥', key: 'streakBonus' },
    RANK_BONUS: { color: 'text-purple-700', bgColor: 'bg-purple-50', icon: '🏆', key: 'rankBonus' },
};

export default function TransactionHistory({ transactions }: TransactionHistoryProps) {
    const t = useTranslations('Bank');

    if (!transactions || transactions.length === 0) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    📒 {t('transactionHistory')}
                </h3>
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                    {t('noTransactions')}
                </div>
            </div>
        );
    }

    // 日付でグループ化
    const grouped = new Map<string, Transaction[]>();
    for (const tx of transactions) {
        const list = grouped.get(tx.date) || [];
        list.push(tx);
        grouped.set(tx.date, list);
    }

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr + 'T00:00:00');
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    };

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                📒 {t('transactionHistory')}
            </h3>

            <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {Array.from(grouped.entries()).map(([date, txs]) => {
                    const dayTotal = txs.reduce((sum, tx) => sum + tx.amount, 0);
                    return (
                        <div key={date}>
                            {/* 日付ヘッダー */}
                            <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                <span className="text-xs font-semibold text-gray-500">{formatDate(date)}</span>
                                <span className="text-xs font-bold text-green-600">+{dayTotal.toLocaleString()} UC</span>
                            </div>

                            {/* トランザクション行 */}
                            {txs.map((tx) => {
                                const config = TYPE_CONFIG[tx.type] || TYPE_CONFIG.STEPS;
                                return (
                                    <div key={tx.id} className="flex items-center justify-between py-2 pl-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm ${config.bgColor} w-7 h-7 flex items-center justify-center rounded-lg`}>
                                                {config.icon}
                                            </span>
                                            <div>
                                                <p className={`text-xs font-semibold ${config.color}`}>
                                                    {t(config.key)}
                                                </p>
                                                <p className="text-[10px] text-gray-400">
                                                    {tx.description}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-bold text-gray-800 tabular-nums">
                                            +{tx.amount.toLocaleString()}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
