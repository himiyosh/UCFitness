'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

// ============================================
// DailyMissions — デイリーミッションウィジェット
// ダッシュボードに表示する3ミッション + 全達成ボーナス
// ============================================

interface Mission {
    id: string;
    mission_type: string;
    title: string;
    description: string;
    reward_uc: number;
    is_completed: boolean;
    completed_at: string | null;
}

type RefreshError = 'reward' | 'generic' | null;
type MissionBonusStatus = 'not_eligible' | 'pending' | 'awarded';

export default function DailyMissions(): ReactNode {
    const t = useTranslations('Mission');
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [allCompleted, setAllCompleted] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [showBonus, setShowBonus] = useState(false);
    const [streak, setStreak] = useState<number | null>(null);
    const [streakUnavailable, setStreakUnavailable] = useState(false);
    const [refreshError, setRefreshError] = useState<RefreshError>(null);
    const [announcement, setAnnouncement] = useState('');
    const [earnedBonus, setEarnedBonus] = useState(false);
    const [bonusPending, setBonusPending] = useState(false);
    const [focusHeadingAfterRefresh, setFocusHeadingAfterRefresh] = useState(false);
    const missionHeadingRef = useRef<HTMLHeadingElement>(null);
    const restoreFocusAfterRefreshRef = useRef(false);

    const fetchMissions = useCallback(async (): Promise<MissionBonusStatus | null> => {
        setIsLoading(true);
        setError(false);
        try {
            const res = await fetch('/api/user/missions');
            const data: unknown = await res.json().catch(() => null);
            if (!res.ok || !isMissionResponse(data)) throw new Error('fetch failed');
            setMissions(data.missions);
            setAllCompleted(data.allCompleted);
            setBonusPending(data.bonusPending);
            setEarnedBonus(data.bonusStatus === 'awarded');
            setRefreshError(data.bonusPending ? 'reward' : null);
            setStreak(typeof data.streak === 'number' ? data.streak : null);
            setStreakUnavailable(Boolean(data.streakUnavailable));
            return data.bonusStatus;
        } catch {
            setError(true);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);
    useEffect(() => {
        void fetchMissions();
    }, [fetchMissions]);

    useEffect(() => {
        if (!focusHeadingAfterRefresh || isLoading) return;
        if (restoreFocusAfterRefreshRef.current) missionHeadingRef.current?.focus();
        restoreFocusAfterRefreshRef.current = false;
        setFocusHeadingAfterRefresh(false);
    }, [focusHeadingAfterRefresh, isLoading, missions.length]);

    // 歩数同期後にミッション再チェック
    const refreshMissions = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await fetch('/api/user/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'refresh' }),
            });
            const result: unknown = await res.json().catch(() => null);
            if (!res.ok || !isMissionResponse(result)) {
                const nextRefreshError: RefreshError =
                    isErrorResponse(result) && result.code === 'MISSION_REWARD_DATABASE_ERROR'
                        ? 'reward'
                        : 'generic';
                const recoveredBonusStatus = await fetchMissions();
                if (recoveredBonusStatus !== 'awarded') setRefreshError(nextRefreshError);
                setFocusHeadingAfterRefresh(true);
                return;
            }

            setMissions(result.missions);
            setAllCompleted(result.allCompleted);
            setBonusPending(result.bonusPending);
            setStreak(typeof result.streak === 'number' ? result.streak : null);
            setStreakUnavailable(Boolean(result.streakUnavailable));
            setRefreshError(result.bonusPending ? 'reward' : null);
            setEarnedBonus(result.bonusStatus === 'awarded');
            setAnnouncement(t('updatedAnnouncement', { count: result.missions.length }));
            setFocusHeadingAfterRefresh(true);
            if (result.allCompleted) {
                if (result.bonusAwarded) {
                    setEarnedBonus(true);
                    setAnnouncement(t('bonusAnnouncement', { amount: result.bonusUc ?? 100 }));
                    setShowBonus(true);
                    setTimeout(() => setShowBonus(false), 1200);
                }
            }
        } catch {
            const recoveredBonusStatus = await fetchMissions();
            if (recoveredBonusStatus !== 'awarded') setRefreshError('generic');
            setFocusHeadingAfterRefresh(true);
        } finally {
            setRefreshing(false);
        }
    }, [fetchMissions, t]);

    if (isLoading) {
        return (
            <>
                <MissionAnnouncement message={announcement} />
                <div aria-busy="true" className="home-mission-module flex flex-col justify-center rounded-2xl border border-[var(--color-reward)]/30 bg-[var(--color-surface)] p-3 shadow-sm">
                    <h2 className="sr-only">{t('dailyMissions')}</h2>
                    <p className="sr-only" role="status" aria-atomic="true">{t('loading')}</p>
                    <div className="animate-pulse">
                        <div className="mb-4 h-5 w-40 rounded bg-[var(--color-surface-muted)]" />
                        <div className="space-y-3">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-14 rounded-xl bg-[var(--color-surface-muted)]" />
                            ))}
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                <MissionAnnouncement message={announcement} />
                <div className="home-mission-module flex flex-col justify-center rounded-2xl border border-[var(--color-reward)]/30 bg-[var(--color-surface)] p-3 shadow-sm">
                    <div className="flex flex-col items-center py-4 text-center">
                        <StatusIcon tone="danger" />
                        <h2 ref={missionHeadingRef} tabIndex={-1} className="mt-2 rounded-lg text-sm font-semibold text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)]">{t('dailyMissions')}</h2>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]" role="alert">{t('loadError')}</p>
                        <button
                            onClick={async (event) => { restoreFocusAfterRefreshRef.current = event.detail === 0; await fetchMissions(); setFocusHeadingAfterRefresh(true); }}
                            className="mt-3 min-h-[44px] rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-strong)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                        >
                            {t('retry')}
                        </button>
                    </div>
                </div>
            </>
        );
    }

    if (missions.length === 0) {
        return (
            <>
                <MissionAnnouncement message={announcement} />
                <div className="home-mission-module flex flex-col justify-center rounded-2xl border border-[var(--color-reward)]/30 bg-[var(--color-surface)] p-3 shadow-sm">
                    <div className="flex flex-col items-center py-4 text-center">
                        <StatusIcon tone="neutral" />
                        <h2 ref={missionHeadingRef} tabIndex={-1} className="mb-1 mt-3 rounded-lg text-sm font-bold text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)]">{t('dailyMissions')}</h2>
                        <p className="text-xs text-[var(--color-text-muted)]" role="status">{t('noMissions')}</p>
                        <button
                            onClick={(event) => { restoreFocusAfterRefreshRef.current = event.detail === 0; void refreshMissions(); }}
                            disabled={refreshing}
                            aria-busy={refreshing}
                            className="home-mission-prepare mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--color-reward-solid)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-reward-strong)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {refreshing && <LoadingSpinner />}
                            {refreshing ? t('preparing') : t('prepare')}
                        </button>
                        {refreshError && (
                            <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--color-danger)]" role="alert">
                                {t(refreshError === 'reward' ? 'rewardUnavailable' : 'refreshError')}
                            </p>
                        )}
                    </div>
                </div>
            </>
        );
    }

    const completedCount = missions.filter(m => m.is_completed).length;

    const bottomMessage = !allCompleted ? (
        <p className="text-center text-xs font-semibold text-[var(--color-reward-strong)]">
            {t('bonusHint')}
        </p>
    ) : (
        <p className="text-center text-xs font-bold text-[var(--color-success-strong)]">
            {t('allCompleted')}
        </p>
    );

    return (
        <>
            <MissionAnnouncement message={announcement} />
            <div className="home-mission-module flex flex-col overflow-hidden rounded-2xl border border-[var(--color-reward)]/30 bg-[var(--color-surface)] shadow-sm">
            {/* ヘッダー */}
            <div className="px-3 pt-3 pb-1.5 sm:px-4 sm:pt-3 sm:pb-2 flex-shrink-0">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-reward-solid)] text-white shadow-sm" aria-hidden="true">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 11.5 11 13.5 15.5 8.5M12 3l2.1 2.1 3-.4.4 3L19.5 10l-2 2.3-.4 3-3-.4L12 17l-2.1-2.1-3 .4-.4-3L4.5 10l2-2.3.4-3 3 .4L12 3Z" />
                            </svg>
                        </span>
                        <h2 ref={missionHeadingRef} tabIndex={-1} className="rounded-lg text-balance text-sm font-bold leading-5 text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)]">
                            {t('dailyMissions')}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[var(--color-reward-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-reward-strong)] tabular-nums uppercase tracking-wider">
                            {completedCount}/{missions.length}
                        </span>
                        {/* 再チェックボタン */}
                        {(!allCompleted || bonusPending) && (
                            <button
                                onClick={(event) => { restoreFocusAfterRefreshRef.current = event.detail === 0; void refreshMissions(); }}
                                disabled={refreshing}
                                aria-busy={refreshing}
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 transition-colors hover:bg-[var(--color-surface-muted)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                title={t('refresh')}
                                aria-label={t('refresh')}
                            >
                                <svg className={`h-4 w-4 text-[var(--color-text-muted)] ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {refreshError && (
                <p className="px-3 pb-2 text-center text-xs text-[var(--color-danger)] sm:px-4" role="alert">
                    {t(refreshError === 'reward' ? 'rewardUnavailable' : 'refreshError')}
                </p>
            )}

            {/* ミッションリスト */}
            <div className="px-3 pb-2 sm:px-4 sm:pb-3 flex flex-col min-h-0">
                <div className="grid auto-rows-auto gap-1.5 sm:gap-2 min-h-0">
                    {missions.map(mission => (
                        <div
                            key={mission.id}
                            className={`home-mission-row flex items-center gap-2 rounded-xl border p-2 transition-colors duration-200 ${
                                mission.is_completed
                                    ? 'border-[var(--color-success)]/40 bg-[var(--color-success-soft)]'
                                    : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--theme-primary)]/25 hover:bg-[var(--color-surface)]'
                            }`}
                            data-state={mission.is_completed ? 'complete' : 'active'}
                        >
                            {/* ステータスアイコン（自動判定 — クリック不可） */}
                            {mission.is_completed ? (
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-success)]/40 bg-[var(--color-success-soft)] text-[var(--color-success-strong)] sm:h-8 sm:w-8">
                                    <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            ) : (
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] sm:h-8 sm:w-8">
                                    <span className="text-xs text-[var(--color-text-muted)]">○</span>
                                </div>
                            )}

                            {/* ミッション詳細 */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs sm:text-sm font-semibold ${mission.is_completed ? 'text-[var(--color-success-strong)] line-through' : 'text-[var(--color-text)]'}`}>
                                    {getMissionTitle(mission.mission_type, mission.title, t)}
                                </p>
                                <p className="mt-0 text-xs text-[var(--color-text-muted)] sm:mt-0.5">
                                    {getMissionDescription(mission.mission_type, mission.description, t)}
                                </p>
                            </div>

                            {/* 報酬 */}
                            <span className="shrink-0 rounded-full bg-[var(--color-reward-soft)] px-2 py-1 text-xs font-bold text-[var(--color-reward-strong)]">
                                +{mission.reward_uc} UC
                            </span>
                        </div>
                    ))}
                </div>

                <div className="pt-2.5">
                    <div className="space-y-2 border-t border-[var(--color-border)] pt-2.5">
                        {bottomMessage}
                        {earnedBonus && (
                            <p className="rounded-lg bg-[var(--color-reward-soft)] px-2.5 py-2 text-center text-xs font-bold text-[var(--color-reward-strong)]">
                                {t('bonusEarned', { amount: 100 })}
                            </p>
                        )}

                        {streakUnavailable ? (
                            <p className="text-center text-xs font-semibold text-[var(--color-text-muted)]" role="status">
                                {t('streakUnavailable')}
                            </p>
                        ) : streak !== null && streak > 0 ? (
                            <div className="flex items-center justify-center gap-2 py-1.5">
                                <p className="text-sm font-bold text-[var(--color-text)]">
                                    {t('streak', { days: streak })}
                                </p>
                                {streak >= 3 && (
                                    <span className="rounded-full bg-[var(--color-reward-soft)] px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-[var(--color-reward-strong)]">
                                        {streak >= 7 ? t('streakAmazing') : t('streakGreat')}
                                    </span>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* ボーナスアニメーション */}
            {showBonus && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" aria-hidden="true">
                    <div className="home-mission-bonus rounded-2xl bg-[var(--color-surface)] p-8 text-center shadow-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">{t('allCompleted')}</p>
                        <p className="mt-3 text-lg font-black text-[var(--color-reward-strong)]">+100 UC</p>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('bonusReward')}</p>
                    </div>
                </div>
            )}
            </div>
        </>
    );
}

function MissionAnnouncement({ message }: { message: string }): ReactNode {
    return (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
            {message}
        </p>
    );
}

function isErrorResponse(value: unknown): value is { code?: string } {
    return typeof value === 'object' && value !== null;
}

function isMissionResponse(value: unknown): value is {
    missions: Mission[];
    allCompleted: boolean;
    bonusPending: boolean;
    bonusStatus: MissionBonusStatus;
    streak: number | null;
    streakUnavailable?: boolean;
    bonusAwarded?: boolean;
    bonusUc?: number;
} {
    return typeof value === 'object' && value !== null
        && 'missions' in value && Array.isArray(value.missions) && value.missions.every(isMission)
        && 'allCompleted' in value && typeof value.allCompleted === 'boolean'
        && 'bonusPending' in value && typeof value.bonusPending === 'boolean'
        && 'streak' in value && (typeof value.streak === 'number' || value.streak === null)
        && (!('streakUnavailable' in value) || typeof value.streakUnavailable === 'boolean')
        && (!('bonusAwarded' in value) || typeof value.bonusAwarded === 'boolean')
        && (!('bonusUc' in value) || typeof value.bonusUc === 'number')
        && 'bonusStatus' in value && (
            value.bonusStatus === 'not_eligible'
            || value.bonusStatus === 'pending'
            || value.bonusStatus === 'awarded'
        );
}

function isMission(value: unknown): value is Mission {
    return typeof value === 'object' && value !== null
        && 'id' in value && typeof value.id === 'string' && 'mission_type' in value && typeof value.mission_type === 'string'
        && 'title' in value && typeof value.title === 'string' && 'description' in value && typeof value.description === 'string'
        && 'reward_uc' in value && typeof value.reward_uc === 'number' && 'is_completed' in value && typeof value.is_completed === 'boolean'
        && 'completed_at' in value && (typeof value.completed_at === 'string' || value.completed_at === null);
}

function LoadingSpinner(): ReactNode {
    return (
        <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden="true"
        />
    );
}

function stripLeadingEmoji(text: string): string {
    return text.replace(/^\p{Extended_Pictographic}[\uFE0F]?\s*/u, '');
}

function getMissionTitle(
    missionType: string,
    fallback: string,
    t: ReturnType<typeof useTranslations<'Mission'>>
): string {
    switch (missionType) {
        case 'WALK_100':
            return t('templates.walk100.title');
        case 'WALK_500':
            return t('templates.walk500.title');
        case 'WALK_1K':
            return t('templates.walk1k.title');
        case 'WALK_3K':
            return t('templates.walk3k.title');
        case 'WALK_5K':
            return t('templates.walk5k.title');
        case 'WALK_8K':
            return t('templates.walk8k.title');
        case 'WALK_10K':
            return t('templates.walk10k.title');
        case 'WALK_15K':
            return t('templates.walk15k.title');
        case 'LOGIN':
            return t('templates.login.title');
        default:
            return stripLeadingEmoji(fallback);
    }
}

function getMissionDescription(
    missionType: string,
    fallback: string,
    t: ReturnType<typeof useTranslations<'Mission'>>
): string {
    switch (missionType) {
        case 'WALK_100':
            return t('templates.walk100.desc');
        case 'WALK_500':
            return t('templates.walk500.desc');
        case 'WALK_1K':
            return t('templates.walk1k.desc');
        case 'WALK_3K':
            return t('templates.walk3k.desc');
        case 'WALK_5K':
            return t('templates.walk5k.desc');
        case 'WALK_8K':
            return t('templates.walk8k.desc');
        case 'WALK_10K':
            return t('templates.walk10k.desc');
        case 'WALK_15K':
            return t('templates.walk15k.desc');
        case 'LOGIN':
            return t('templates.login.desc');
        default:
            return stripLeadingEmoji(fallback);
    }
}

function StatusIcon({ tone }: { tone: 'danger' | 'neutral' }) {
    const className = tone === 'danger'
        ? 'bg-[var(--color-surface-muted)] text-[var(--color-danger)]'
        : 'text-[var(--color-primary)] bg-[var(--color-primary-soft)]';

    return (
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${className}`} aria-hidden="true">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {tone === 'danger' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Z" />
                )}
            </svg>
        </span>
    );
}
