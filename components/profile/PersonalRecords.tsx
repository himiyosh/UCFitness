'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

interface PersonalRecordsProps {
  totalSteps: number | null;
  bestDaySteps: number | null;
  bestDayDate: string | null;
  bestStreak: number | null;
  currentStreak: number | null;
  averageSteps: number | null;
  activeDays: number | null;
  recordedDays: number | null;
  investorRank: string | null;
  totalEarned: number | null;
}

interface RecordItem {
  emoji: string;
  labelKey: string;
  value: string;
  subValue?: string;
  highlight?: boolean;
}

export default function PersonalRecords({
  totalSteps,
  bestDaySteps,
  bestDayDate,
  bestStreak,
  currentStreak,
  averageSteps,
  activeDays,
  recordedDays,
  investorRank,
  totalEarned,
}: PersonalRecordsProps) {
  const t = useTranslations('RecordBoard');

  const records = useMemo((): RecordItem[] => {
    const consistency = (
      activeDays !== null
      && recordedDays !== null
      && recordedDays > 0
    )
      ? Math.round((activeDays / recordedDays) * 100)
      : null;
    const formatNumber = (value: number | null): string => (
      value === null ? t('unavailable') : value.toLocaleString()
    );
    const formatDays = (value: number | null): string => (
      value === null ? t('unavailable') : `${value} ${t('days')}`
    );
    return [
      {
        emoji: '👟',
        labelKey: 'totalSteps',
        value: formatNumber(totalSteps),
        highlight: totalSteps !== null && totalSteps >= 1_000_000,
      },
      {
        emoji: '🏆',
        labelKey: 'bestDay',
        value: formatNumber(bestDaySteps),
        subValue: bestDayDate ?? undefined,
      },
      {
        emoji: '🔥',
        labelKey: 'bestStreak',
        value: formatDays(bestStreak),
        highlight: bestStreak !== null && bestStreak >= 30,
      },
      {
        emoji: '⚡',
        labelKey: 'currentStreak',
        value: formatDays(currentStreak),
        highlight: currentStreak !== null && currentStreak >= 7,
      },
      {
        emoji: '📊',
        labelKey: 'averageSteps',
        value: formatNumber(averageSteps),
      },
      {
        emoji: '📅',
        labelKey: 'activeDays',
        value: formatNumber(activeDays),
        subValue: consistency === null ? undefined : `${consistency}%`,
      },
      {
        emoji: '💰',
        labelKey: 'totalEarned',
        value: totalEarned === null
          ? t('unavailable')
          : `${totalEarned.toLocaleString()} UC`,
      },
      {
        emoji: investorRank === null ? '📊' : rankIcon(investorRank),
        labelKey: 'investorRank',
        value: investorRank === null
          ? t('unavailable')
          : t(investorRank as 'TYCOON' | 'DIAMOND' | 'FUND_MANAGER' | 'BUSINESS' | 'BEGINNER'),
      },
    ];
  }, [totalSteps, bestDaySteps, bestDayDate, bestStreak, currentStreak, averageSteps, activeDays, recordedDays, investorRank, totalEarned, t]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/40 shadow-lg p-4 sm:p-5">
      <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
        <span>🏅</span>
        <span className="text-[var(--color-reward-strong)]">
          {t('title')}
        </span>
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {records.map((rec) => (
          <div
            key={rec.labelKey}
            className={`rounded-lg p-3 text-center transition-colors ${
              rec.highlight
                ? 'bg-gradient-to-br from-[var(--theme-primary)]/10 to-[var(--theme-gradient-to)]/10 border border-[var(--theme-primary)]/20'
                : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <div className="text-xl mb-1">{rec.emoji}</div>
            <div className="text-xs text-gray-500 mb-0.5">{t(rec.labelKey)}</div>
            <div className={`text-sm font-bold tabular-nums ${rec.highlight ? 'text-[var(--theme-primary)]' : 'text-gray-900'}`}>
              {rec.value}
            </div>
            {rec.subValue && (
              <div className="mt-0.5 text-xs text-gray-400">{rec.subValue}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function rankIcon(rank: string): string {
  switch (rank) {
    case 'TYCOON': return '👑';
    case 'DIAMOND': return '💎';
    case 'FUND_MANAGER': return '📊';
    case 'BUSINESS': return '💼';
    default: return '🌱';
  }
}
