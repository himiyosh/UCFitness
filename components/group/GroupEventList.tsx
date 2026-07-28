'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

import {
    getChallengeBoundaryTimerDelay,
    getChallengeScheduleMetrics,
} from '@/lib/services/challenge-utils';

import GroupEventCard from './GroupEventCard';
import CreateGroupEventModal from './CreateGroupEventModal';

interface GroupEvent {
    id: string;
    group_id: string;
    title: string;
    description: string | null;
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
    is_active: boolean;
    created_at: string;
}

interface EventWithProgress {
    event: GroupEvent;
    total_steps: number;
    percentage: number;
    members_progress: Array<{
        user_id: string;
        name: string;
        image: string | null;
        username: string | null;
        steps: number;
    }>;
}

interface GroupEventListProps {
    groupId: string;
    isOwnerOrAdmin: boolean;
}

interface GroupEventSchedulePartition {
    activeEvents: GroupEvent[];
    pastEvents: GroupEvent[];
    millisecondsUntilNextBoundary: number | null;
}

export default function GroupEventList({ groupId, isOwnerOrAdmin }: GroupEventListProps) {
    const t = useTranslations('GroupEvent');
    const [tab, setTab] = useState<'active' | 'past'>('active');
    const [events, setEvents] = useState<GroupEvent[]>([]);
    const [eventDetails, setEventDetails] = useState<Map<string, EventWithProgress>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [, setTimeRevision] = useState(0);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/group/${groupId}/events`);
            if (!res.ok) throw new Error('Failed to fetch events');
            const data = await res.json();
            setEvents(data.events || []);

            // 各イベントの進捗を並列取得
            const details = await Promise.all(
                (data.events || []).map(async (event: GroupEvent) => {
                    try {
                        const detailRes = await fetch(
                            `/api/group/${groupId}/events/${event.id}`
                        );
                        if (!detailRes.ok) return null;
                        return (await detailRes.json()) as EventWithProgress;
                    } catch {
                        return null;
                    }
                })
            );

            const detailMap = new Map<string, EventWithProgress>();
            details.forEach((d) => {
                if (d?.event?.id) {
                    detailMap.set(d.event.id, d);
                }
            });
            setEventDetails(detailMap);
        } catch (err) {
            console.error('Failed to fetch events:', err);
            setError('Failed to load events');
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const scheduleNow = Date.now();
    const {
        activeEvents,
        pastEvents,
        millisecondsUntilNextBoundary,
    } = events.reduce<GroupEventSchedulePartition>((partition, event) => {
        const scheduleMetrics = getChallengeScheduleMetrics(event, scheduleNow);
        if (event.is_active && !scheduleMetrics.isExpired) {
            partition.activeEvents.push(event);
        } else {
            partition.pastEvents.push(event);
        }

        const nextBoundary = scheduleMetrics.millisecondsUntilNextBoundary;
        if (
            nextBoundary !== null
            && (
                partition.millisecondsUntilNextBoundary === null
                || nextBoundary < partition.millisecondsUntilNextBoundary
            )
        ) {
            partition.millisecondsUntilNextBoundary = nextBoundary;
        }
        return partition;
    }, {
        activeEvents: [],
        pastEvents: [],
        millisecondsUntilNextBoundary: null,
    });

    useEffect(() => {
        const timerDelay = getChallengeBoundaryTimerDelay(millisecondsUntilNextBoundary);
        if (timerDelay === null) return;

        const refreshTimeBoundary = () => {
            setTimeRevision((revision) => revision + 1);
        };
        const timerId = window.setTimeout(refreshTimeBoundary, timerDelay);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshTimeBoundary();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.clearTimeout(timerId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [millisecondsUntilNextBoundary]);

    const displayEvents = tab === 'active' ? activeEvents : pastEvents;

    const handleCreated = () => {
        setShowCreateModal(false);
        fetchEvents();
    };

    // ローディングスケルトン
    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
                    <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
                {[1, 2].map((i) => (
                    <div
                        key={i}
                        className="bg-white midnight-solid-panel rounded-xl border border-gray-200 p-5 space-y-3 animate-pulse"
                    >
                        <div className="h-5 w-3/4 bg-gray-200 rounded" />
                        <div className="h-3 w-1/2 bg-gray-200 rounded" />
                        <div className="h-3 w-full bg-gray-200 rounded-full" />
                    </div>
                ))}
            </div>
        );
    }

    // エラー状態
    if (error) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    🏆 {t('title')}
                </h2>
                <div className="bg-white midnight-solid-panel rounded-xl border border-gray-200 p-8 text-center">
                    <span className="text-3xl block mb-2">⚠️</span>
                    <p className="text-sm text-red-500 mb-3">{error}</p>
                    <button
                        onClick={fetchEvents}
                        className="px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:scale-105 active:scale-95 transition-transform"
                    >
                        🔄 {t('retry') || 'Retry'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 h-full flex flex-col">
            {/* ヘッダー */}
            <div className="flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    🏆 {t('title')}
                </h2>
                {isOwnerOrAdmin && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-3 py-2.5 min-h-[44px] text-xs font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:scale-105 active:scale-95 transition-transform"
                    >
                        + {t('createEvent')}
                    </button>
                )}
            </div>

            {/* タブ */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setTab('active')}
                    className={`px-3 py-2.5 min-h-[44px] text-xs font-semibold rounded-md transition-colors ${
                        tab === 'active'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-[var(--foreground-muted)] hover:text-gray-700'
                    }`}
                >
                    {t('active')} ({activeEvents.length})
                </button>
                <button
                    onClick={() => setTab('past')}
                    className={`px-3 py-2.5 min-h-[44px] text-xs font-semibold rounded-md transition-colors ${
                        tab === 'past'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-[var(--foreground-muted)] hover:text-gray-700'
                    }`}
                >
                    {t('past')} ({pastEvents.length})
                </button>
            </div>

            {/* イベントリスト */}
            {displayEvents.length === 0 ? (
                <div className="bg-white midnight-solid-panel rounded-xl border border-gray-200 p-8 text-center flex-1 flex flex-col items-center justify-center">
                    <p className="text-3xl mb-2">🏅</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                        {tab === 'active' ? t('noActiveEvents') : t('noPastEvents')}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {displayEvents.map((event) => {
                        const detail = eventDetails.get(event.id);
                        return (
                            <GroupEventCard
                                key={event.id}
                                event={event}
                                totalSteps={detail?.total_steps}
                                percentage={detail?.percentage}
                                topContributors={detail?.members_progress?.slice(0, 3)}
                            />
                        );
                    })}
                </div>
            )}

            {/* 作成モーダル */}
            {showCreateModal && (
                <CreateGroupEventModal
                    groupId={groupId}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
}
