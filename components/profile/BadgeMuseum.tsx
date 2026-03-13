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

type FilterCategory = 'ALL' | 'PERSONAL' | 'GROUP';

/** バッジ種別ごとのグループ */
interface BadgeGroup {
  badgeCode: string;
  name: string;
  description?: string;
  category: string;
  type: string;
  rank: number;
  count: number;
  dates: string[];
}

export default function BadgeMuseum({ badges }: BadgeMuseumProps) {
  const t = useTranslations('Museum');
  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [expandedBadge, setExpandedBadge] = useState<string | null>(null);

  // カテゴリ別カウント（GLOBAL + ACHIEVEMENT = PERSONAL）
  const counts = useMemo(() => ({
    ALL: badges.length,
    PERSONAL: badges.filter(b => b.badges.type === 'GLOBAL' || b.badges.type === 'ACHIEVEMENT').length,
    GROUP: badges.filter(b => b.badges.type === 'GROUP').length,
  }), [badges]);

  // バッジ種別ごとにグループ化し、取得回数と日付をまとめる
  const groupedBadges = useMemo(() => {
    const filtered = filter === 'ALL'
      ? badges
      : filter === 'PERSONAL'
        ? badges.filter(b => b.badges.type === 'GLOBAL' || b.badges.type === 'ACHIEVEMENT')
        : badges.filter(b => b.badges.type === 'GROUP');

    // badge_code ごとにグループ化
    const map = new Map<string, BadgeGroup>();
    for (const badge of filtered) {
      const key = badge.badge_code;
      const existing = map.get(key);
      const date = badge.awarded_at || badge.period_date;
      if (existing) {
        existing.count++;
        existing.dates.push(date);
      } else {
        map.set(key, {
          badgeCode: badge.badge_code,
          name: badge.badges.name,
          description: badge.badges.description,
          category: badge.badges.category,
          type: badge.badges.type,
          rank: badge.badges.rank,
          count: 1,
          dates: [date],
        });
      }
    }

    // 日付を新しい順にソート
    for (const group of map.values()) {
      group.dates.sort((a, b) => b.localeCompare(a));
    }

    // 種類(type) → カテゴリ(category) → ランク(rank)順でソート
    const TYPE_ORDER: Record<string, number> = { GLOBAL: 0, GROUP: 1, ACHIEVEMENT: 2 };
    const CAT_ORDER: Record<string, number> = {
      DAILY: 0, WEEKLY: 1, MONTHLY: 2,
      STREAK: 3, MILESTONE: 4, LIFESTYLE: 5, TITLE: 6,
    };
    return Array.from(map.values()).sort((a, b) => {
      const typeA = TYPE_ORDER[a.type] ?? 9;
      const typeB = TYPE_ORDER[b.type] ?? 9;
      if (typeA !== typeB) return typeA - typeB;
      const catA = CAT_ORDER[a.category] ?? 9;
      const catB = CAT_ORDER[b.category] ?? 9;
      if (catA !== catB) return catA - catB;
      return a.rank - b.rank;
    });
  }, [badges, filter]);

  const filters: { key: FilterCategory; emoji: string; labelKey: string }[] = [
    { key: 'ALL', emoji: '🏛️', labelKey: 'all' },
    { key: 'PERSONAL', emoji: '🏅', labelKey: 'personal' },
    { key: 'GROUP', emoji: '👥', labelKey: 'group' },
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

      {/* フィルタータブ（個人 / グループの2種） */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setExpandedBadge(null); }}
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

      {/* バッジ種別グリッド — 種類別にセクション表示 */}
      <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1 scroll-thin">
        {groupedBadges.map((group, index) => {
          const isExpanded = expandedBadge === group.badgeCode;
          // セクション見出し: 前のバッジと type が変わったら表示
          const prevType = index > 0 ? groupedBadges[index - 1].type : null;
          const showSection = group.type !== prevType;
          const sectionKey = group.type === 'GLOBAL' ? 'sectionGlobal'
            : group.type === 'GROUP' ? 'sectionGroup'
            : 'sectionPersonal';
          const sectionEmoji = group.type === 'GLOBAL' ? '🌍'
            : group.type === 'GROUP' ? '👥'
            : '🏅';

          // バッジ名・説明を翻訳キーで表示（badge_code をキーとして使用）
          const nameKey = `badgeNames.${group.badgeCode}`;
          const descKey = `badgeDescs.${group.badgeCode}`;
          const badgeName = t.has(nameKey) ? t(nameKey) : group.name;
          const badgeDesc = t.has(descKey) ? t(descKey) : group.description;

          return (
            <div key={group.badgeCode}>
              {showSection && (
                <div className="flex items-center gap-2 pt-3 pb-1.5 first:pt-0">
                  <span className="text-sm">{sectionEmoji}</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    {t(sectionKey)}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}
              <button
                onClick={() => setExpandedBadge(isExpanded ? null : group.badgeCode)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                  isExpanded
                    ? 'bg-[var(--theme-primary)]/5 ring-1 ring-[var(--theme-primary)]/20'
                    : 'bg-gray-50 hover:bg-[var(--theme-primary)]/5'
                }`}
              >
                <BadgeIcon
                  category={group.category}
                  type={group.type}
                  rank={group.rank}
                  className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-sm flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{badgeName}</p>
                  {badgeDesc && (
                    <p className="text-xs text-gray-400 truncate">{badgeDesc}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-xs font-bold tabular-nums">
                    ×{group.count}
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* 取得日の詳細（展開時） */}
              {isExpanded && (
                <div className="ml-14 mt-1 mb-2 space-y-0.5 animate-in slide-in-from-top-2 duration-200">
                  {group.dates.map((date, i) => (
                    <div key={`${date}-${i}`} className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)]/40" />
                      <span className="tabular-nums">{date.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
