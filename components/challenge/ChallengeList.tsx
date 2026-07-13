'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import ChallengeCard from '@/components/challenge/ChallengeCard';

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

    // チャレンジ一覧を取得
    const fetchChallenges = useCallback(async (status: TabKey) => {
        setLoading(true);
        setError(null);
        setProgressMap({});
        try {
            const res = await fetch(`/api/challenge?status=${status}`);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setChallenges(data.challenges || []);

            // 参加済みチャレンジの進捗を取得
            const joined = (data.challenges || []).filter((c: Challenge) => c.is_joined);
            if (joined.length > 0) {
                const progressEntries = await Promise.all(
                    joined.map(async (c: Challenge) => {
                        try {
                            const res = await fetch(`/api/challenge/${c.id}/progress`);
                            if (!res.ok) return [c.id, null];
                            const pData = await res.json();
                            return [c.id, pData.progress?.total_steps ?? 0];
                        } catch {
                            return [c.id, null];
                        }
                    })
                );
                setProgressMap(Object.fromEntries(progressEntries));
            }
        } catch {
            setError(t('loadError'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
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
        await fetchChallenges(tab);
    }, [tab, fetchChallenges]);

    // チャレンジから離脱
    const handleLeave = useCallback(async (challengeId: string) => {
        const res = await fetch(`/api/challenge/${challengeId}/leave`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to leave');
        }
        await fetchChallenges(tab);
    }, [tab, fetchChallenges]);

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'active', label: t('active') },
        { key: 'completed', label: t('completed') },
        { key: 'my', label: t('myChallenges') },
    ];

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
                        className={`flex min-h-[44px] min-w-0 items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-semibold leading-tight transition-all sm:px-3 sm:text-sm ${
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
                        <div key={i} className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-5 animate-pulse">
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

            {/* チャレンジ一覧 */}
            {!loading && !error && challenges.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                    {challenges.map(challenge => (
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
