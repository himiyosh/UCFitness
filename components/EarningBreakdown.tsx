'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

interface Transaction {
  type: string;
  amount: number;
  date: string;
}

interface EarningBreakdownProps {
  transactions: Transaction[];
}

interface CategoryData {
  type: string;
  emoji: string;
  labelKey: string;
  amount: number;
  color: string;
}

const TYPE_CONFIG: Record<string, { emoji: string; labelKey: string; color: string }> = {
  STEPS: { emoji: '👟', labelKey: 'stepsCoins', color: 'bg-blue-500' },
  GOAL_BONUS: { emoji: '🎯', labelKey: 'goalBonus', color: 'bg-green-500' },
  STREAK_BONUS: { emoji: '🔥', labelKey: 'streakBonus', color: 'bg-orange-500' },
  STREAK_MILESTONE: { emoji: '🏅', labelKey: 'streakMilestone', color: 'bg-[var(--color-reward-strong)]' },
  LOGIN_BONUS: { emoji: '📅', labelKey: 'loginBonus', color: 'bg-purple-500' },
  RANK_BONUS: { emoji: '🏆', labelKey: 'rankBonus', color: 'bg-amber-500' },
  MISSION_REWARD: { emoji: '✅', labelKey: 'missionReward', color: 'bg-teal-500' },
  GIFT_RECEIVE: { emoji: '🎁', labelKey: 'giftReceived', color: 'bg-pink-500' },
  PURCHASE: { emoji: '🛒', labelKey: 'purchases', color: 'bg-red-500' },
  GIFT_SEND: { emoji: '💸', labelKey: 'giftSent', color: 'bg-red-400' },
};

export default function EarningBreakdown({ transactions }: EarningBreakdownProps) {
  const t = useTranslations('Earnings');

  // タイプ別集計
  const { categories, totalEarned, totalSpent, netEarnings } = useMemo(() => {
    const typeMap = new Map<string, number>();
    let earned = 0;
    let spent = 0;

    for (const tx of transactions) {
      const current = typeMap.get(tx.type) || 0;
      typeMap.set(tx.type, current + tx.amount);
      if (tx.amount >= 0) earned += tx.amount;
      else spent += Math.abs(tx.amount);
    }

    const cats: CategoryData[] = [];
    for (const [type, amount] of typeMap.entries()) {
      const config = TYPE_CONFIG[type];
      if (!config) continue;
      cats.push({ type, amount, ...config });
    }

    // 獲得額の大きい順（支出は末尾に）
    cats.sort((a, b) => {
      if (a.amount >= 0 && b.amount < 0) return -1;
      if (a.amount < 0 && b.amount >= 0) return 1;
      return Math.abs(b.amount) - Math.abs(a.amount);
    });

    return { categories: cats, totalEarned: earned, totalSpent: spent, netEarnings: earned - spent };
  }, [transactions]);

  const maxAmount = useMemo(
    () => Math.max(...categories.filter(c => c.amount > 0).map(c => c.amount), 1),
    [categories]
  );

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/40 shadow-lg p-4 sm:p-5">
      {/* ヘッダー */}
      <h3 className="text-lg font-bold flex items-center gap-2 mb-1">
        <span>📊</span>
        <span className="text-[var(--color-reward-strong)]">
          {t('title')}
        </span>
      </h3>
      <p className="mb-3 text-xs leading-5 text-[var(--color-text-muted)]">{t('description')}</p>

      {/* サマリー行 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-green-50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-green-600 font-semibold">{t('earned')}</div>
          <div className="text-sm font-bold text-green-700 tabular-nums">+{totalEarned.toLocaleString()}</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-red-600 font-semibold">{t('spent')}</div>
          <div className="text-sm font-bold text-red-700 tabular-nums">-{totalSpent.toLocaleString()}</div>
        </div>
        <div className="bg-[var(--theme-primary)]/5 rounded-lg p-2.5 text-center">
          <div className="text-xs text-[var(--theme-primary)] font-semibold">{t('net')}</div>
          <div className="text-sm font-bold text-[var(--theme-primary)] tabular-nums">
            {netEarnings >= 0 ? '+' : ''}{netEarnings.toLocaleString()}
          </div>
        </div>
      </div>

      {/* カテゴリ別バー */}
      <div className="space-y-2">
        {categories.map(cat => {
          const absAmount = Math.abs(cat.amount);
          const barWidth = cat.amount > 0 ? (cat.amount / maxAmount) * 100 : 0;
          const isNegative = cat.amount < 0;
          return (
            <div key={cat.type} className="flex items-center gap-2">
              <span className="text-base flex-shrink-0 w-6 text-center">{cat.emoji}</span>
              <span className="w-24 flex-shrink-0 text-xs leading-4 text-gray-600">{t(cat.labelKey)}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                {!isNegative && (
                  <div
                    className={`h-full rounded-full ${cat.color} transition-all duration-500`}
                    style={{ width: `${barWidth}%` }}
                  />
                )}
              </div>
              <span className={`text-xs font-bold tabular-nums flex-shrink-0 w-16 text-right ${
                isNegative ? 'text-red-500' : 'text-gray-700'
              }`}>
                {isNegative ? '-' : '+'}{absAmount.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
