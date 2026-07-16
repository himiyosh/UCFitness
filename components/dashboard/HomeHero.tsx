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
  ucBalance?: number | null;
  currentStreak?: number;
  rewardDataError?: boolean;
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
  ucBalance = null,
  currentStreak = 0,
  rewardDataError = false,
  nextActionTargetId,
  className = '',
  compact = false,
  showMetricTiles = true,
  showNextAction = !compact,
}: HomeHeroProps): ReactNode {
  const t = useTranslations('Dashboard');
  const normalizedStepGoal = Math.max(1, stepGoal);

  const remainingSteps = Math.max(0, normalizedStepGoal - todaySteps);
  const isGoalComplete = todaySteps >= normalizedStepGoal;
  const progressPercent = isGoalComplete
    ? 100
    : Math.min(99, Math.round((todaySteps / normalizedStepGoal) * 100));
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
  const nextAction = getNextActionMetrics(remainingSteps, normalizedStepGoal, todaySteps);
  const nextActionTitle = nextAction.isGoalComplete
    ? t('goalComplete')
    : nextAction.isGentleRestart
      ? t('starterSteps', { amount: nextAction.suggestedSteps.toLocaleString() })
      : t('stepsRemaining', { amount: remainingSteps.toLocaleString() });
  const nextActionDetail = nextAction.isGoalComplete
    ? t('goalBonusReady')
    : t('walkMinutes', { minutes: nextAction.walkingMinutes.toLocaleString() });
  const rewardValue = rewardDataError
    ? t('rewardDataUnavailable')
    : hasTodaySteps
      ? todaySteps > 0
        ? t('questRewardValue', { amount: todaySteps.toLocaleString() })
        : t('questRewardStart')
      : t('questRewardPending');
  const rewardDetail = rewardDataError || ucBalance === null
    ? t('questBalanceUnavailable')
    : t('questBalance', { amount: ucBalance.toLocaleString() });
  const questState = isGoalComplete ? 'complete' : progressPercent >= 80 ? 'near' : 'active';
  const nextStoryContent = (
    <>
      <span className="home-quest-node bg-[var(--color-primary-solid)] text-white" aria-hidden="true">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
          <circle cx="7" cy="16" r="2.5" />
          <circle cx="16.5" cy="7.5" r="2.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 14 5.5-4.5" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-[var(--color-primary-strong)]">{t('questNext')}</span>
        <span className="mt-1 block text-sm font-black text-[var(--color-text)]">{nextActionTitle}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-muted)]">{nextActionDetail}</span>
      </span>
      {nextActionTargetId && <span className="home-quest-chevron text-[var(--color-primary-strong)]" aria-hidden="true">→</span>}
    </>
  );

  return (
    <section
      className={`home-quest-stage relative flex-shrink-0 overflow-hidden rounded-2xl border border-[var(--color-primary)]/25 bg-[var(--color-surface)] p-3 text-[var(--color-text)] shadow-sm sm:p-4 ${className}`}
      aria-labelledby="home-quest-title"
      data-state={questState}
    >
      <div className="relative mx-auto w-full">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <UserAvatar src={userImage} name={userName || username} size="sm" />
            <div className="min-w-0">
              <h2 id="home-quest-title" className="truncate text-xs font-bold text-[var(--color-primary-strong)]">
                {t('todayQuest')}
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-[var(--color-text)]">{userName || username}</p>
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
          <span className="shrink-0 rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-strong)]" aria-hidden="true">
            {progressPercent === 0 ? t('questStartBadge') : `${progressPercent}%`}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_96px] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_116px]" data-story-step="progress">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--color-primary-strong)]">{t('questProgress')}</p>
            <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-0.5" aria-hidden="true">
              <span className="text-4xl font-black tracking-[-0.06em] text-[var(--color-primary-strong)] tabular-nums sm:text-5xl">
                {todaySteps.toLocaleString()}
              </span>
              <span className="pb-1.5 text-sm font-semibold text-[var(--color-text-muted)]">
                / {normalizedStepGoal.toLocaleString()}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]" aria-hidden="true">
              <span
                className={`home-quest-progress-fill block h-full rounded-full ${progressPercent >= 100 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary-solid)]'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)] sm:text-sm">{momentumMessage}</p>
          </div>

          <div
            className="home-quest-ring relative flex h-24 w-24 items-center justify-center justify-self-end rounded-full sm:h-28 sm:w-28"
            role="progressbar"
            aria-label={t('questProgress')}
            aria-valuetext={todayProgressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            style={{ background: `conic-gradient(${progressPercent >= 100 ? 'var(--color-success)' : 'var(--color-primary-solid)'} ${progressPercent}%, var(--color-surface-muted) 0)` }}
          >
            <div className="flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center rounded-full bg-[var(--color-surface)] shadow-inner sm:h-[5.25rem] sm:w-[5.25rem]" aria-hidden="true">
              {progressPercent >= 100 && (
                <svg className="home-quest-check h-5 w-5 text-[var(--color-success-strong)]" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
              )}
              <span className="text-xl font-black tabular-nums text-[var(--color-primary-strong)]">
                {progressPercent === 0 ? t('questStartShort') : `${progressPercent}%`}
              </span>
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">{t('questProgress')}</span>
            </div>
          </div>
        </div>

        <ol className="home-quest-rail relative mt-4 grid border-t border-[var(--color-border)] md:grid-cols-3" aria-label={t('questRouteLabel')}>
          <li className="border-b border-[var(--color-border)] md:border-b-0 md:border-r">
            <Link
              href="/leaderboard?period=WEEKLY"
              className="home-quest-step group flex min-h-[92px] items-center gap-3 px-1 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-competition)] md:px-3"
              data-tone="competition"
              data-story-step="competition"
            >
              <span className="home-quest-node home-quest-rank-node bg-[var(--color-competition-solid)] text-white" aria-hidden="true">#</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-[var(--color-competition-strong)]">{t('questCompetition')}</span>
                <span className="mt-1 block text-lg font-black tabular-nums text-[var(--color-competition-strong)]">
                  {globalRank === null ? t('rankUnavailable') : `#${globalRank}`}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-muted)]">{rankGapMessage}</span>
              </span>
              <span className="home-quest-chevron text-[var(--color-competition-strong)]" aria-hidden="true">→</span>
            </Link>
          </li>
          <li className="border-b border-[var(--color-border)] md:border-b-0 md:border-r">
            <Link
              href="/wallet"
              className="home-quest-step group flex min-h-[92px] items-center gap-3 px-1 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-reward)] md:px-3"
              data-tone="reward"
              data-story-step="reward"
            >
              <span className="home-quest-node home-quest-reward-node bg-[var(--color-reward-solid)] text-white" aria-hidden="true">UC</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-[var(--color-reward-strong)]">{t('questReward')}</span>
                <span className="mt-1 block truncate text-base font-black tabular-nums text-[var(--color-reward-strong)]">{rewardValue}</span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-muted)]">
                  {rewardDetail}
                  {!rewardDataError && currentStreak > 0 ? ` · ${t('ucStreak', { days: currentStreak })}` : ''}
                </span>
              </span>
              <span className="home-quest-chevron text-[var(--color-reward-strong)]" aria-hidden="true">→</span>
            </Link>
          </li>
          <li>
            {nextActionTargetId ? (
              <a
                href={`#${nextActionTargetId}`}
                className="home-quest-step group flex min-h-[92px] items-center gap-3 px-1 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] md:px-3"
                data-tone={nextAction.isGoalComplete ? 'success' : 'primary'}
                data-story-step="next"
              >
                {nextStoryContent}
              </a>
            ) : (
              <div className="home-quest-step flex min-h-[92px] items-center gap-3 px-1 py-3 md:px-3" data-story-step="next">
                {nextStoryContent}
              </div>
            )}
          </li>
        </ol>

        {showNextAction && (
          <div className="mt-2.5">
            <NextActionCard
              remainingSteps={remainingSteps}
              stepGoal={normalizedStepGoal}
              todaySteps={todaySteps}
            />
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
  stepGoal?: number;
  todaySteps?: number;
  id?: string;
}

export function NextActionCard({
  remainingSteps,
  stepGoal,
  todaySteps,
  id,
}: NextActionCardProps): ReactNode {
  const t = useTranslations('Dashboard');
  const action = getNextActionMetrics(remainingSteps, stepGoal, todaySteps);
  const { isGoalComplete, isGentleRestart, suggestedSteps, walkingMinutes } = action;
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
          {isGoalComplete ? t('nextActionCelebrate') : isGentleRestart ? t('nextActionRestart') : t('nextActionWalk')}
        </h2>
        <p className="mt-0.5 text-sm font-bold md:text-base">
          {isGoalComplete
            ? t('goalComplete')
            : isGentleRestart
              ? t('starterSteps', { amount: suggestedSteps.toLocaleString() })
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

interface NextActionMetrics {
  isGoalComplete: boolean;
  isGentleRestart: boolean;
  suggestedSteps: number;
  walkingMinutes: number;
}

function getNextActionMetrics(
  remainingSteps: number,
  stepGoal?: number,
  todaySteps?: number,
): NextActionMetrics {
  const isGoalComplete = remainingSteps === 0;
  const isGentleRestart = stepGoal !== undefined && todaySteps !== undefined
    ? !isGoalComplete && todaySteps / Math.max(1, stepGoal) < 0.5
    : remainingSteps >= 9000;
  const suggestedSteps = isGentleRestart ? Math.min(500, remainingSteps) : remainingSteps;
  return {
    isGoalComplete,
    isGentleRestart,
    suggestedSteps,
    walkingMinutes: Math.max(5, Math.ceil(suggestedSteps / 120)),
  };
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
