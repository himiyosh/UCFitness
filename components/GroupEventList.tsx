'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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

export default function GroupEventList({ groupId, isOwnerOrAdmin }: GroupEventListProps) {
    const t = useTranslations('GroupEvent');
    const [tab, setTab] = useState<'active' | 'past'>('active');
    const [events, setEvents] = useState<GroupEvent[]>([]);
    const [eventDetails, setEventDetails] = useState<Map<string, EventWithProgress>>(new Map());
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
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
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const now = new Date();
    const activeEvents = events.filter((e) => {
        const endDate = new Date(e.end_date + 'T23:59:59');
        return endDate >= now && e.is_active;
    });
    const pastEvents = events.filter((e) => {
        const endDate = new Date(e.end_date + 'T23:59:59');
        return endDate < now || !e.is_active;
    });

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

    return (
        <div className="space-y-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    🏆 {t('title')}
                </h2>
                {isOwnerOrAdmin && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:opacity-90 transition-opacity"
                    >
                        + {t('createEvent')}
                    </button>
                )}
            </div>

            {/* タブ */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setTab('active')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        tab === 'active'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-[var(--foreground-muted)] hover:text-gray-700'
                    }`}
                >
                    {t('active')} ({activeEvents.length})
                </button>
                <button
                    onClick={() => setTab('past')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
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
                <div className="bg-white midnight-solid-panel rounded-xl border border-gray-200 p-8 text-center">
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
