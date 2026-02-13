'use client';

import { useState, useEffect } from 'react';
import FollowButton from '@/components/FollowButton';

// ============================================
// FollowButtonWrapper — サーバーコンポーネント用ラッパー
// フォロー状態をクライアント側で取得してボタンを表示
// ============================================

interface FollowButtonWrapperProps {
    targetUserId: string;
    className?: string;
}

export default function FollowButtonWrapper({ targetUserId, className }: FollowButtonWrapperProps) {
    const [isFollowing, setIsFollowing] = useState<boolean | null>(null);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/user/follow/status?targetUserId=${targetUserId}`);
                if (res.ok) {
                    const data = await res.json();
                    setIsFollowing(data.isFollowing);
                } else {
                    setIsFollowing(false);
                }
            } catch {
                setIsFollowing(false);
            }
        };
        checkStatus();
    }, [targetUserId]);

    // ステータス取得中はスケルトン表示
    if (isFollowing === null) {
        return (
            <div className={`w-[100px] h-[34px] bg-gray-200 rounded-full animate-pulse ${className || ''}`} />
        );
    }

    return (
        <FollowButton
            targetUserId={targetUserId}
            initialIsFollowing={isFollowing}
            className={className}
        />
    );
}
