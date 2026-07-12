'use client';

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';

import { useDialogFocus } from '@/hooks/useDialogFocus';

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
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    useDialogFocus({
        isOpen,
        onClose,
        dialogRef,
        initialFocusRef: titleInputRef,
        canClose: () => !submitting,
    });

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        if (!title.trim()) {
            setError(t('titleRequired') || 'Title is required');
            return;
        }
        if (targetSteps <= 0) {
            setError('Target steps must be positive');
            return;
        }
        if (new Date(endDate) <= new Date(startDate)) {
            setError('End date must be after start date');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/challenge/${challenge.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
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
                throw new Error(data.error || 'Failed to update challenge');
            }

            onUpdated?.();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setSubmitting(false);
        }
    }, [title, description, targetSteps, rewardUC, startDate, endDate, isActive, submitting, challenge.id, onUpdated, onClose, t]);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* オーバーレイ */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* モーダル */}
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-challenge-dialog-title" tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none midnight-solid-panel">
                {/* ヘッダー */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 id="edit-challenge-dialog-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        ✏️ {t('edit')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label={t('closeCreateDialog')}
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
                            maxLength={100}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
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
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent resize-none"
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
                            min={1000}
                            step={1000}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
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
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
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
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
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
                                min={100}
                                max={10000}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                            />
                            <span className="text-sm font-semibold text-amber-600 whitespace-nowrap">🪙 UC</span>
                        </div>
                    </div>

                    {/* アクティブ切替 */}
                    <div className="flex items-center gap-3">
                        <label htmlFor="edit-challenge-active" className="relative inline-flex items-center cursor-pointer">
                            <input
                                id="edit-challenge-active"
                                type="checkbox"
                                checked={isActive}
                                onChange={e => setIsActive(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--theme-primary)]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--theme-primary)]" />
                        </label>
                        <span className="text-sm font-semibold text-gray-700">{t('activeToggle')}</span>
                    </div>

                    {/* エラー */}
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                            {error}
                        </div>
                    )}

                    {/* ボタン */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                        >
                            {t('cancelEdit') || 'キャンセル'}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 px-4 py-2.5 text-sm font-bold rounded-lg bg-[var(--theme-primary)] text-white hover:opacity-90 transition-all disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    {t('saving') || '保存中...'}
                                </>
                            ) : (t('save') || '保存')}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
}
