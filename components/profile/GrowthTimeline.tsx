'use client';

import { useMemo, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import {
    getProfileTimelineWindow,
    groupProfileTimelineEntries,
    PROFILE_TIMELINE_PAGE_SIZE,
} from '@/lib/profile-timeline';

import type { ProfileTimelineEntry } from '@/lib/profile-timeline';

interface GrowthTimelineProps {
    entries: ProfileTimelineEntry[];
    challengeUnavailable: boolean;
    badgesUnavailable: boolean;
    malformedCount: number;
    truncatedChallengeCount: number | null;
}
export default function GrowthTimeline(props: GrowthTimelineProps) {
    const t = useTranslations('Profile');
    const museumT = useTranslations('Museum');
    const locale = useLocale();
    const [visibleCount, setVisibleCount] = useState(PROFILE_TIMELINE_PAGE_SIZE);
    const window = useMemo(() => getProfileTimelineWindow(
        props.entries, visibleCount,
    ), [props.entries, visibleCount]);
    const groups = useMemo(() => groupProfileTimelineEntries(
        window.visibleEntries,
    ), [window.visibleEntries]);
    const date = useMemo(() => new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium', timeZone: 'UTC',
    }), [locale]);
    const month = useMemo(() => new Intl.DateTimeFormat(locale, {
        month: 'long', timeZone: 'UTC', year: 'numeric',
    }), [locale]);
    const notices = [
        props.challengeUnavailable && t('challengeHistoryUnavailable'),
        props.badgesUnavailable && t('timelineBadgesUnavailable'),
        props.malformedCount > 0 && t('timelinePartialData'),
        props.truncatedChallengeCount !== null
            && t('challengeHistoryLimited', { count: props.truncatedChallengeCount }),
    ].filter((notice): notice is string => typeof notice === 'string');
    const hasUnavailableSource = props.challengeUnavailable || props.badgesUnavailable;

    return (
        <section
            aria-labelledby="growth-timeline-title"
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm sm:p-5"
        >
            <h2 id="growth-timeline-title" className="text-base font-bold text-[var(--color-text)]">
                {t('growthTimelineTitle')}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                {t('growthTimelineDescription')}
            </p>
            <p className="mb-3 mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                <span aria-hidden="true">🔒 </span>{t('growthTimelinePrivate')}
            </p>
            {notices.map((notice) => (
                <p
                    key={notice}
                    role="status"
                    className="mb-3 rounded-xl border border-[var(--color-warning)] p-3 text-xs leading-5 text-[var(--color-text)]"
                >
                    {notice}
                </p>
            ))}
            {props.entries.length === 0 && !hasUnavailableSource && props.malformedCount === 0 ? (
                <p className="rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text-muted)]">
                    {t('growthTimelineEmpty')}
                </p>
            ) : (
                <div className="space-y-4">
                    {groups.map((group) => (
                        <div key={group.monthKey ?? 'unknown'}>
                            <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
                                {group.monthKey
                                    ? month.format(new Date(`${group.monthKey}-01T00:00:00Z`))
                                    : t('timelineDateUnknown')}
                            </h3>
                            <ol className="space-y-2">
                                {group.entries.map((entry) => {
                                    const badgeNameKey = entry.kind === 'badge'
                                        ? `badgeNames.${entry.badgeCode}`
                                        : null;
                                    return (
                                        <li
                                            key={entry.id}
                                            className="flex min-w-0 gap-3 rounded-xl bg-[var(--color-surface-muted)] p-3"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                                                    entry.kind === 'badge'
                                                        ? 'bg-[var(--color-reward-soft)] text-[var(--color-reward-strong)]'
                                                        : 'bg-[var(--color-competition-soft)] text-[var(--color-competition-strong)]'
                                                }`}
                                            >
                                                {entry.kind === 'badge' ? '🏅' : entry.status === 'completed' ? '✓' : '旗'}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                                                    <p className="min-w-0 break-words text-sm font-semibold text-[var(--color-text)]">
                                                        {badgeNameKey && museumT.has(badgeNameKey)
                                                            ? museumT(badgeNameKey)
                                                            : entry.title}
                                                    </p>
                                                    {entry.occurredOn ? (
                                                        <time
                                                            dateTime={entry.occurredOn}
                                                            className="shrink-0 text-xs text-[var(--color-text-muted)]"
                                                        >
                                                            {date.format(new Date(`${entry.occurredOn}T00:00:00Z`))}
                                                        </time>
                                                    ) : (
                                                        <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                                                            {t('timelineDateUnknown')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
                                                    {entry.kind === 'badge'
                                                        ? t('timelineBadgeEarned')
                                                        : t(entry.status === 'completed'
                                                            ? 'timelineChallengeCompleted'
                                                            : 'timelineChallengeEnded')}
                                                </p>
                                                {entry.kind === 'challenge' && (
                                                    <p className="mt-1 break-words text-xs leading-5 text-[var(--color-text-muted)]">
                                                        {entry.progressSteps === null
                                                            ? t('timelineProgressUnavailable')
                                                            : t('timelineProgressRecorded', {
                                                                progress: entry.progressSteps.toLocaleString(locale),
                                                            })}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    ))}
                </div>
            )}
            {props.entries.length > PROFILE_TIMELINE_PAGE_SIZE && (
                <button
                    type="button"
                    aria-disabled={window.remainingCount === 0}
                    aria-live="polite"
                    onClick={() => window.remainingCount > 0
                        && setVisibleCount((current) => current + PROFILE_TIMELINE_PAGE_SIZE)}
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-primary-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 aria-disabled:cursor-default aria-disabled:opacity-70 motion-reduce:transition-none"
                >
                    {window.remainingCount > 0
                        ? t('loadMoreTimeline', { count: window.nextBatchCount })
                        : t('timelineAllShown')}
                </button>
            )}
        </section>
    );
}
