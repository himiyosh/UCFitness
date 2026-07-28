'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { useTranslations } from 'next-intl';

import ChallengeCard from '@/components/challenge/ChallengeCard';
import {
    MAX_CHALLENGE_PROGRESS_BATCH_SIZE,
    parseChallengeProgressBatchResponse,
} from '@/lib/challenge-progress';
import {
    getChallengePriorityMetrics,
    isActionableChallenge,
    sortChallengesForAction,
} from '@/lib/services/challenge-utils';
import type { ChallengeProgressRecordStatus } from '@/lib/challenge-progress';

const ChallengeGearBanner = dynamic(() => import('@/components/challenge/ChallengeGearBanner'));
const EditChallengeModal = dynamic(() => import('@/components/challenge/EditChallengeModal'));

// ============================================
// チャレンジ一覧 コンポーネント
// アクティブ / 完了 / マイチャレンジ のタブ切り替え
// ============================================

interface Challenge {
    id: string;
    title: string;
    description?: string | null;
    type: 'INDIVIDUAL' | 'GROUP';
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
    is_active: boolean;
    participant_count: number;
    participant_avatars?: { username?: string; name?: string; image?: string }[];
    is_joined: boolean;
    created_by?: string;
    creator?: {
        username?: string;
        name?: string;
        image?: string;
    };
}

interface ChallengeListProps {
    currentUserId?: string;
}

type TabKey = 'active' | 'completed' | 'my';
type ChallengeProgressDisplayStatus =
    | ChallengeProgressRecordStatus
    | 'unavailable';

const TAB_ORDER: readonly TabKey[] = ['active', 'completed', 'my'];

export default function ChallengeList({ currentUserId }: ChallengeListProps) {
    const t = useTranslations('Challenge');
    const [tab, setTab] = useState<TabKey>('active');
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [progressMap, setProgressMap] = useState<Record<string, number | null>>({});
    const [progressStatusMap, setProgressStatusMap] = useState<
        Record<string, ChallengeProgressDisplayStatus>
    >({});
    const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
    const requestIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const tabRef = useRef<TabKey>(tab);
    const mountedRef = useRef(true);
    const tabButtonRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
        active: null,
        completed: null,
        my: null,
    });

    // チャレンジ一覧を取得
    const fetchChallenges = useCallback(async (status: TabKey) => {
        if (!mountedRef.current) return;
        abortControllerRef.current?.abort();
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setLoading(true);
        setError(null);
        setProgressMap({});
        setProgressStatusMap({});
        try {
            const res = await fetch(`/api/challenge?status=${status}`, {
                signal: abortController.signal,
            });
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            const nextChallenges: Challenge[] = Array.isArray(data.challenges)
                ? data.challenges
                : [];
            const nextProgressMap: Record<string, number | null> = {};
            const nextProgressStatusMap: Record<string, ChallengeProgressDisplayStatus> = {};

            const joined = nextChallenges.filter((challenge) => challenge.is_joined);
            if (joined.length > 0) {
                const joinedIds = joined.map((challenge) => challenge.id);
                for (const challengeId of joinedIds) {
                    nextProgressMap[challengeId] = null;
                    nextProgressStatusMap[challengeId] = 'unavailable';
                }
                if (joinedIds.length <= MAX_CHALLENGE_PROGRESS_BATCH_SIZE) {
                    try {
                        const progressResponse = await fetch('/api/challenge/progress', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ challengeIds: joinedIds }),
                            signal: abortController.signal,
                        });
                        if (progressResponse.ok) {
                            const parsed = parseChallengeProgressBatchResponse(
                                await progressResponse.json(),
                                joinedIds,
                            );
                            if (parsed) {
                                for (const result of parsed.results) {
                                    if (result.status !== 'ok') continue;
                                    const { progress } = result;
                                    nextProgressStatusMap[result.challenge_id] =
                                        progress.record_status;
                                    nextProgressMap[result.challenge_id] =
                                        progress.record_status === 'recorded'
                                            ? progress.total_steps
                                            : null;
                                }
                            }
                        }
                    } catch (progressError: unknown) {
                        if (
                            progressError instanceof DOMException
                            && progressError.name === 'AbortError'
                        ) {
                            throw progressError;
                        }
                    }
                }
            }
            if (requestIdRef.current !== requestId) return;
            setChallenges(nextChallenges);
            setProgressMap(nextProgressMap);
            setProgressStatusMap(nextProgressStatusMap);
        } catch (fetchError: unknown) {
            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
            if (requestIdRef.current === requestId) {
                setError(t('loadError'));
            }
        } finally {
            if (requestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [t]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortControllerRef.current?.abort();
            requestIdRef.current += 1;
        };
    }, []);
    useEffect(() => {
        tabRef.current = tab;
        fetchChallenges(tab);
    }, [tab, fetchChallenges]);

    // チャレンジに参加
    const handleJoin = useCallback(async (challengeId: string) => {
        const res = await fetch(`/api/challenge/${challengeId}/join`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to join');
        }
        // 一覧を再取得
        if (mountedRef.current) {
            await fetchChallenges(tabRef.current);
        }
    }, [fetchChallenges]);

    // チャレンジから離脱
    const handleLeave = useCallback(async (challengeId: string) => {
        const res = await fetch(`/api/challenge/${challengeId}/leave`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to leave');
        }
        if (mountedRef.current) {
            await fetchChallenges(tabRef.current);
        }
    }, [fetchChallenges]);
    const handleEditClose = useCallback(() => setEditingChallenge(null), []);

    const handleTabKeyDown = useCallback((
        event: KeyboardEvent<HTMLButtonElement>,
        currentTab: TabKey,
    ) => {
        const currentIndex = TAB_ORDER.indexOf(currentTab);
        let nextIndex: number | null = null;

        if (event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % TAB_ORDER.length;
        } else if (event.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = TAB_ORDER.length - 1;
        }

        if (nextIndex === null) return;
        event.preventDefault();
        const nextTab = TAB_ORDER[nextIndex];
        setTab(nextTab);
        tabButtonRefs.current[nextTab]?.focus();
    }, []);

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'active', label: t('active') },
        { key: 'completed', label: t('completed') },
        { key: 'my', label: t('myChallenges') },
    ];
    const displayedChallenges = useMemo(
        () => tab === 'completed'
            ? challenges
            : sortChallengesForAction(challenges, progressMap),
        [challenges, progressMap, tab],
    );
    const priorityChallenge = displayedChallenges.find(
        (challenge) => isActionableChallenge(
            challenge,
            progressMap[challenge.id],
        ),
    ) ?? null;
    const priorityMetrics = priorityChallenge
        ? getChallengePriorityMetrics(
            priorityChallenge,
            progressMap[priorityChallenge.id],
        )
        : null;

    return (
        <div>
            {/* タブ */}
            <div className="mb-6 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1" role="tablist" aria-label={t('title')}>
                {tabs.map(({ key, label }) => (
                    <button
                        key={key}
                        ref={(element) => {
                            tabButtonRefs.current[key] = element;
                        }}
                        id={`challenge-tab-${key}`}
                        onClick={() => setTab(key)}
                        onKeyDown={(event) => handleTabKeyDown(event, key)}
                        role="tab"
                        aria-selected={tab === key}
                        aria-controls="challenge-panel"
                        tabIndex={tab === key ? 0 : -1}
                        className={`flex min-h-[44px] min-w-0 items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)] sm:px-3 sm:text-sm ${
                            tab === key
                                ? 'bg-white text-[var(--theme-primary)] shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div
                id="challenge-panel"
                role="tabpanel"
                aria-labelledby={`challenge-tab-${tab}`}
                aria-busy={loading}
                tabIndex={0}
                className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)]"
            >
            {tab === 'completed' && (
                <section
                    className="mb-4 rounded-2xl border border-[var(--color-reward)]/35 bg-[var(--color-reward-soft)] p-3 sm:p-4"
                    aria-labelledby="challenge-history-title"
                >
                    <div className="flex items-start gap-3">
                        <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-xl text-[var(--color-reward-strong)]"
                            aria-hidden="true"
                        >
                            🏛️
                        </span>
                        <div className="min-w-0">
                            <h2
                                id="challenge-history-title"
                                className="text-sm font-black text-[var(--color-text)] sm:text-base"
                            >
                                {t('historyTitle')}
                            </h2>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)] sm:text-sm">
                                {t('historyDescription')}
                            </p>
                        </div>
                    </div>
                    <ul
                        className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap"
                        role="list"
                    >
                        <li className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-muted)]">
                            <span aria-hidden="true">🏁</span>
                            {t('historyEndedMarker')}
                        </li>
                        <li className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[var(--color-success-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-success-strong)]">
                            <span aria-hidden="true">🏆</span>
                            {t('historyPersonalMarker')}
                        </li>
                    </ul>
                </section>
            )}

            {/* ローディング */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="midnight-solid-panel animate-pulse rounded-2xl border border-gray-100 bg-white p-3 md:p-5">
                            <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
                            <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                            <div className="h-3 bg-gray-200 rounded w-full mb-4" />
                            <div className="h-2.5 bg-gray-200 rounded w-full mb-3" />
                            <div className="h-8 bg-gray-200 rounded w-24" />
                        </div>
                    ))}
                </div>
            )}

            {/* エラー */}
            {error && !loading && (
                <div className="text-center py-12">
                    <span className="text-3xl block mb-2">⚠️</span>
                    <p className="text-red-500 text-sm mb-3">{error}</p>
                    <button
                        onClick={() => fetchChallenges(tab)}
                        className="mt-2 px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:scale-105 active:scale-95 transition-transform"
                    >
                        🔄 {t('retry')}
                    </button>
                </div>
            )}

            {/* 空状態 */}
            {!loading && !error && challenges.length === 0 && (
                <div className="text-center py-16">
                    <div className="text-5xl mb-4" aria-hidden="true">
                        {tab === 'completed' ? '🏛️' : '🎯'}
                    </div>
                    <p className="mb-2 text-sm text-[var(--color-text-muted)]">
                        {tab === 'active'
                            ? t('listEmptyActive')
                            : tab === 'completed'
                                ? t('listEmptyCompleted')
                                : t('listEmptyMy')}
                    </p>
                    {tab === 'active' && (
                        <p className="text-xs text-[var(--color-text-muted)]">{t('listEmptyActiveHint')}</p>
                    )}
                </div>
            )}

            {/* チャレンジ達成ギアバナー（completedタブのみ） */}
            {!loading && !error && tab === 'completed' && challenges.length > 0 && (
                <ChallengeGearBanner />
            )}

            {!loading && !error && priorityChallenge && priorityMetrics && tab !== 'completed' && (
                <section className="mb-4 flex flex-col gap-2 rounded-2xl border border-[var(--color-competition)]/25 bg-[var(--color-competition-soft)] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4" aria-labelledby="priority-challenge-title">
                    <div className="min-w-0">
                        <p id="priority-challenge-title" className="text-xs font-bold text-[var(--color-competition-strong)]">{t('priorityTitle')}</p>
                        <p className="mt-0.5 truncate text-sm font-black text-[var(--color-text)]">{priorityChallenge.title}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {priorityMetrics.progressUnavailable || priorityMetrics.remainingSteps === null
                                ? t('progressUnavailable')
                                : t('priorityNextStep', {
                                    steps: priorityMetrics.nextStepTarget?.toLocaleString() ?? '—',
                                })}
                        </p>
                    </div>
                    <span className="w-fit shrink-0 rounded-full bg-[var(--color-reward-soft)] px-3 py-1.5 text-xs font-black text-[var(--color-reward-strong)]">
                        {priorityMetrics.daysLeft <= 3
                            ? t('urgentReward', {
                                days: priorityMetrics.daysLeft,
                                reward: priorityChallenge.reward_uc.toLocaleString(),
                            })
                            : t('priorityDeadlineReward', {
                                days: priorityMetrics.daysLeft,
                                reward: priorityChallenge.reward_uc.toLocaleString(),
                            })}
                    </span>
                </section>
            )}

            {/* チャレンジ一覧 */}
            {!loading && !error && challenges.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                    {displayedChallenges.map(challenge => (
                        <ChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            progress={progressMap[challenge.id]}
                            progressStatus={progressStatusMap[challenge.id]}
                            currentUserId={currentUserId}
                            onJoin={handleJoin}
                            onLeave={handleLeave}
                            onEdit={setEditingChallenge}
                        />
                    ))}
                </div>
            )}
            </div>

            {/* 編集モーダル */}
            {editingChallenge && (
                <EditChallengeModal
                    isOpen={true}
                    challenge={editingChallenge}
                    onClose={handleEditClose}
                    onUpdated={() => {
                        setEditingChallenge(null);
                        fetchChallenges(tab);
                    }}
                />
            )}
        </div>
    );
}
