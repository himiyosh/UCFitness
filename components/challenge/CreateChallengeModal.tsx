'use client';

import { useTranslations } from 'next-intl';
import { useState, useCallback, useEffect, useId, useRef } from 'react';

// ============================================
// チャレンジ作成モーダル コンポーネント
// ============================================

interface CreateChallengeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
}

export default function CreateChallengeModal({ isOpen, onClose, onCreated }: CreateChallengeModalProps) {
    const t = useTranslations('Challenge');
    const baseId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'INDIVIDUAL' | 'GROUP'>('INDIVIDUAL');
    const [targetSteps, setTargetSteps] = useState(100000);
    const [rewardUC, setRewardUC] = useState(500);
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const titleId = `${baseId}-title`;
    const descriptionId = `${baseId}-description`;
    const typeId = `${baseId}-type`;
    const targetStepsId = `${baseId}-target-steps`;
    const startDateId = `${baseId}-start-date`;
    const endDateId = `${baseId}-end-date`;
    const rewardUCId = `${baseId}-reward-uc`;
    const errorId = `${baseId}-error`;

    useEffect(() => {
        if (!isOpen) return;

        titleInputRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusableElements = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
            ).filter((element) => element.offsetParent !== null);

            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        // クライアント側バリデーション
        if (!title.trim()) {
            setError(t('titleRequired'));
            return;
        }
        if (targetSteps <= 0) {
            setError(t('targetStepsPositive'));
            return;
        }
        if (new Date(endDate) <= new Date(startDate)) {
            setError(t('endDateAfterStart'));
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    type,
                    target_steps: targetSteps,
                    start_date: startDate,
                    end_date: endDate,
                    reward_uc: rewardUC,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || t('createFailed'));
            }

            // リセット & 閉じる
            setTitle('');
            setDescription('');
            setTargetSteps(100000);
            setRewardUC(500);
            onCreated?.();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('unknownError'));
        } finally {
            setSubmitting(false);
        }
    }, [title, description, type, targetSteps, rewardUC, startDate, endDate, submitting, onCreated, onClose, t]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            {/* オーバーレイ */}
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* モーダル */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${baseId}-heading`}
                aria-describedby={error ? errorId : undefined}
                className="relative w-full max-w-lg bg-white midnight-solid-panel rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
            >
                {/* ヘッダー */}
                <div className="flex items-center justify-between p-3 sm:p-5 border-b border-gray-100">
                    <h2 id={`${baseId}-heading`} className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        🎯 {t('create')}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('closeCreateDialog')}
                        className="min-h-[44px] min-w-[44px] rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 flex items-center justify-center"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* フォーム */}
                <form onSubmit={handleSubmit} className="p-3 sm:p-5 space-y-3 sm:space-y-4">
                    {/* タイトル */}
                    <div>
                        <label htmlFor={titleId} className="block text-sm font-semibold text-gray-700 mb-1">{t('titleLabel')}</label>
                        <input
                            ref={titleInputRef}
                            id={titleId}
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            maxLength={100}
                            aria-invalid={Boolean(error && !title.trim())}
                            aria-describedby={error ? errorId : undefined}
                            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                            placeholder={t('titlePlaceholder')}
                            required
                        />
                    </div>

                    {/* 説明 */}
                    <div>
                        <label htmlFor={descriptionId} className="block text-sm font-semibold text-gray-700 mb-1">{t('description')}</label>
                        <textarea
                            id={descriptionId}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={2}
                            className="w-full min-h-[72px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent resize-none"
                            placeholder={t('descriptionPlaceholder')}
                        />
                    </div>

                    {/* タイプ */}
                    <div>
                        <p id={typeId} className="block text-sm font-semibold text-gray-700 mb-1">{t('type')}</p>
                        <div className="flex flex-col sm:flex-row gap-2" role="group" aria-labelledby={typeId}>
                            <button
                                type="button"
                                onClick={() => setType('INDIVIDUAL')}
                                aria-pressed={type === 'INDIVIDUAL'}
                                className={`flex-1 min-h-[44px] py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                                    type === 'INDIVIDUAL'
                                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                👤 {t('individual')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('GROUP')}
                                aria-pressed={type === 'GROUP'}
                                className={`flex-1 min-h-[44px] py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                                    type === 'GROUP'
                                        ? 'bg-purple-50 text-purple-700 border-purple-300'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                👥 {t('group')}
                            </button>
                        </div>
                    </div>

                    {/* 目標歩数 */}
                    <div>
                        <label htmlFor={targetStepsId} className="block text-sm font-semibold text-gray-700 mb-1">{t('targetSteps')}</label>
                        <input
                            id={targetStepsId}
                            type="number"
                            value={targetSteps}
                            onChange={e => setTargetSteps(Number(e.target.value))}
                            min={1000}
                            step={1000}
                            aria-invalid={Boolean(error && targetSteps <= 0)}
                            aria-describedby={error ? errorId : undefined}
                            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                            required
                        />
                    </div>

                    {/* 日付 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor={startDateId} className="block text-sm font-semibold text-gray-700 mb-1">{t('startDate')}</label>
                            <input
                                id={startDateId}
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor={endDateId} className="block text-sm font-semibold text-gray-700 mb-1">{t('endDate')}</label>
                            <input
                                id={endDateId}
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                aria-invalid={Boolean(error && new Date(endDate) <= new Date(startDate))}
                                aria-describedby={error ? errorId : undefined}
                                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                                required
                            />
                        </div>
                    </div>

                    {/* 報酬UC */}
                    <div>
                        <label htmlFor={rewardUCId} className="block text-sm font-semibold text-gray-700 mb-1">{t('rewardUC')}</label>
                        <input
                            id={rewardUCId}
                            type="number"
                            value={rewardUC}
                            onChange={e => setRewardUC(Number(e.target.value))}
                            min={100}
                            max={10000}
                            step={100}
                            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                            required
                        />
                    </div>

                    {/* エラー */}
                    {error && (
                        <div id={errorId} className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200" role="alert">
                            {error}
                        </div>
                    )}

                    {/* 送信ボタン */}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-[var(--theme-primary)] hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                {t('creating')}
                            </>
                        ) : (
                            <>🎯 {t('create')}</>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
