'use client';

import { useTranslations } from 'next-intl';
import { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';

const ChallengeDetailModal = dynamic(() => import('@/components/challenge/ChallengeDetailModal'));

// ============================================
// チャレンジカード コンポーネント
// 個々のチャレンジを表示（参加者アバター・進捗バー・参加ボタン・編集ボタン付き）
// カードクリックで詳細モーダルを表示
// ============================================

interface ParticipantAvatar {
    username?: string;
    name?: string;
    image?: string;
}

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
    participant_avatars?: ParticipantAvatar[];
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
    progress?: number | null;
    currentUserId?: string;
    onJoin?: (challengeId: string) => Promise<void>;
    onLeave?: (challengeId: string) => Promise<void>;
    onEdit?: (challenge: Challenge) => void;
}

export default function ChallengeCard({ challenge, progress, currentUserId, onJoin, onLeave, onEdit }: ChallengeCardProps) {
    const t = useTranslations('Challenge');
    const [joining, setJoining] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [isJoined, setIsJoined] = useState(challenge.is_joined);
    const [showDetail, setShowDetail] = useState(false);
    const [joinCelebrating, setJoinCelebrating] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const progressUnavailable = progress === null;
    const progressValue = progress ?? 0;

    const progressPercent = useMemo(
        () => Math.min(100, Math.round((progressValue / challenge.target_steps) * 100)),
        [progressValue, challenge.target_steps]
    );

    // 残り日数計算
    const daysLeft = useMemo(() => {
        const endDate = new Date(challenge.end_date + 'T23:59:59');
        return Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    }, [challenge.end_date]);

    const isExpired = useMemo(() => {
        return daysLeft === 0 && new Date() > new Date(challenge.end_date + 'T23:59:59');
    }, [daysLeft, challenge.end_date]);

    const isCreator = currentUserId && challenge.created_by === currentUserId;
    const isCompleted = progressPercent >= 100 && isJoined;
    const avatars = challenge.participant_avatars || [];

    const handleJoin = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (joining || isJoined || !onJoin) return;
        setJoining(true);
        setActionError(null);
        try {
            await onJoin(challenge.id);
            setIsJoined(true);
            // お祝いアニメーション
            setJoinCelebrating(true);
            setTimeout(() => setJoinCelebrating(false), 1500);
        } catch {
            setActionError(t('joinFailed'));
        } finally {
            setJoining(false);
        }
    }, [joining, isJoined, onJoin, challenge.id, t]);

    const handleLeave = useCallback(async () => {
        if (leaving || !onLeave) return;
        setLeaving(true);
        setActionError(null);
        try {
            await onLeave(challenge.id);
            setIsJoined(false);
            setShowLeaveConfirm(false);
        } catch {
            setActionError(t('leaveFailed'));
        } finally {
            setLeaving(false);
        }
    }, [leaving, onLeave, challenge.id, t]);

    const handleEditClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit?.(challenge);
    }, [onEdit, challenge]);

    return (
        <>
            <div
                onClick={() => setShowDetail(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowDetail(true); }}
                className={`midnight-solid-panel group relative cursor-pointer overflow-hidden rounded-2xl border bg-white p-3 shadow-sm transition-[border-color,box-shadow] duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)] md:p-5 ${
                    isCompleted
                        ? 'border-green-200 bg-gradient-to-br from-white to-green-50/30'
                        : 'border-gray-100 hover:border-[var(--theme-primary)]/20'
                }`}
                aria-label={`${challenge.title} - ${t('detailViewDetail')}`}
            >
                {/* 達成時のキラキラ装飾 */}
                {isCompleted && (
                    <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none">
                        <div className="absolute top-2 right-2 text-2xl animate-bounce">🏆</div>
                        <div className="absolute top-1 right-10 text-xs animate-pulse" style={{ animationDelay: '0.3s' }}>✨</div>
                        <div className="absolute top-8 right-1 text-xs animate-pulse" style={{ animationDelay: '0.7s' }}>✨</div>
                    </div>
                )}

                {/* 参加お祝いアニメーション */}
                {joinCelebrating && (
                    <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                        <div className="text-4xl animate-bounce">🎉</div>
                    </div>
                )}

                {/* タイプバッジ + 残り日数 */}
                <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        challenge.type === 'INDIVIDUAL'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                    }`}>
                        {challenge.type === 'INDIVIDUAL' ? '👤' : '👥'}
                        {challenge.type === 'INDIVIDUAL' ? t('individual') : t('group')}
                    </span>

                    {!isExpired ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            daysLeft <= 2
                                ? 'bg-red-50 text-red-500'
                                : 'bg-gray-50 text-[var(--foreground-muted)]'
                        }`}>
                            🕐 {t('daysLeft', { count: daysLeft })}
                        </span>
                    ) : (
                        <span className="text-xs font-semibold text-red-500 px-2 py-0.5 rounded-full bg-red-50">
                            {t('ended')}
                        </span>
                    )}
                </div>

                {/* タイトル */}
                <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-[var(--theme-primary)] transition-colors">
                    {challenge.title}
                </h3>
                {challenge.description && (
                    <p className="text-sm text-[var(--foreground-muted)] mb-3 line-clamp-2">{challenge.description}</p>
                )}

                {/* 目標・報酬 — コンパクト */}
                <div className="flex items-center gap-4 mb-3 text-sm">
                    <div className="flex items-center gap-1">
                        <span className="text-[var(--foreground-muted)]">🎯</span>
                        <span className="font-bold text-gray-800">{challenge.target_steps.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-amber-500">🪙</span>
                        <span className="font-bold text-amber-600">{challenge.reward_uc} UC</span>
                    </div>
                </div>

                {/* 進捗バー（参加済みの場合のみ） — より楽しいデザイン */}
                {isJoined && progressUnavailable && (
                    <p className="mb-3 rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]" role="status">
                        {t('progressUnavailable')}
                    </p>
                )}
                {isJoined && !progressUnavailable && (
                    <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-[var(--foreground-muted)]">{t('progress')}</span>
                            <span className={`text-xs font-bold ${
                                isCompleted ? 'text-green-600' : 'text-gray-800'
                            }`}>
                                {isCompleted ? '🎉 ' : ''}{progressPercent}%
                            </span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ease-out ${
                                    isCompleted
                                        ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                                        : 'bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)]'
                                }`}
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <div className="text-xs text-[var(--foreground-muted)] mt-1">
                            {progressValue.toLocaleString()} / {challenge.target_steps.toLocaleString()} {t('stepsUnit')}
                        </div>
                    </div>
                )}

                {/* フッター: 参加者アバター & ボタン */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                    {/* 参加者アバタースタック */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
                        className="flex min-h-[44px] items-center gap-2 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)]"
                        aria-label={t('detailViewParticipants')}
                    >
                        {avatars.length > 0 ? (
                            <div className="flex -space-x-2">
                                {avatars.map((avatar, idx) => (
                                    <div
                                        key={avatar.username || idx}
                                        className="w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-gray-200 flex-shrink-0"
                                        style={{ zIndex: avatars.length - idx }}
                                    >
                                        {avatar.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={avatar.image}
                                                alt={avatar.name || avatar.username || ''}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500 bg-gray-100">
                                                {(avatar.name || avatar.username || '?')[0]?.toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {challenge.participant_count > avatars.length && (
                                    <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                                        +{challenge.participant_count - avatars.length}
                                    </div>
                                )}
                            </div>
                        ) : null}
                        <span className="text-xs text-[var(--foreground-muted)]">
                            {t('participants', { count: challenge.participant_count })}
                        </span>
                    </button>

                    <div className="flex items-center gap-2">
                        {/* 編集ボタン（作成者のみ） */}
                        {isCreator && onEdit && (
                            <button
                                onClick={handleEditClick}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-200"
                                aria-label={t('edit')}
                            >
                                ✏️ {t('edit')}
                            </button>
                        )}

                        {isJoined ? (
                            <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${
                                    isCompleted
                                        ? 'bg-green-100 text-green-700 border border-green-300'
                                        : 'bg-green-50 text-green-700 border border-green-200'
                                }`}>
                                    {isCompleted ? '🏆' : '✅'} {isCompleted ? t('detailCompleted') : t('joined')}
                                </span>
                                {/* 離脱ボタン（作成者は離脱不可） */}
                                {!isCreator && onLeave && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowLeaveConfirm(true); }}
                                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2 py-2 text-xs text-red-700 transition-colors hover:bg-red-50 hover:text-red-800"
                                        aria-label={t('leave')}
                                        title={t('leave')}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ) : !isExpired ? (
                            <button
                                onClick={handleJoin}
                                disabled={joining}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-[var(--color-primary-solid)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--color-primary-strong)] disabled:opacity-50"
                            >
                                {joining ? (
                                    <>
                                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        {t('join')}
                                    </>
                                ) : (
                                    <>🚀 {t('join')}</>
                                )}
                            </button>
                        ) : null}
                    </div>
                    {actionError && (
                        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">
                            {actionError}
                        </p>
                    )}
                </div>

                {/* 詳細を見るヒント */}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                    {t('detailTapToView')}
                </div>
            </div>

            {/* 詳細モーダル */}
            {showDetail && (
                <ChallengeDetailModal
                    challengeId={challenge.id}
                    isOpen={showDetail}
                    onClose={() => setShowDetail(false)}
                />
            )}

            {/* 離脱確認ダイアログ */}
            {showLeaveConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="absolute inset-0 bg-black/40" onClick={() => setShowLeaveConfirm(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-[modalSlideUp_0.2s_ease-out]">
                        <div className="text-center mb-4">
                            <div className="text-3xl mb-2">🚪</div>
                            <h3 className="text-base font-bold text-gray-900 mb-1">{t('leaveTitle')}</h3>
                            <p className="text-sm text-gray-500">{t('leaveConfirm')}</p>
                            {actionError && (
                                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                                    {actionError}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLeaveConfirm(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                            >
                                {t('cancelEdit')}
                            </button>
                            <button
                                onClick={handleLeave}
                                disabled={leaving}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
                            >
                                {leaving ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                ) : null}
                                {t('leave')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
