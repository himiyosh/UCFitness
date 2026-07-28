'use client';

import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';

import { useDialogFocus } from '@/hooks/useDialogFocus';

interface CreateGroupEventModalProps {
    groupId: string;
    onClose: () => void;
    onCreated: () => void;
}

export default function CreateGroupEventModal({
    groupId,
    onClose,
    onCreated,
}: CreateGroupEventModalProps) {
    const t = useTranslations('GroupEvent');
    const commonT = useTranslations('Common');
    const baseId = useId();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [targetSteps, setTargetSteps] = useState(100000);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [rewardUc, setRewardUc] = useState(300);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const targetStepsInputRef = useRef<HTMLInputElement>(null);
    const startDateInputRef = useRef<HTMLInputElement>(null);
    const endDateInputRef = useRef<HTMLInputElement>(null);
    const titleId = `${baseId}-title`;
    const descriptionId = `${baseId}-description`;
    const targetStepsId = `${baseId}-target-steps`;
    const startDateId = `${baseId}-start-date`;
    const endDateId = `${baseId}-end-date`;
    const rewardUcId = `${baseId}-reward-uc`;
    const errorId = `${baseId}-error`;
    const handleClose = useCallback(() => {
        if (!submitting) onClose();
    }, [onClose, submitting]);

    useDialogFocus({
        isOpen: true,
        onClose: handleClose,
        dialogRef,
        initialFocusRef: titleInputRef,
    });

    // 今日の日付（YYYY-MM-DD）
    const today = new Date().toISOString().split('T')[0];

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setError('');

        // クライアントバリデーション
        if (!title.trim()) {
            setError(t('titleRequired'));
            titleInputRef.current?.focus();
            return;
        }
        if (targetSteps <= 0) {
            setError(t('targetRequired'));
            targetStepsInputRef.current?.focus();
            return;
        }
        if (!startDate || !endDate) {
            setError(t('dateRequired'));
            (startDate ? endDateInputRef : startDateInputRef).current?.focus();
            return;
        }
        if (endDate < startDate) {
            setError(t('dateInvalid'));
            endDateInputRef.current?.focus();
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/group/${groupId}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(30_000),
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    target_steps: targetSteps,
                    start_date: startDate,
                    end_date: endDate,
                    reward_uc: rewardUc,
                }),
            });

            if (!res.ok) {
                setError(t('createFailed'));
                return;
            }

            onCreated();
        } catch {
            setError(t('createFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* オーバーレイ */}
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* モーダル */}
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-group-event-dialog-title" aria-describedby={error ? errorId : undefined} tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl outline-none midnight-solid-panel">
                {/* ヘッダー */}
                <div className="flex items-center justify-between border-b border-gray-100 p-3 sm:p-5">
                    <h2 id="create-group-event-dialog-title" className="text-lg font-bold text-gray-900">
                        🏆 {t('createEvent')}
                    </h2>
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        type="button"
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-xl leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label={commonT('close')}
                    >
                        ✕
                    </button>
                </div>

                {/* フォーム */}
                <form onSubmit={handleSubmit} className="space-y-3 p-3 sm:space-y-4 sm:p-5">
                    {/* タイトル */}
                    <div>
                        <label htmlFor={titleId} className="block text-sm font-semibold text-gray-700 mb-1">
                            {t('eventTitle')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            ref={titleInputRef}
                            id={titleId}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={100}
                            placeholder={t('titlePlaceholder')}
                            aria-invalid={Boolean(error && !title.trim())}
                            aria-describedby={error ? errorId : undefined}
                            className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/30"
                            required
                        />
                    </div>

                    {/* 説明 */}
                    <div>
                        <label htmlFor={descriptionId} className="block text-sm font-semibold text-gray-700 mb-1">
                            {t('description')}
                        </label>
                        <textarea
                            id={descriptionId}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder={t('descriptionPlaceholder')}
                            className="min-h-[72px] w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/30"
                        />
                    </div>

                    {/* 目標歩数 */}
                    <div>
                        <label htmlFor={targetStepsId} className="block text-sm font-semibold text-gray-700 mb-1">
                            {t('targetSteps')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            ref={targetStepsInputRef}
                            id={targetStepsId}
                            type="number"
                            value={targetSteps}
                            onChange={(e) => setTargetSteps(Number(e.target.value))}
                            min={1}
                            aria-invalid={Boolean(error && targetSteps <= 0)}
                            aria-describedby={error ? errorId : undefined}
                            className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/30"
                            required
                        />
                    </div>

                    {/* 日付範囲 */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor={startDateId} className="block text-sm font-semibold text-gray-700 mb-1">
                                {t('startDate')} <span className="text-red-500">*</span>
                            </label>
                            <input
                                ref={startDateInputRef}
                                id={startDateId}
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                min={today}
                                aria-describedby={error ? errorId : undefined}
                                className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/30"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor={endDateId} className="block text-sm font-semibold text-gray-700 mb-1">
                                {t('endDate')} <span className="text-red-500">*</span>
                            </label>
                            <input
                                ref={endDateInputRef}
                                id={endDateId}
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate || today}
                                aria-describedby={error ? errorId : undefined}
                                className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/30"
                                required
                            />
                        </div>
                    </div>

                    {/* 報酬UC */}
                    <div>
                        <label htmlFor={rewardUcId} className="block text-sm font-semibold text-gray-700 mb-1">
                            {t('rewardUC')}
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                id={rewardUcId}
                                type="number"
                                value={rewardUc}
                                onChange={(e) => setRewardUc(Number(e.target.value))}
                                min={0}
                                className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/30"
                            />
                            <span className="text-sm font-semibold text-[var(--foreground-muted)] whitespace-nowrap">
                                🪙 UC
                            </span>
                        </div>
                    </div>

                    {/* エラー */}
                    {error && (
                        <div id={errorId} role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {/* ボタン */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={submitting}
                            className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                        >
                            {commonT('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--theme-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-105 hover:opacity-90 active:scale-95 disabled:opacity-50"
                        >
                            {submitting ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    {commonT('loading')}
                                </>
                            ) : t('create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
}
