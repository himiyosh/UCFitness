'use client';

import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

// ============================================
// チャレンジカード コンポーネント
// 個々のチャレンジを表示（進捗バー・参加ボタン・編集ボタン付き）
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
    is_joined: boolean;
    created_by?: string;
    creator?: {
        username?: string;
        name?: string;
        image?: string;
    };
}

interface ChallengeCardProps {
    challenge: Challenge;
    progress?: number;
    currentUserId?: string;
    onJoin?: (challengeId: string) => Promise<void>;
    onEdit?: (challenge: Challenge) => void;
}

export default function ChallengeCard({ challenge, progress = 0, currentUserId, onJoin, onEdit }: ChallengeCardProps) {
    const t = useTranslations('Challenge');
    const [joining, setJoining] = useState(false);
    const [isJoined, setIsJoined] = useState(challenge.is_joined);

    const progressPercent = Math.min(100, Math.round((progress / challenge.target_steps) * 100));

    // 残り日数計算
    const today = new Date();
    const endDate = new Date(challenge.end_date + 'T23:59:59');
    const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const isExpired = daysLeft === 0 && today > endDate;

    // 作成者かどうか
    const isCreator = currentUserId && challenge.created_by === currentUserId;

    const handleJoin = useCallback(async () => {
        if (joining || isJoined || !onJoin) return;
        setJoining(true);
        try {
            await onJoin(challenge.id);
            setIsJoined(true);
        } catch {
            // エラーは親コンポーネントで処理
        } finally {
            setJoining(false);
        }
    }, [joining, isJoined, onJoin, challenge.id]);

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 relative overflow-hidden">
            {/* タイプバッジ */}
            <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    challenge.type === 'INDIVIDUAL'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                }`}>
                    {challenge.type === 'INDIVIDUAL' ? '👤' : '👥'}
                    {challenge.type === 'INDIVIDUAL' ? t('individual') : t('group')}
                </span>

                {/* 残り日数 */}
                {!isExpired && (
                    <span className="text-xs font-semibold text-[var(--foreground-muted)]">
                        🕐 {t('daysLeft', { count: daysLeft })}
                    </span>
                )}
                {isExpired && (
                    <span className="text-xs font-semibold text-red-500">
                        {t('ended')}
                    </span>
                )}
            </div>

            {/* タイトル・説明 */}
            <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1">{challenge.title}</h3>
            {challenge.description && (
                <p className="text-sm text-[var(--foreground-muted)] mb-3 line-clamp-2">{challenge.description}</p>
            )}

            {/* 目標・報酬 */}
            <div className="flex items-center gap-4 mb-4 text-sm">
                <div className="flex items-center gap-1">
                    <span className="text-[var(--foreground-muted)]">🎯 {t('target')}:</span>
                    <span className="font-bold text-gray-800">{challenge.target_steps.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[var(--foreground-muted)]">🪙 {t('reward')}:</span>
                    <span className="font-bold text-amber-600">{challenge.reward_uc} UC</span>
                </div>
            </div>

            {/* 期間 */}
            <div className="text-xs text-[var(--foreground-muted)] mb-3">
                📅 {challenge.start_date} ~ {challenge.end_date}
            </div>

            {/* 進捗バー（参加済みの場合のみ） */}
            {isJoined && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-[var(--foreground-muted)]">{t('progress')}</span>
                        <span className="text-xs font-bold text-gray-800">{progressPercent}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                                width: `${progressPercent}%`,
                                backgroundColor: progressPercent >= 100 ? 'var(--theme-success, #22c55e)' : 'var(--theme-primary)',
                            }}
                        />
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)] mt-1">
                        {progress.toLocaleString()} / {challenge.target_steps.toLocaleString()} {t('stepsUnit')}
                    </div>
                </div>
            )}

            {/* フッター: 参加者数 & ボタン */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
                    👥 {t('participants', { count: challenge.participant_count })}
                </span>

                <div className="flex items-center gap-2">
                    {/* 編集ボタン（作成者のみ） */}
                    {isCreator && onEdit && (
                        <button
                            onClick={() => onEdit(challenge)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors min-h-[32px]"
                            aria-label={t('edit')}
                        >
                            ✏️ {t('edit')}
                        </button>
                    )}

                    {isJoined ? (
                        <span className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                            ✅ {t('joined')}
                        </span>
                    ) : !isExpired ? (
                        <button
                            onClick={handleJoin}
                            disabled={joining}
                            className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full text-xs font-bold bg-[var(--theme-primary)] text-white hover:opacity-90 hover:scale-105 transition-all disabled:opacity-50"
                        >
                            {joining ? (
                                <>
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    {t('join')}
                                </>
                            ) : t('join')}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
