'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function DailyMissions(): ReactNode {
    const t = useTranslations('Mission');
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [allCompleted, setAllCompleted] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [showBonus, setShowBonus] = useState(false);
    const [streak, setStreak] = useState(0);
    const [refreshError, setRefreshError] = useState(false);

    const fetchMissions = useCallback(async () => {
        setError(false);
        try {
            const res = await fetch('/api/user/missions');
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            setMissions(data.missions || []);
            setAllCompleted(data.allCompleted || false);
            setStreak(data.streak || 0);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMissions();
    }, [fetchMissions]);

    // 歩数同期後にミッション再チェック
    const refreshMissions = useCallback(async () => {
        setRefreshing(true);
        setRefreshError(false);
        try {
            const res = await fetch('/api/user/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'refresh' }),
            });
            if (!res.ok) throw new Error('refresh failed');
            const result = await res.json();

            if (result.missions) {
                setMissions(result.missions);
            }
            setAllCompleted(Boolean(result.allCompleted));
            setStreak(result.streak || 0);
            if (result.allCompleted) {
                if (result.bonusAwarded) {
                    setShowBonus(true);
                    setTimeout(() => setShowBonus(false), 3000);
                }
            }
        } catch {
            setRefreshError(true);
        } finally {
            setRefreshing(false);
        }
    }, []);

    if (isLoading) {
        return (
            <div aria-busy="true" className="flex flex-col justify-center rounded-xl border border-l-4 border-[var(--color-border)] border-l-[var(--color-reward)] bg-[var(--color-surface)] p-3 shadow-sm">
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
        );
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center rounded-xl border border-l-4 border-[var(--color-border)] border-l-[var(--color-reward)] bg-[var(--color-surface)] p-3 shadow-sm">
                <div className="flex flex-col items-center py-4 text-center">
                    <StatusIcon tone="danger" />
                    <h2 className="mt-2 text-sm font-semibold text-[var(--color-text)]">{t('dailyMissions')}</h2>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]" role="alert">{t('loadError')}</p>
                    <button
                        onClick={fetchMissions}
                        className="mt-3 min-h-[44px] rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-inverse-surface)]"
                    >
                        {t('retry')}
                    </button>
                </div>
            </div>
        );
    }

    if (missions.length === 0) {
        return (
            <div className="flex flex-col justify-center rounded-xl border border-l-4 border-[var(--color-border)] border-l-[var(--color-reward)] bg-[var(--color-surface)] p-3 shadow-sm">
                <div className="flex flex-col items-center py-4 text-center">
                    <StatusIcon tone="neutral" />
                    <h2 className="mb-1 mt-3 text-sm font-bold text-[var(--color-text)]">{t('dailyMissions')}</h2>
                    <p className="text-xs text-[var(--color-text-muted)]" role="status">{t('noMissions')}</p>
                </div>
            </div>
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
        <div className="flex flex-col overflow-hidden rounded-xl border border-l-4 border-[var(--color-border)] border-l-[var(--color-reward)] bg-[var(--color-surface)] shadow-sm">
            {/* ヘッダー */}
            <div className="px-3 pt-3 pb-1.5 sm:px-4 sm:pt-3 sm:pb-2 flex-shrink-0">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <h2 className="text-sm font-bold text-[var(--color-text)]">
                        {t('dailyMissions')}
                    </h2>
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[var(--color-reward-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-reward-strong)] tabular-nums uppercase tracking-wider">
                            {completedCount}/{missions.length}
                        </span>
                        {/* 再チェックボタン */}
                        {!allCompleted && (
                            <button
                                onClick={refreshMissions}
                                disabled={refreshing}
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 transition-colors hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
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
                    {t('refreshError')}
                </p>
            )}

            {/* ミッションリスト */}
            <div className="px-3 pb-2 sm:px-4 sm:pb-3 flex flex-col min-h-0">
                <div className="grid auto-rows-auto gap-1.5 sm:gap-2 min-h-0">
                    {missions.map(mission => (
                        <div
                            key={mission.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border transition-colors duration-200 ${
                                mission.is_completed
                                    ? 'border-[var(--color-success)]/40 bg-[var(--color-success-soft)]'
                                    : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--theme-primary)]/25 hover:bg-[var(--color-surface)]'
                            }`}
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

                        {streak > 0 && (
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
                        )}
                    </div>
                </div>
            </div>

            {/* ボーナスアニメーション */}
            {showBonus && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="rounded-2xl bg-[var(--color-surface)] p-8 text-center shadow-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">{t('allCompleted')}</p>
                        <p className="mt-3 text-lg font-black text-[var(--color-reward-strong)]">+100 UC</p>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('bonusReward')}</p>
                    </div>
                </div>
            )}
        </div>
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
