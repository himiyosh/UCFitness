'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { Link } from '@/navigation';

// ============================================
// ダッシュボード用チャレンジウィジェット
// アクティブなチャレンジを最大2件表示
// ============================================

interface DashboardChallenge {
    id: string;
    title: string;
    target_steps: number;
    end_date: string;
    reward_uc: number;
    is_joined: boolean;
    participant_count: number;
}

export default function DashboardChallenges() {
    const t = useTranslations('Challenge');
    const [challenges, setChallenges] = useState<DashboardChallenge[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetchChallenges() {
            try {
                const res = await fetch('/api/challenge?status=active');
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) {
                    setChallenges((data.challenges || []).slice(0, 2));
                }
            } catch {
                // サイレントフェイル — ダッシュボードウィジェットなのでエラーは非表示
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchChallenges();
        return () => { cancelled = true; };
    }, []);

    // データ無し or ローディング中は表示しない
    if (loading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
                    <div className="h-16 bg-gray-200 rounded mb-2" />
                    <div className="h-16 bg-gray-200 rounded" />
                </div>
            </div>
        );
    }

    if (challenges.length === 0) return null;

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    🎯 {t('activeChallenges')}
                </h3>
                <Link
                    href="/challenges"
                    className="text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                >
                    {t('viewAll')}
                </Link>
            </div>

            <div className="space-y-3">
                {challenges.map(challenge => {
                    const endDate = new Date(challenge.end_date + 'T23:59:59');
                    const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

                    return (
                        <Link
                            key={challenge.id}
                            href="/challenges"
                            className="block p-3 rounded-xl border border-gray-100 hover:border-[var(--theme-primary)]/30 hover:shadow-sm transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{challenge.title}</p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--foreground-muted)]">
                                        <span>🎯 {challenge.target_steps.toLocaleString()}</span>
                                        <span>🪙 {challenge.reward_uc} UC</span>
                                        <span>🕐 {t('daysLeft', { count: daysLeft })}</span>
                                    </div>
                                </div>
                                {challenge.is_joined && (
                                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 flex-shrink-0">
                                        ✅
                                    </span>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
