'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import ChallengeCard from '@/components/challenge/ChallengeCard';
import {
    getChallengePriorityMetrics,
    isActionableChallenge,
    sortChallengesForAction,
} from '@/lib/services/challenge-utils';

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

export default function ChallengeList({ currentUserId }: ChallengeListProps) {
    const t = useTranslations('Challenge');
    const [tab, setTab] = useState<TabKey>('active');
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [progressMap, setProgressMap] = useState<Record<string, number | null>>({});
    const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
    const requestIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const tabRef = useRef<TabKey>(tab);
    const mountedRef = useRef(true);

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

            // 参加済みチャレンジの進捗を取得
            const joined = nextChallenges.filter((challenge) => challenge.is_joined);
            if (joined.length > 0) {
                const progressEntries = await Promise.all(
                    joined.map(async (c: Challenge) => {
                        try {
                            const res = await fetch(`/api/challenge/${c.id}/progress`, {
                                signal: abortController.signal,
                            });
                            if (!res.ok) return [c.id, null];
                            const pData = await res.json();
                            const totalSteps = pData.progress?.total_steps;
                            return [
                                c.id,
                                typeof totalSteps === 'number' && Number.isFinite(totalSteps)
                                    ? totalSteps
                                    : null,
                            ];
                        } catch (progressError: unknown) {
                            if (
                                progressError instanceof DOMException
                                && progressError.name === 'AbortError'
                            ) {
                                throw progressError;
                            }
                            return [c.id, null];
                        }
                    })
                );
                Object.assign(nextProgressMap, Object.fromEntries(progressEntries));
            }
            if (requestIdRef.current !== requestId) return;
            setChallenges(nextChallenges);
            setProgressMap(nextProgressMap);
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
                        onClick={() => setTab(key)}
                        role="tab"
                        aria-selected={tab === key}
                        className={`flex min-h-[44px] min-w-0 items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-semibold leading-tight transition-colors sm:px-3 sm:text-sm ${
                            tab === key
                                ? 'bg-white text-[var(--theme-primary)] shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

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
                    <div className="text-5xl mb-4">🎯</div>
                    <p className="mb-2 text-sm text-[var(--color-text-muted)]">
                        {tab === 'active' ? t('listEmptyActive') : t('listEmptyCompleted')}
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
                            currentUserId={currentUserId}
                            onJoin={handleJoin}
                            onLeave={handleLeave}
                            onEdit={setEditingChallenge}
                        />
                    ))}
                </div>
            )}

            {/* 編集モーダル */}
            {editingChallenge && (
                <EditChallengeModal
                    isOpen={true}
                    challenge={editingChallenge}
                    onClose={() => setEditingChallenge(null)}
                    onUpdated={() => {
                        setEditingChallenge(null);
                        fetchChallenges(tab);
                    }}
                />
            )}
        </div>
    );
}
