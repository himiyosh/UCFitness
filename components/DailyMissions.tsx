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
    const [completing, setCompleting] = useState<string | null>(null);
    const [showBonus, setShowBonus] = useState(false);

    const fetchMissions = useCallback(async () => {
        setError(false);
        try {
            const res = await fetch('/api/user/missions');
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            setMissions(data.missions || []);
            setAllCompleted(data.allCompleted || false);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMissions();
    }, [fetchMissions]);

    const completeMission = useCallback(async (missionId: string) => {
        setCompleting(missionId);
        try {
            const res = await fetch('/api/user/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ missionId }),
            });
            if (!res.ok) throw new Error('complete failed');
            const result = await res.json();

            // ミッションを完了に更新
            setMissions(prev => prev.map(m =>
                m.id === missionId ? { ...m, is_completed: true, completed_at: new Date().toISOString() } : m
            ));

            if (result.allCompleted) {
                setAllCompleted(true);
                setShowBonus(true);
                setTimeout(() => setShowBonus(false), 3000);
            }
        } catch {
            // サイレントフェイル
        } finally {
            setCompleting(null);
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
                <div className="flex flex-col items-center py-6 text-center">
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

    if (missions.length === 0) return null;

    const completedCount = missions.filter(m => m.is_completed).length;
    const progressPercent = (completedCount / missions.length) * 100;

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
            {/* ヘッダー */}
            <div className="px-5 pt-5 pb-3">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        🎯 {t('dailyMissions')}
                    </h3>
                    <span className="text-xs font-bold text-[var(--theme-primary)] tabular-nums">
                        {completedCount}/{missions.length}
                    </span>
                </div>

                {/* プログレスバー */}
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                            width: `${progressPercent}%`,
                            background: allCompleted
                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                : 'var(--theme-primary)',
                        }}
                    />
                </div>
                {allCompleted && (
                    <p className="text-[10px] font-bold text-emerald-600 mt-1">
                        ✨ {t('allCompleted')}
                    </p>
                )}
            </div>

            {/* ミッションリスト */}
            <div className="px-5 pb-5 space-y-2">
                {missions.map(mission => (
                    <div
                        key={mission.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            mission.is_completed
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-gray-50 border-gray-100 hover:border-[var(--theme-primary)]/30'
                        }`}
                    >
                        {/* チェックマーク / ボタン */}
                        {mission.is_completed ? (
                            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        ) : (
                            <button
                                onClick={() => completeMission(mission.id)}
                                disabled={completing === mission.id}
                                className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 hover:border-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] transition-colors disabled:opacity-50"
                            >
                                {completing === mission.id ? (
                                    <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full" />
                                ) : null}
                            </button>
                        )}

                        {/* ミッション詳細 */}
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${mission.is_completed ? 'text-emerald-700 line-through' : 'text-gray-800'}`}>
                                {mission.title}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{mission.description}</p>
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
                        <p className="text-[10px] text-gray-400">
                            🎁 {t('bonusHint')}
                        </p>
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
