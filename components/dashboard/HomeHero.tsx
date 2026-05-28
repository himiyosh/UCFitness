'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/navigation';

import UserAvatar from '@/components/UserAvatar';

interface HomeHeroProps {
  todaySteps: number;
  stepGoal: number;
  userName: string | null;
  userImage: string | null;
  username: string;
  globalRank: number | null;
  hasTodaySteps?: boolean;
  nextRankGap?: number | null;
  className?: string; // 外からスタイルを指定可能にする
  compact?: boolean;
  showMetricTiles?: boolean;
}

export default function HomeHero({
  todaySteps,
  stepGoal,
  userName,
  userImage,
  username,
  globalRank,
  hasTodaySteps = false,
  nextRankGap = null,
  className = '',
  compact = false,
  showMetricTiles = true,
}: HomeHeroProps) {
  const t = useTranslations('Dashboard');
  const normalizedStepGoal = Math.max(1, stepGoal);

  const progressPercent = useMemo(
    () => Math.min(100, Math.round((todaySteps / normalizedStepGoal) * 100)),
    [todaySteps, normalizedStepGoal]
  );

  const remainingSteps = Math.max(0, normalizedStepGoal - todaySteps);
  const todayProgressLabel = t('todayProgressLabel', {
    steps: todaySteps.toLocaleString(),
    goal: normalizedStepGoal.toLocaleString(),
    percent: progressPercent,
  });
  const momentumMessage = progressPercent >= 100
    ? t('momentumDone')
    : progressPercent >= 80
      ? t('momentumNear')
      : progressPercent >= 50
        ? t('momentumHalf')
        : t('momentumStart');
  const syncMessage = hasTodaySteps ? t('fitbitSyncedToday') : t('fitbitSyncPending');
  const rankGapMessage = globalRank === 1
    ? t('rankTop')
    : nextRankGap !== null
      ? t('rankGap', { amount: nextRankGap.toLocaleString() })
      : t('rankGapPending');
  const walkingMinutes = Math.max(5, Math.ceil(remainingSteps / 120));
  const actionMinutesLabel = remainingSteps > 0
    ? t('walkMinutes', { minutes: walkingMinutes.toLocaleString() })
    : t('goalBonusReady');

  return (
    <section
      className={`relative flex-shrink-0 overflow-hidden rounded-none bg-[var(--color-inverse-surface)] px-3 pb-3 pt-2.5 text-[var(--color-inverse-text)] shadow-xl sm:rounded-xl sm:px-4 sm:py-4 ${className}`}
      aria-label={t('todayCommandCenter')}
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[var(--theme-primary)]/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 left-0 h-56 w-56 rounded-full bg-[var(--theme-gradient-to)]/25 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <UserAvatar src={userImage} name={userName || username} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {userName || username}
              </p>
              <p className="text-xs font-medium text-white/60">{t('todayLabel')}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            {progressPercent}%
          </span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_84px] sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">
              {t('stepsToday')}
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-3xl font-bold tracking-[-0.06em] text-white tabular-nums sm:text-4xl">
                {todaySteps.toLocaleString()}
              </span>
              <span className="pb-1.5 text-xs font-semibold text-white/60">
                / {normalizedStepGoal.toLocaleString()}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-white/70 sm:text-sm">{momentumMessage}</p>
          </div>

          <div className="hidden justify-self-end sm:flex">
            <div
              className="relative flex h-20 w-20 items-center justify-center rounded-full"
              role="progressbar"
              aria-label={todayProgressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              style={{ background: `conic-gradient(var(--theme-primary) ${progressPercent}%, rgba(255,255,255,0.14) 0)` }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-inverse-surface)]">
                <span className="text-base font-bold tabular-nums text-white">{progressPercent}%</span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-4 sm:hidden"
          role="progressbar"
          aria-label={todayProgressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div className="h-2 rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {!compact && (
        <div className="mt-2.5 rounded-xl bg-white p-2.5 text-[var(--color-text)] shadow-lg">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                {remainingSteps > 0 ? t('nextActionWalk') : t('nextActionCelebrate')}
              </p>
              <p className="mt-0.5 text-sm font-bold sm:text-base">
                {remainingSteps > 0
                  ? t('stepsRemaining', { amount: remainingSteps.toLocaleString() })
                  : t('goalComplete')}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-muted)] sm:text-sm">{actionMinutesLabel}</p>
            </div>
            <Link
              href="/challenges"
               className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-inverse-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-inverse-text)] transition-colors hover:bg-[var(--color-primary-solid)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
            >
              {t('openChallenges')}
            </Link>
          </div>
        </div>
        )}

        {showMetricTiles && (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <MetricTile label={t('syncStatus')} value={syncMessage} />
          <MetricTile label={t('rankInsight')} value={rankGapMessage} />
        </div>
        )}
      </div>
    </section>
  );
}

function MetricTile({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-2.5 py-2 backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
        {label}
      </p>
      <p className={`mt-1 font-semibold tracking-tight text-white tabular-nums ${compact ? 'text-base' : 'text-sm sm:text-base'}`}>
        {value}
      </p>
    </div>
  );
}
