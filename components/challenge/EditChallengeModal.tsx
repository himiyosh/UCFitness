'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';

import { useDialogFocus } from '@/hooks/useDialogFocus';
import {
    getChallengeBoundaryTimerDelay,
    getChallengePriorityMetrics,
} from '@/lib/services/challenge-utils';

// ============================================
// チャレンジ編集モーダル コンポーネント
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
}

interface EditChallengeModalProps {
    isOpen: boolean;
    challenge: Challenge;
    onClose: () => void;
    onUpdated?: () => void;
}

export default function EditChallengeModal({ isOpen, challenge, onClose, onUpdated }: EditChallengeModalProps) {
    const t = useTranslations('Challenge');

    const [title, setTitle] = useState(challenge.title);
    const [description, setDescription] = useState(challenge.description || '');
    const [targetSteps, setTargetSteps] = useState(challenge.target_steps);
    const [rewardUC, setRewardUC] = useState(challenge.reward_uc);
    const [startDate, setStartDate] = useState(challenge.start_date);
    const [endDate, setEndDate] = useState(challenge.end_date);
    const [isActive, setIsActive] = useState(challenge.is_active);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expiryBlocked, setExpiryBlocked] = useState(false);
    const [, setTimeRevision] = useState(0);
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const submittingRef = useRef(false);
    const getCurrentScheduleMetrics = useCallback(() => getChallengePriorityMetrics(
        { ...challenge, is_joined: false },
        null,
        Date.now(),
    ), [challenge]);
    const handleClose = useCallback(() => {
        if (!submittingRef.current) onClose();
    }, [onClose]);
    const scheduleMetrics = getCurrentScheduleMetrics();

    useDialogFocus({
        isOpen,
        onClose: handleClose,
        dialogRef,
        initialFocusRef: titleInputRef,
    });
    useEffect(() => {
        if (!isOpen || expiryBlocked) return;
        const handleExpiry = () => {
            setExpiryBlocked(true);
            if (submittingRef.current) {
                setError(t('editExpiredPending'));
                return;
            }
            onClose();
        };
        if (scheduleMetrics.isExpired) {
            handleExpiry();
            return;
        }
        const timerDelay = getChallengeBoundaryTimerDelay(
            scheduleMetrics.millisecondsUntilNextBoundary,
        );
        if (timerDelay === null) return;

        const refreshTimeBoundary = () => {
            const latestMetrics = getCurrentScheduleMetrics();
            if (latestMetrics.isExpired) {
                handleExpiry();
                return;
            }
            setTimeRevision((revision) => revision + 1);
        };
        const timerId = window.setTimeout(refreshTimeBoundary, timerDelay);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshTimeBoundary();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.clearTimeout(timerId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [
        expiryBlocked,
        getCurrentScheduleMetrics,
        isOpen,
        onClose,
        scheduleMetrics.isExpired,
        scheduleMetrics.millisecondsUntilNextBoundary,
        t,
    ]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (submittingRef.current || expiryBlocked) return;
        if (getCurrentScheduleMetrics().isExpired) {
            setExpiryBlocked(true);
            setError(t('editExpired'));
            return;
        }

        if (!title.trim()) {
            setError(t('titleRequired'));
            titleInputRef.current?.focus();
            return;
        }
        if (targetSteps <= 0) {
            setError(t('targetStepsPositive'));
            return;
        }
        if (new Date(endDate) <= new Date(startDate)) {
            setError(t('endDateAfterStart'));
            document.getElementById('edit-challenge-end')?.focus();
            return;
        }

        submittingRef.current = true;
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/challenge/${challenge.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(30_000),
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    target_steps: targetSteps,
                    start_date: startDate,
                    end_date: endDate,
                    reward_uc: rewardUC,
                    is_active: isActive,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || t('updateFailed'));
            }

            onUpdated?.();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('unknownError'));
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }, [title, description, targetSteps, rewardUC, startDate, endDate, isActive, expiryBlocked, challenge.id, onUpdated, onClose, t, getCurrentScheduleMetrics]);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* オーバーレイ */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

            {/* モーダル */}
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-challenge-dialog-title" tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none midnight-solid-panel">
                {/* ヘッダー */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 id="edit-challenge-dialog-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        ✏️ {t('edit')}
                    </h2>
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label={t('closeEditDialog')}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* フォーム */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* タイトル */}
                    <div>
                        <label htmlFor="edit-challenge-title" className="block text-sm font-semibold text-gray-700 mb-1">{t('titleLabel')}</label>
                        <input
                            id="edit-challenge-title"
                            ref={titleInputRef}
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            disabled={expiryBlocked}
                            maxLength={100}
                            className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]" aria-invalid={error === t('titleRequired')} aria-describedby={error === t('titleRequired') ? 'edit-challenge-error' : undefined}
                            required
                        />
                    </div>

                    {/* 説明 */}
                    <div>
                        <label htmlFor="edit-challenge-desc" className="block text-sm font-semibold text-gray-700 mb-1">{t('description')}</label>
                        <textarea
                            id="edit-challenge-desc"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            disabled={expiryBlocked}
                            rows={2}
                            className="min-h-[72px] w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
                        />
                    </div>

                    {/* 目標歩数 */}
                    <div>
                        <label htmlFor="edit-challenge-steps" className="block text-sm font-semibold text-gray-700 mb-1">{t('targetSteps')}</label>
                        <input
                            id="edit-challenge-steps"
                            type="number"
                            value={targetSteps}
                            onChange={e => setTargetSteps(Number(e.target.value))}
                            disabled={expiryBlocked}
                            min={1000}
                            step={1000}
                            className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
                            required
                        />
                    </div>

                    {/* 日付 */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor="edit-challenge-start" className="block text-sm font-semibold text-gray-700 mb-1">{t('startDate')}</label>
                            <input
                                id="edit-challenge-start"
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                disabled={expiryBlocked}
                                className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="edit-challenge-end" className="block text-sm font-semibold text-gray-700 mb-1">{t('endDate')}</label>
                            <input
                                id="edit-challenge-end"
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                disabled={expiryBlocked}
                                className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]" aria-invalid={error === t('endDateAfterStart')} aria-describedby={error === t('endDateAfterStart') ? 'edit-challenge-error' : undefined}
                                required
                            />
                        </div>
                    </div>

                    {/* 報酬UC */}
                    <div>
                        <label htmlFor="edit-challenge-reward" className="block text-sm font-semibold text-gray-700 mb-1">{t('rewardUC')}</label>
                        <div className="flex items-center gap-2">
                            <input
                                id="edit-challenge-reward"
                                type="number"
                                value={rewardUC}
                                onChange={e => setRewardUC(Number(e.target.value))}
                                disabled={expiryBlocked}
                                min={100}
                                max={10000}
                                className="min-h-[44px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
                            />
                            <span className="text-sm font-semibold text-amber-600 whitespace-nowrap">🪙 UC</span>
                        </div>
                    </div>

                    {/* アクティブ切替 */}
                    <div className="flex items-center gap-3">
                        <label htmlFor="edit-challenge-active" className="relative inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center">
                            <input
                                id="edit-challenge-active"
                                type="checkbox"
                                checked={isActive}
                                onChange={e => setIsActive(e.target.checked)}
                                disabled={expiryBlocked}
                                className="sr-only peer" aria-label={t('activeToggle')}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--theme-primary)]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--theme-primary)]" />
                        </label>
                        <span className="text-sm font-semibold text-gray-700">{t('activeToggle')}</span>
                    </div>

                    {/* エラー */}
                    {error && (
                        <div id="edit-challenge-error" role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {/* ボタン */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={submitting}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                        >
                            {t('cancelEdit')}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || expiryBlocked}
                            className="flex-1 px-4 py-2.5 text-sm font-bold rounded-lg bg-[var(--theme-primary)] text-white hover:opacity-90 transition-all disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    {t('saving')}
                                </>
                            ) : t('save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
}
