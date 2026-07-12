'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/navigation';

import UserAvatar from '@/components/UserAvatar';

import type { ReactNode } from 'react';

interface HomeHeroProps {
  todaySteps: number;
  stepGoal: number;
  userName: string | null;
  userImage: string | null;
  username: string;
  globalRank: number | null;
  hasTodaySteps?: boolean;
  nextRankGap?: number | null;
  nextActionTargetId?: string;
  className?: string; // 外からスタイルを指定可能にする
  compact?: boolean;
  showMetricTiles?: boolean;
  showNextAction?: boolean;
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
  nextActionTargetId,
  className = '',
  compact = false,
  showMetricTiles = true,
  showNextAction = !compact,
}: HomeHeroProps): ReactNode {
  const t = useTranslations('Dashboard');
  const normalizedStepGoal = Math.max(1, stepGoal);

  const progressPercent = Math.min(100, Math.round((todaySteps / normalizedStepGoal) * 100));

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

  return (
    <section
      className={`relative flex-shrink-0 overflow-hidden rounded-none border-y border-[var(--color-border)] border-l-4 border-l-[var(--color-primary)] bg-[var(--color-surface)] px-3 pb-3 pt-2.5 text-[var(--color-text)] shadow-sm md:rounded-xl md:border md:border-l-4 md:px-4 md:py-4 ${className}`}
      aria-label={t('todayCommandCenter')}
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[var(--color-primary-soft)] blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 left-0 h-56 w-56 rounded-full bg-[var(--color-competition-soft)] blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <UserAvatar src={userImage} name={userName || username} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                {userName || username}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <p className="text-xs font-medium text-[var(--color-text-muted)]">{t('todayLabel')}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  hasTodaySteps
                    ? 'bg-[var(--color-success-soft)] text-[var(--color-success-strong)]'
                    : 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'
                }`}>
                  {syncMessage}
                </span>
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-strong)]">
            {progressPercent}%
          </span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_84px] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-primary-strong)]">
              {t('stepsToday')}
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-3xl font-bold tracking-[-0.06em] text-[var(--color-primary-strong)] tabular-nums md:text-4xl">
                {todaySteps.toLocaleString()}
              </span>
              <span className="pb-1.5 text-xs font-semibold text-[var(--color-text-muted)]">
                / {normalizedStepGoal.toLocaleString()}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-muted)] md:text-sm">{momentumMessage}</p>
          </div>

          <div className="hidden justify-self-end md:flex">
            <div
              className="relative flex h-20 w-20 items-center justify-center rounded-full"
              role="progressbar"
              aria-label={todayProgressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              style={{ background: `conic-gradient(var(--color-primary-solid) ${progressPercent}%, var(--color-surface-muted) 0)` }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface)]">
                <span className="text-base font-bold tabular-nums text-[var(--color-primary-strong)]">{progressPercent}%</span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-4 md:hidden"
          role="progressbar"
          aria-label={todayProgressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div className="h-2 rounded-full bg-[var(--color-surface-muted)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary-solid)] transition-[width] duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <Link
          href="/leaderboard"
          className="mt-3 flex min-h-[56px] items-center gap-2.5 rounded-xl border border-[var(--color-competition)]/40 bg-[var(--color-competition-soft)] px-3 py-2.5 text-left transition-colors hover:border-[var(--color-competition)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)] focus-visible:ring-offset-2"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-competition-solid)] text-sm font-black text-white" aria-hidden="true">
            #
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-competition-strong)]">
              {t('globalRankLabel')}
            </span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-bold tabular-nums text-[var(--color-competition-strong)]">
               {globalRank === null ? t('rankUnavailable') : `#${globalRank}`}
              </span>
              <span className="text-xs font-medium text-[var(--color-text-muted)]">{rankGapMessage}</span>
            </span>
          </span>
          <svg className="h-4 w-4 shrink-0 text-[var(--color-competition-strong)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
          </svg>
        </Link>

        {nextActionTargetId && !showNextAction && (
          <a
            href={`#${nextActionTargetId}`}
            className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--color-primary)]/25 bg-[var(--color-primary-soft)] px-3 text-xs font-bold text-[var(--color-primary-strong)] transition-colors hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 md:hidden"
          >
            {t('viewNextAction')}
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </a>
        )}

        {showNextAction && (
          <div className="mt-2.5">
            <NextActionCard remainingSteps={remainingSteps} />
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

interface NextActionCardProps {
  remainingSteps: number;
  id?: string;
}

export function NextActionCard({ remainingSteps, id }: NextActionCardProps): ReactNode {
  const t = useTranslations('Dashboard');
  const walkingMinutes = Math.max(5, Math.ceil(remainingSteps / 120));
  const isGoalComplete = remainingSteps === 0;
  const headingId = id ? `${id}-heading` : undefined;
  const cardTone = isGoalComplete
    ? 'border-[var(--color-success)]/30 bg-[var(--color-success-soft)]'
    : 'border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]';
  const headingTone = isGoalComplete
    ? 'text-[var(--color-success-strong)]'
    : 'text-[var(--color-primary-strong)]';

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      tabIndex={id ? -1 : undefined}
      className={`scroll-mt-16 rounded-xl border p-3 text-[var(--color-text)] shadow-sm ${cardTone}`}
    >
      <div className="min-w-0">
        <h2 id={headingId} className={`text-xs font-bold uppercase tracking-[0.16em] ${headingTone}`}>
          {isGoalComplete ? t('nextActionCelebrate') : t('nextActionWalk')}
        </h2>
        <p className="mt-0.5 text-sm font-bold md:text-base">
          {isGoalComplete
            ? t('goalComplete')
            : t('stepsRemaining', { amount: remainingSteps.toLocaleString() })}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-muted)] md:text-sm">
          {isGoalComplete
            ? t('goalBonusReady')
            : t('walkMinutes', { minutes: walkingMinutes.toLocaleString() })}
        </p>
      </div>
    </section>
  );
}

function MetricTile({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className={`mt-1 font-semibold tracking-tight text-[var(--color-text)] tabular-nums ${compact ? 'text-base' : 'text-sm md:text-base'}`}>
        {value}
      </p>
    </div>
  );
}
