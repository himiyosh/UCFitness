'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';

import UserAvatar from '@/components/UserAvatar';
import { useDialogFocus } from '@/hooks/useDialogFocus';

// ============================================
// チャレンジ詳細モーダル
// 参加者一覧・進捗リーダーボード・達成エフェクトを表示
// ============================================

interface Participant {
    user_id: string;
    progress_steps: number;
    is_completed: boolean;
    completed_at: string | null;
    joined_at: string;
    user: {
        username?: string;
        name?: string;
        image?: string;
    };
}

interface ChallengeDetail {
    id: string;
    title: string;
    description?: string | null;
    type: 'INDIVIDUAL' | 'GROUP';
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
    is_active: boolean;
    created_by?: string;
    creator?: {
        username?: string;
        name?: string;
        image?: string;
    };
    challenge_participants: Participant[];
}

interface ChallengeDetailModalProps {
    challengeId: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function ChallengeDetailModal({ challengeId, isOpen, onClose }: ChallengeDetailModalProps) {
    const t = useTranslations('Challenge');
    const router = useRouter();
    const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useDialogFocus({ isOpen, onClose, dialogRef, initialFocusRef: closeButtonRef });

    const fetchDetail = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await fetch(`/api/challenge/${challengeId}`);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setChallenge(data.challenge);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [challengeId]);

    useEffect(() => {
        if (isOpen) fetchDetail();
    }, [isOpen, fetchDetail]);

    // 参加者を進捗順にソート
    const sortedParticipants = useMemo(() => {
        if (!challenge?.challenge_participants) return [];
        return [...challenge.challenge_participants]
            .sort((a, b) => (b.progress_steps || 0) - (a.progress_steps || 0));
    }, [challenge]);

    // 合計歩数（GROUP チャレンジ用）
    const totalGroupSteps = useMemo(() =>
        sortedParticipants.reduce((sum, p) => sum + (p.progress_steps || 0), 0),
        [sortedParticipants]
    );

    // 残り日数
    const daysLeft = useMemo(() => {
        if (!challenge) return 0;
        const endDate = new Date(challenge.end_date + 'T23:59:59');
        return Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    }, [challenge]);

    const isExpired = useMemo(() => {
        if (!challenge) return false;
        return daysLeft === 0 && new Date() > new Date(challenge.end_date + 'T23:59:59');
    }, [challenge, daysLeft]);

    // ランクメダル
    const getRankEmoji = useCallback((rank: number): string => {
        if (rank === 0) return '🥇';
        if (rank === 1) return '🥈';
        if (rank === 2) return '🥉';
        return `${rank + 1}`;
    }, []);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* オーバーレイ */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* モーダル */}
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={challenge?.title ?? t('detailViewDetail')} tabIndex={-1} className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none animate-[modalSlideUp_0.3s_ease-out] midnight-solid-panel">
                {/* ヘッダー — 装飾付き */}
                <div className="relative overflow-hidden px-5 pt-5 pb-4 border-b border-gray-100">
                    {/* 背景グラデーション装飾 */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--theme-primary)]/5 via-transparent to-amber-50/50" />

                    <div className="relative">
                        <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                                {loading ? (
                                    <div className="animate-pulse">
                                        <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
                                        <div className="h-6 bg-gray-200 rounded w-3/4" />
                                    </div>
                                ) : challenge ? (
                                    <>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold mb-2 ${
                                            challenge.type === 'INDIVIDUAL'
                                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                                        }`}>
                                            {challenge.type === 'INDIVIDUAL' ? '👤' : '👥'}
                                            {challenge.type === 'INDIVIDUAL' ? t('individual') : t('group')}
                                        </span>
                                        <h2 id="challenge-detail-dialog-title" className="text-lg font-bold text-gray-900 line-clamp-2">{challenge.title}</h2>
                                    </>
                                ) : null}
                            </div>
                            <button
                                ref={closeButtonRef}
                                onClick={onClose}
                                className="ml-2 inline-flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                aria-label={t('closeDetailDialog')}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* スクロール可能コンテンツ */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {loading && (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-24 bg-gray-100 rounded-xl" />
                            <div className="h-32 bg-gray-100 rounded-xl" />
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-8" role="alert">
                            <span className="text-3xl block mb-2" aria-hidden="true">⚠️</span>
                            <p className="text-sm text-red-700 mb-3">{t('loadError')}</p>
                            <button
                                onClick={fetchDetail}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--theme-primary)] min-h-[44px] hover:scale-105 active:scale-95 transition-transform"
                            >
                                🔄 {t('retry')}
                            </button>
                        </div>
                    )}

                    {!loading && !error && challenge && (
                        <>
                            {/* 説明 */}
                            {challenge.description && (
                                <p className="text-sm text-gray-600 leading-relaxed">{challenge.description}</p>
                            )}

                            {/* ステータスカード */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-100">
                                    <div className="text-xs text-blue-600 font-semibold mb-1">🎯 {t('target')}</div>
                                    <div className="text-lg font-bold text-blue-800">{challenge.target_steps.toLocaleString()}</div>
                                    <div className="text-xs text-blue-500">{t('stepsUnit')}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-100">
                                    <div className="text-xs text-amber-600 font-semibold mb-1">🪙 {t('reward')}</div>
                                    <div className="text-lg font-bold text-amber-800">{challenge.reward_uc} UC</div>
                                    <div className="text-xs text-amber-500">{t('detailClearReward')}</div>
                                </div>
                            </div>

                            {/* 期間・残り日数 */}
                            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                                <span className="text-xs text-gray-500">
                                    📅 {challenge.start_date} ~ {challenge.end_date}
                                </span>
                                {!isExpired ? (
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                        daysLeft <= 2
                                            ? 'bg-red-50 text-red-600'
                                            : 'bg-green-50 text-green-600'
                                    }`}>
                                        🕐 {t('daysLeft', { count: daysLeft })}
                                    </span>
                                ) : (
                                    <span className="text-xs font-bold text-red-500 px-2 py-0.5 rounded-full bg-red-50">
                                        {t('ended')}
                                    </span>
                                )}
                            </div>

                            {/* GROUP チャレンジの合計進捗 */}
                            {challenge.type === 'GROUP' && sortedParticipants.length > 0 && (
                                <div className="rounded-xl border border-[var(--color-competition)]/30 bg-[var(--color-competition-soft)] p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-bold text-[var(--color-competition-strong)]">🤝 {t('detailGroupProgress')}</span>
                                        <span className="text-sm font-bold text-[var(--color-competition-strong)]">
                                            {Math.min(100, Math.round((totalGroupSteps / challenge.target_steps) * 100))}%
                                        </span>
                                    </div>
                                    <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                                        <div
                                            className="h-full rounded-full bg-[var(--color-competition-solid)] transition-[width] duration-700 ease-out"
                                            style={{ width: `${Math.min(100, (totalGroupSteps / challenge.target_steps) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="mt-1 text-xs text-[var(--color-competition-strong)]">
                                        {totalGroupSteps.toLocaleString()} / {challenge.target_steps.toLocaleString()} {t('stepsUnit')}
                                    </div>
                                </div>
                            )}

                            {/* 作成者 */}
                            {challenge.creator && (
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>{t('detailCreatedBy')}</span>
                                    <UserAvatar
                                        src={challenge.creator.image}
                                        name={challenge.creator.name || challenge.creator.username}
                                        size="xs"
                                    />
                                    <span className="font-semibold text-gray-700">
                                        {challenge.creator.name || challenge.creator.username}
                                    </span>
                                </div>
                            )}

                            {/* 参加者一覧 / リーダーボード */}
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                    🏃 {t('detailParticipants', { count: sortedParticipants.length })}
                                </h3>

                                {sortedParticipants.length === 0 ? (
                                    <div className="text-center py-6">
                                        <div className="text-3xl mb-2">👋</div>
                                        <p className="text-sm text-gray-400">{t('detailNoParticipants')}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {sortedParticipants.map((participant, index) => {
                                            // GROUP: グループ合計に対する個人貢献割合
                                            // INDIVIDUAL: 個人目標に対する達成率
                                            const isGroup = challenge.type === 'GROUP';
                                            const steps = participant.progress_steps || 0;
                                            const percent = isGroup
                                                ? (totalGroupSteps > 0 ? Math.round((steps / totalGroupSteps) * 100) : 0)
                                                : Math.min(100, Math.round((steps / challenge.target_steps) * 100));
                                            const isCompleted = participant.is_completed;
                                            const username = participant.user?.username;

                                            return (
                                                <div
                                                    key={participant.user_id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => {
                                                        if (username) {
                                                            onClose();
                                                            router.push(`/user/${username}`);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if ((e.key === 'Enter' || e.key === ' ') && username) {
                                                            onClose();
                                                            router.push(`/user/${username}`);
                                                        }
                                                    }}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                                        isCompleted
                                                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 hover:border-green-300'
                                                            : index < 3
                                                                ? 'bg-gradient-to-r from-gray-50 to-white border-gray-100 hover:border-[var(--theme-primary)]/30 hover:shadow-sm'
                                                                : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                                                    }`}
                                                    style={{
                                                        animationDelay: `${index * 60}ms`,
                                                        animation: 'fadeInUp 0.3s ease-out forwards',
                                                        opacity: 0,
                                                    }}
                                                    aria-label={`${participant.user?.name || username || 'Unknown'} - ${t('detailViewProfile')}`}
                                                >
                                                    {/* ランク */}
                                                    <div className="w-7 text-center flex-shrink-0">
                                                        <span className={`text-sm ${index < 3 ? 'text-lg' : 'text-gray-400 font-semibold'}`}>
                                                            {getRankEmoji(index)}
                                                        </span>
                                                    </div>

                                                    {/* アバター */}
                                                    <div className="flex-shrink-0 relative">
                                                        <UserAvatar
                                                            src={participant.user?.image}
                                                            name={participant.user?.name || username}
                                                            size="sm"
                                                        />
                                                        {isCompleted && (
                                                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px] border-2 border-white">
                                                                ✓
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* ユーザー情報 + プログレス */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-[var(--theme-primary)]">
                                                                {participant.user?.name || username || 'Unknown'}
                                                            </span>
                                                            <span className={`text-xs font-bold flex-shrink-0 ml-2 ${
                                                                isCompleted ? 'text-green-600' : 'text-gray-500'
                                                            }`}>
                                                                {steps.toLocaleString()} {t('stepsUnit')}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                                                    style={{
                                                                        width: `${percent}%`,
                                                                        backgroundColor: isCompleted
                                                                            ? '#22c55e'
                                                                            : index === 0
                                                                                ? 'var(--theme-primary)'
                                                                                : '#94a3b8',
                                                                    }}
                                                                />
                                                            </div>
                                                            {isGroup && (
                                                                <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums w-8 text-right">
                                                                    {percent}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        {isGroup && (
                                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                                {t('detailContribution')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
