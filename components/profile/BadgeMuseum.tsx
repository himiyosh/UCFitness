'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import BadgeIcon from '@/components/BadgeIcon';

interface BadgeData {
  badge_code: string;
  period_date: string;
  awarded_at?: string;
  badges: {
    name: string;
    description?: string;
    category: string;
    type: string;
    rank: number;
  };
}

interface BadgeMuseumProps {
  badges: BadgeData[];
}

type FilterCategory = 'ALL' | 'GLOBAL' | 'GROUP' | 'ACHIEVEMENT';

export default function BadgeMuseum({ badges }: BadgeMuseumProps) {
  const t = useTranslations('Museum');
  const [filter, setFilter] = useState<FilterCategory>('ALL');

  // カテゴリ別にグループ化
  const grouped = useMemo(() => {
    const filtered = filter === 'ALL'
      ? badges
      : badges.filter(b => b.badges.type === filter);

    // 日付順（新しい順）
    const sorted = [...filtered].sort((a, b) => {
      const dateA = a.awarded_at || a.period_date;
      const dateB = b.awarded_at || b.period_date;
      return dateB.localeCompare(dateA);
    });

    // 月別にグループ化
    const groups = new Map<string, BadgeData[]>();
    for (const badge of sorted) {
      const date = badge.awarded_at || badge.period_date;
      const month = date.slice(0, 7); // YYYY-MM
      const list = groups.get(month) || [];
      list.push(badge);
      groups.set(month, list);
    }
    return groups;
  }, [badges, filter]);

  // カテゴリ別カウント
  const counts = useMemo(() => ({
    ALL: badges.length,
    GLOBAL: badges.filter(b => b.badges.type === 'GLOBAL').length,
    GROUP: badges.filter(b => b.badges.type === 'GROUP').length,
    ACHIEVEMENT: badges.filter(b => b.badges.type === 'ACHIEVEMENT').length,
  }), [badges]);

  const filters: { key: FilterCategory; emoji: string; labelKey: string }[] = [
    { key: 'ALL', emoji: '🏛️', labelKey: 'all' },
    { key: 'GLOBAL', emoji: '🌍', labelKey: 'global' },
    { key: 'GROUP', emoji: '👥', labelKey: 'group' },
    { key: 'ACHIEVEMENT', emoji: '⭐', labelKey: 'personal' },
  ];

  if (badges.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/40 shadow-lg p-6 text-center">
        <div className="text-4xl mb-3">🏛️</div>
        <h3 className="font-bold text-gray-900 mb-1">{t('title')}</h3>
        <p className="text-sm text-gray-500">{t('emptyState')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/40 shadow-lg p-4 sm:p-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🏛️</span>
          <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
            {t('title')}
          </span>
        </h3>
        <span className="text-sm font-semibold text-gray-500">
          {badges.length} {t('totalEarned')}
        </span>
      </div>

      {/* フィルタータブ */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              filter === f.key
                ? 'bg-[var(--theme-primary)] text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>{f.emoji}</span>
            <span>{t(f.labelKey)}</span>
            <span className="ml-0.5 opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {/* タイムライン */}
      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1 scroll-thin">
        {Array.from(grouped.entries()).map(([month, monthBadges]) => {
          const [y, m] = month.split('-');
          const monthLabel = `${y}/${m}`;
          return (
            <div key={month}>
              {/* 月ヘッダー */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[var(--theme-primary)]" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{monthLabel}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* バッジグリッド */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 pl-4">
                {monthBadges.map((badge, i) => (
                  <div
                    key={`${badge.badge_code}-${badge.period_date}-${i}`}
                    className="flex flex-col items-center p-2 rounded-lg bg-gray-50 hover:bg-[var(--theme-primary)]/5 transition-colors group"
                    title={badge.badges.description || badge.badges.name}
                  >
                    <BadgeIcon
                      category={badge.badges.category}
                      type={badge.badges.type}
                      rank={badge.badges.rank}
                      className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-sm"
                    />
                    <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight truncate w-full group-hover:text-[var(--theme-primary)]">
                      {badge.badges.name}
                    </span>
                    <span className="text-[9px] text-gray-400">
                      {(badge.awarded_at || badge.period_date).slice(5, 10)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
