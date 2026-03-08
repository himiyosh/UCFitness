'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';

interface HomeHeroProps {
  todaySteps: number;
  yesterdaySteps: number;
  weeklySteps: number;
  monthlySteps: number;
  stepGoal: number;
  userName: string | null;
  userImage: string | null;
  username: string;
  globalRank: number | null;
  className?: string; // 外からスタイルを指定可能にする
}

export default function HomeHero({
  todaySteps,
  yesterdaySteps,
  weeklySteps,
  monthlySteps,
  stepGoal,
  userName,
  userImage,
  username,
  globalRank,
  className = '',
}: HomeHeroProps) {
  const t = useTranslations('Dashboard');
  const pt = useTranslations('Portal');

  // 歩数の達成率 (0〜100)
  const progressPercent = useMemo(
    () => Math.min(100, Math.round((todaySteps / stepGoal) * 100)),
    [todaySteps, stepGoal]
  );

  // 昨日比の差分
  const vsDiff = todaySteps - yesterdaySteps;
  const vsSign = vsDiff >= 0 ? '+' : '';

  // SVG リングのパラメータ
  const ringRadius = 44;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progressPercent / 100) * ringCircumference;

  return (
    <section
      className={`relative flex-shrink-0 bg-gradient-to-br from-[var(--theme-gradient-from)] via-[var(--theme-secondary)] to-[var(--theme-gradient-to)] text-white px-4 pt-5 pb-6 sm:px-6 sm:pt-6 sm:pb-8 overflow-hidden rounded-none sm:rounded-2xl ${className}`}
      aria-label={pt('heroLabel')}
    >
      {/* 装飾 — Apple-style mesh gradient feel */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-56 h-56 bg-white/8 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-40 h-40 bg-white/8 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 flex items-center gap-4 sm:gap-6 max-w-lg mx-auto w-full h-full">
        {/* 歩数リング — Apple Watch風 */}
        <div className="relative flex-shrink-0">
          <svg className="w-[104px] h-[104px] sm:w-[120px] sm:h-[120px] -rotate-90 drop-shadow-lg" viewBox="0 0 100 100" aria-hidden="true">
            {/* 背景リング */}
            <circle cx="50" cy="50" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="7" />
            {/* 進捗リング — Round cap + subtle glow */}
            <circle
              cx="50" cy="50" r={ringRadius}
              fill="none" stroke="#fff" strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              className="transition-all duration-1000 ring-glow"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl sm:text-2xl font-black leading-none tracking-tight">{todaySteps.toLocaleString()}</span>
            <span className="text-[10px] sm:text-xs opacity-70 mt-0.5 font-medium">/ {stepGoal.toLocaleString()}</span>
          </div>
        </div>

        {/* 統計情報 */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* ユーザー挨拶 */}
          <div className="flex items-center gap-2">
            <UserAvatar src={userImage} name={userName || username} size="sm" />
            <p className="text-sm sm:text-base font-bold truncate tracking-tight">
              {userName || username}
            </p>
          </div>

          {/* 歩数達成率 — M3 chip 風 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1">
              {progressPercent}% {progressPercent >= 100 ? '🎉' : progressPercent >= 50 ? '🔥' : '👟'}
            </span>
            <span className={`text-xs font-medium ${vsDiff >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {vsSign}{vsDiff.toLocaleString()} {pt('stepsUnit')} {t('vsYesterday')}
            </span>
          </div>

          {/* 週間・月間・ランク — Apple HIG 風の統計グリッド */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="text-center bg-white/10 backdrop-blur-sm rounded-xl py-1.5 px-1">
              <div className="text-sm sm:text-base font-bold tracking-tight">{formatK(weeklySteps)}</div>
              <div className="text-[9px] sm:text-[10px] opacity-60 font-medium uppercase tracking-wider">{t('thisWeek')}</div>
            </div>
            <div className="text-center bg-white/10 backdrop-blur-sm rounded-xl py-1.5 px-1">
              <div className="text-sm sm:text-base font-bold tracking-tight">{formatK(monthlySteps)}</div>
              <div className="text-[9px] sm:text-[10px] opacity-60 font-medium uppercase tracking-wider">{t('thisMonth')}</div>
            </div>
            <div className="text-center bg-white/10 backdrop-blur-sm rounded-xl py-1.5 px-1">
              <div className="text-sm sm:text-base font-bold tracking-tight">
                {globalRank ? `#${globalRank}` : '—'}
              </div>
              <div className="text-[9px] sm:text-[10px] opacity-60 font-medium uppercase tracking-wider">{pt('rank')}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 歩数を読みやすい形式に短縮（52340 → 52.3K）
 */
function formatK(steps: number): string {
  if (steps >= 1000) {
    return `${(steps / 1000).toFixed(steps % 1000 < 100 ? 0 : 1)}K`;
  }
  return steps.toLocaleString();
}
