'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/navigation';

// ============================================
// DashboardFollowing — ダッシュボード用フォロー中ユーザーカード
// トップ5のフォロー中ユーザーをコンパクトに表示
// ============================================

interface FollowingUser {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
    todaySteps: number;
}

export default function DashboardFollowing() {
    const t = useTranslations('Follow');
    const [following, setFollowing] = useState<FollowingUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasData, setHasData] = useState(false);

    useEffect(() => {
        const fetchFollowing = async () => {
            try {
                const res = await fetch('/api/user/following');
                if (res.ok) {
                    const data = await res.json();
                    const list = data.following || [];
                    setFollowing(list.slice(0, 5));
                    setHasData(list.length > 0);
                }
            } catch {
                // エラー時は非表示
            } finally {
                setIsLoading(false);
            }
        };
        fetchFollowing();
    }, []);

    // ローディング中はスケルトン表示
    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="h-5 bg-gray-200 rounded w-28 animate-pulse" />
                </div>
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 animate-pulse">
                            <div className="w-8 h-8 bg-gray-200 rounded-full" />
                            <div className="flex-1 h-3 bg-gray-200 rounded" />
                            <div className="w-12 h-3 bg-gray-100 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // フォロー0件の場合は表示しない
    if (!hasData) {
        return null;
    }

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
            {/* ヘッダー */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[var(--theme-primary-light)] rounded-lg">
                        <svg className="w-4 h-4 text-[var(--theme-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900">{t('followingActivity')}</h3>
                </div>
                <span className="text-xs text-[var(--foreground-muted)] font-medium">
                    {t('followCount', { count: following.length })}
                </span>
            </div>

            {/* ユーザーリスト */}
            <div className="px-3 pb-3">
                {following.map((user, index) => (
                    <Link
                        key={user.id}
                        href={user.username ? `/user/${user.username}` : '#'}
                        className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors group"
                    >
                        {/* 順位 */}
                        <span className="w-5 text-center text-xs font-bold text-[var(--foreground-muted)] tabular-nums">
                            {index + 1}
                        </span>

                        <UserAvatar
                            src={user.image}
                            name={user.name}
                            size="sm"
                        />

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[var(--theme-primary)] transition-colors">
                                {user.name || user.username || 'Unknown'}
                            </p>
                        </div>

                        <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-gray-900 tabular-nums">
                                {user.todaySteps.toLocaleString()}
                            </p>
                            <p className="text-[9px] text-[var(--foreground-muted)]">{t('todaySteps')}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
