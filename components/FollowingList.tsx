'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/navigation';

// ============================================
// FollowingList — フォロー中ユーザー一覧
// 歩数付きのフォロー中ユーザーリストを表示
// ============================================

interface FollowingUser {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
    todaySteps: number;
    followedAt: string;
}

interface FollowingListProps {
    /** 最大表示件数 (省略時は全件表示) */
    limit?: number;
    /** コンパクト表示 */
    compact?: boolean;
    /** 追加CSSクラス */
    className?: string;
}

export default function FollowingList({ limit, compact = false, className = '' }: FollowingListProps) {
    const t = useTranslations('Follow');
    const [following, setFollowing] = useState<FollowingUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchFollowing = useCallback(async () => {
        setIsLoading(true);
        setError(false);
        try {
            const res = await fetch('/api/user/following');
            if (res.ok) {
                const data = await res.json();
                setFollowing(data.following || []);
            } else {
                setError(true);
            }
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFollowing();
    }, [fetchFollowing]);

    // ローディングスケルトン
    if (isLoading) {
        return (
            <div className={`space-y-3 ${className}`}>
                {[...Array(limit || 3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-10 h-10 bg-gray-200 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 bg-gray-200 rounded w-24" />
                            <div className="h-3 bg-gray-100 rounded w-16" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // エラー状態
    if (error) {
        return (
            <div className={`text-center py-6 ${className}`}>
                <div className="text-3xl mb-2">⚠️</div>
                <p className="text-sm text-[var(--foreground-muted)] mb-2">{t('loadError')}</p>
                <button
                    onClick={() => fetchFollowing()}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:scale-105 active:scale-95 transition-all"
                    style={{ background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-gradient-to))' }}
                >
                    ↻ Retry
                </button>
            </div>
        );
    }

    // 空状態
    if (following.length === 0) {
        return (
            <div className={`text-center py-6 ${className}`}>
                <div className="text-3xl mb-2">👥</div>
                <p className="text-sm text-[var(--foreground-muted)]">{t('noFollowing')}</p>
            </div>
        );
    }

    const displayList = limit ? following.slice(0, limit) : following;

    return (
        <div className={`space-y-1 ${className}`}>
            {displayList.map((user) => (
                <Link
                    key={user.id}
                    href={user.username ? `/user/${user.username}` : '#'}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                    <UserAvatar
                        src={user.image}
                        name={user.name}
                        size={compact ? 'sm' : 'md'}
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[var(--theme-primary)] transition-colors">
                            {user.name || user.username || 'Unknown'}
                        </p>
                        {user.username && (
                            <p className="text-xs text-[var(--foreground-muted)] truncate">@{user.username}</p>
                        )}
                    </div>
                    <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900 tabular-nums">
                            {user.todaySteps.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-[var(--foreground-muted)]">{t('todaySteps')}</p>
                    </div>
                </Link>
            ))}

            {/* もっと見るリンク（limit指定時 & 超過時） */}
            {limit && following.length > limit && (
                <div className="pt-2 text-center">
                    <span className="text-xs text-[var(--foreground-muted)]">
                        +{following.length - limit} {t('more')}
                    </span>
                </div>
            )}
        </div>
    );
}
