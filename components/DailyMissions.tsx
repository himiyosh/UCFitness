'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

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

export default function DailyMissions() {
    const t = useTranslations('Mission');
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [allCompleted, setAllCompleted] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [showBonus, setShowBonus] = useState(false);
    const [streak, setStreak] = useState(0);

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
            if (result.allCompleted) {
                setAllCompleted(true);
                if (result.bonusAwarded) {
                    setShowBonus(true);
                    setTimeout(() => setShowBonus(false), 3000);
                }
            }
        } catch {
            // サイレントフェイル
        } finally {
            setRefreshing(false);
        }
    }, []);

    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
                    <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-14 bg-gray-100 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex flex-col items-center py-4 text-center">
                    <span className="text-3xl mb-2">⚠️</span>
                    <p className="text-sm font-semibold text-gray-700">{t('loadError')}</p>
                    <button
                        onClick={fetchMissions}
                        className="mt-3 px-4 py-1.5 rounded-lg text-white text-xs font-medium hover:scale-105 transition-transform"
                        style={{ background: 'var(--theme-primary)' }}
                    >
                        {t('retry')}
                    </button>
                </div>
            </div>
        );
    }

    if (missions.length === 0) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex flex-col items-center py-4 text-center">
                    <span className="text-4xl mb-3">🎯</span>
                    <p className="text-sm font-bold text-gray-700 mb-1">{t('dailyMissions')}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">{t('noMissions')}</p>
                </div>
            </div>
        );
    }

    const completedCount = missions.filter(m => m.is_completed).length;
    const progressPercent = (completedCount / missions.length) * 100;

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
            {/* ヘッダー */}
            <div className="px-3 pt-3 pb-2 sm:px-5 sm:pt-5 sm:pb-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        🎯 {t('dailyMissions')}
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--theme-primary)] tabular-nums">
                            {completedCount}/{missions.length}
                        </span>
                        {/* 再チェックボタン */}
                        {!allCompleted && (
                            <button
                                onClick={refreshMissions}
                                disabled={refreshing}
                                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                                title={t('refresh')}
                                aria-label={t('refresh')}
                            >
                                <svg className={`w-4 h-4 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* プログレスバー（削除） */}
                {allCompleted && (
                    <p className="text-xs font-bold text-emerald-600 mt-1">
                        ✨ {t('allCompleted')}
                    </p>
                )}
            </div>

            {/* ミッションリスト */}
            <div className="px-3 pb-3 space-y-1.5 sm:px-5 sm:pb-5 sm:space-y-2 flex-1">
                {missions.map(mission => (
                    <div
                        key={mission.id}
                        className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl border transition-all ${
                            mission.is_completed
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-gray-50 border-gray-100'
                        }`}
                    >
                        {/* ステータスアイコン（自動判定 — クリック不可） */}
                        {mission.is_completed ? (
                            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        ) : (
                            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                                <span className="text-xs text-gray-300">○</span>
                            </div>
                        )}

                        {/* ミッション詳細 */}
                        <div className="flex-1 min-w-0">
                            <p className={`text-xs sm:text-sm font-semibold ${mission.is_completed ? 'text-emerald-700 line-through' : 'text-gray-800'}`}>
                                {mission.title}
                            </p>
                            <p className="text-xs text-gray-400 mt-0 sm:mt-0.5">{mission.description}</p>
                        </div>

                        {/* 報酬 */}
                        <span className={`text-xs font-bold flex-shrink-0 ${mission.is_completed ? 'text-emerald-600' : 'text-[var(--theme-primary)]'}`}>
                            +{mission.reward_uc} UC
                        </span>
                    </div>
                ))}

                {/* 全達成ボーナス表示 */}
                {!allCompleted && (
                    <div className="text-center py-2">
                        <p className="text-xs text-gray-400">
                            🎁 {t('bonusHint')}
                        </p>
                    </div>
                )}

                {/* ミッションストリーク — 連続全達成日数 */}
                {streak > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-center gap-2 py-1.5">
                            <span className="text-lg">{streak >= 7 ? '🌟' : '🔥'}</span>
                            <p className="text-sm font-bold text-gray-700">
                                {t('streak', { days: streak })}
                            </p>
                            {streak >= 3 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                    {streak >= 7 ? t('streakAmazing') : t('streakGreat')}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ボーナスアニメーション */}
            {showBonus && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 text-center animate-bounce">
                        <span className="text-5xl">🎉</span>
                        <p className="text-lg font-black text-[var(--theme-primary)] mt-3">+100 UC</p>
                        <p className="text-sm text-gray-600 mt-1">{t('bonusReward')}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
