'use client';

import { useRef, useState, type FormEvent } from 'react';
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

    useDialogFocus({
        isOpen: true,
        onClose,
        dialogRef,
        initialFocusRef: titleInputRef,
        canClose: () => !submitting,
    });

    // 今日の日付（YYYY-MM-DD）
    const today = new Date().toISOString().split('T')[0];

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        // クライアントバリデーション
        if (!title.trim()) {
            setError(t('titleRequired'));
            return;
        }
        if (targetSteps <= 0) {
            setError(t('targetRequired'));
            return;
        }
        if (!startDate || !endDate) {
            setError(t('dateRequired'));
            return;
        }
        if (new Date(endDate) < new Date(startDate)) {
            setError(t('dateInvalid'));
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/group/${groupId}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                const data = await res.json();
                setError(data.error || 'Failed to create event');
                return;
            }

            onCreated();
        } catch {
            setError('Failed to create event');
        } finally {
            setSubmitting(false);
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* オーバーレイ */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* モーダル */}
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-group-event-dialog-title" tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl outline-none midnight-solid-panel">
                {/* ヘッダー */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 id="create-group-event-dialog-title" className="text-lg font-bold text-gray-900">
                        🏆 {t('createEvent')}
                    </h2>
                    <button
                        onClick={onClose}
                        type="button"
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-xl leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label={commonT('close')}
                    >
                        ✕
                    </button>
                </div>

                {/* フォーム */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* タイトル */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            {t('eventTitle')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            ref={titleInputRef}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={100}
                            placeholder={t('titlePlaceholder')}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[var(--theme-primary)]/30 focus:border-[var(--theme-primary)] outline-none transition-colors"
                        />
                    </div>

                    {/* 説明 */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            {t('description')}
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder={t('descriptionPlaceholder')}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[var(--theme-primary)]/30 focus:border-[var(--theme-primary)] outline-none transition-colors resize-none"
                        />
                    </div>

                    {/* 目標歩数 */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            {t('targetSteps')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            value={targetSteps}
                            onChange={(e) => setTargetSteps(Number(e.target.value))}
                            min={1}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[var(--theme-primary)]/30 focus:border-[var(--theme-primary)] outline-none transition-colors"
                        />
                    </div>

                    {/* 日付範囲 */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                {t('startDate')} <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                min={today}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[var(--theme-primary)]/30 focus:border-[var(--theme-primary)] outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                {t('endDate')} <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate || today}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[var(--theme-primary)]/30 focus:border-[var(--theme-primary)] outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* 報酬UC */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            {t('rewardUC')}
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={rewardUc}
                                onChange={(e) => setRewardUc(Number(e.target.value))}
                                min={0}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[var(--theme-primary)]/30 focus:border-[var(--theme-primary)] outline-none transition-colors"
                            />
                            <span className="text-sm font-semibold text-[var(--foreground-muted)] whitespace-nowrap">
                                🪙 UC
                            </span>
                        </div>
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
                            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            {commonT('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:opacity-90 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
