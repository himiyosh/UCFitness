'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

interface PersonalRecordsProps {
  totalSteps: number;
  bestDaySteps: number;
  bestDayDate: string;
  bestStreak: number;
  currentStreak: number;
  activeDays: number;
  totalDays: number;
  investorRank: string;
  totalEarned: number;
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
  activeDays,
  totalDays,
  investorRank,
  totalEarned,
}: PersonalRecordsProps) {
  const t = useTranslations('RecordBoard');

  const records = useMemo((): RecordItem[] => {
    const avg = activeDays > 0 ? Math.round(totalSteps / activeDays) : 0;
    const consistency = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;
    return [
      {
        emoji: '👟',
        labelKey: 'totalSteps',
        value: totalSteps.toLocaleString(),
        highlight: totalSteps >= 1_000_000,
      },
      {
        emoji: '🏆',
        labelKey: 'bestDay',
        value: bestDaySteps.toLocaleString(),
        subValue: bestDayDate !== '-' ? bestDayDate : undefined,
      },
      {
        emoji: '🔥',
        labelKey: 'bestStreak',
        value: `${bestStreak} ${t('days')}`,
        highlight: bestStreak >= 30,
      },
      {
        emoji: '⚡',
        labelKey: 'currentStreak',
        value: `${currentStreak} ${t('days')}`,
        highlight: currentStreak >= 7,
      },
      {
        emoji: '📊',
        labelKey: 'averageSteps',
        value: avg.toLocaleString(),
      },
      {
        emoji: '📅',
        labelKey: 'activeDays',
        value: `${activeDays}`,
        subValue: `${consistency}%`,
      },
      {
        emoji: '💰',
        labelKey: 'totalEarned',
        value: `${totalEarned.toLocaleString()} UC`,
      },
      {
        emoji: rankIcon(investorRank),
        labelKey: 'investorRank',
        value: t(investorRank as 'TYCOON' | 'DIAMOND' | 'FUND_MANAGER' | 'BUSINESS' | 'BEGINNER'),
      },
    ];
  }, [totalSteps, bestDaySteps, bestDayDate, bestStreak, currentStreak, activeDays, totalDays, investorRank, totalEarned, t]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/40 shadow-lg p-4 sm:p-5">
      <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
        <span>🏅</span>
        <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
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
              <div className="text-[10px] text-gray-400 mt-0.5">{rec.subValue}</div>
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
