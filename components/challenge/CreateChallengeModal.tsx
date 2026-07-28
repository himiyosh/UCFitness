'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';

import { useDialogFocus } from '@/hooks/useDialogFocus';
import { buildChallengeCreatePayload } from '@/lib/challenge-create';
import { Link } from '@/navigation';

import type { ManagedChallengeGroupsState } from '@/lib/services/managed-challenge-groups';

// ============================================
// チャレンジ作成モーダル コンポーネント
// ============================================

interface CreateChallengeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
    managedGroups: ManagedChallengeGroupsState;
}

function initialDates(): { startDate: string; endDate: string } {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
}

export default function CreateChallengeModal({
    isOpen,
    onClose,
    onCreated,
    managedGroups,
}: CreateChallengeModalProps) {
    const t = useTranslations('Challenge');
    const baseId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const groupSelectRef = useRef<HTMLSelectElement>(null);
    const submittingRef = useRef(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'INDIVIDUAL' | 'GROUP'>('INDIVIDUAL');
    const [groupId, setGroupId] = useState('');
    const [targetSteps, setTargetSteps] = useState(100000);
    const [rewardUC, setRewardUC] = useState(500);
    const [startDate, setStartDate] = useState(() => initialDates().startDate);
    const [endDate, setEndDate] = useState(() => initialDates().endDate);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [groupError, setGroupError] = useState<string | null>(null);
    const titleId = `${baseId}-title`;
    const descriptionId = `${baseId}-description`;
    const typeId = `${baseId}-type`;
    const groupIdFieldId = `${baseId}-group`;
    const groupErrorId = `${baseId}-group-error`;
    const groupStatusId = `${baseId}-group-status`;
    const targetStepsId = `${baseId}-target-steps`;
    const startDateId = `${baseId}-start-date`;
    const endDateId = `${baseId}-end-date`;
    const rewardUCId = `${baseId}-reward-uc`;
    const errorId = `${baseId}-error`;

    const resetForm = useCallback(() => {
        const dates = initialDates();
        setTitle('');
        setDescription('');
        setType('INDIVIDUAL');
        setGroupId('');
        setTargetSteps(100000);
        setRewardUC(500);
        setStartDate(dates.startDate);
        setEndDate(dates.endDate);
        setError(null);
        setGroupError(null);
    }, []);

    const handleClose = useCallback(() => {
        if (submittingRef.current) return;
        resetForm();
        onClose();
    }, [onClose, resetForm]);

    useDialogFocus({
        isOpen,
        onClose: handleClose,
        dialogRef,
        initialFocusRef: titleInputRef,
        canClose: () => !submitting,
    });

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (submittingRef.current) return;

        if (type === 'GROUP'
            && !managedGroups.groups.some((group) => group.id === groupId)) {
            setGroupError(t('managedGroupRequired'));
            groupSelectRef.current?.focus();
            return;
        }

        // クライアント側バリデーション
        if (!title.trim()) {
            setError(t('titleRequired'));
            return;
        }
        if (targetSteps <= 0) {
            setError(t('targetStepsPositive'));
            return;
        }
        if (startDate && endDate && endDate <= startDate) {
            setError(t('endDateAfterStart'));
            return;
        }

        submittingRef.current = true;
        setSubmitting(true);
        setError(null);
        setGroupError(null);

        try {
            const res = await fetch('/api/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildChallengeCreatePayload({
                    title,
                    description,
                    type,
                    targetSteps,
                    startDate,
                    endDate,
                    rewardUC,
                    groupId,
                })),
            });

            if (!res.ok) {
                throw new Error(t('createFailed'));
            }

            resetForm();
            onCreated?.();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('unknownError'));
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }, [
        description,
        endDate,
        groupId,
        managedGroups.groups,
        onClose,
        onCreated,
        resetForm,
        rewardUC,
        startDate,
        t,
        targetSteps,
        title,
        type,
    ]);

    const groupSelectionDisabled = submitting
        || managedGroups.status === 'unavailable'
        || managedGroups.groups.length === 0;

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
            {/* オーバーレイ */}
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
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
                        onClick={handleClose}
                        disabled={submitting}
                        aria-label={t('closeCreateDialog')}
                        className="min-h-[44px] min-w-[44px] rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
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
                            disabled={submitting}
                            maxLength={100}
                            aria-invalid={Boolean(error && !title.trim())}
                            aria-describedby={error ? errorId : undefined}
                            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-60"
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
                            disabled={submitting}
                            rows={2}
                            className="w-full min-h-[72px] px-3 py-2 rounded-lg border border-gray-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent resize-none disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder={t('descriptionPlaceholder')}
                        />
                    </div>

                    {/* タイプ */}
                    <div>
                        <p id={typeId} className="block text-sm font-semibold text-gray-700 mb-1">{t('type')}</p>
                        <div className="flex flex-col sm:flex-row gap-2" role="group" aria-labelledby={typeId}>
                            <button
                                type="button"
                                onClick={() => {
                                    setType('INDIVIDUAL');
                                    setGroupId('');
                                    setGroupError(null);
                                }}
                                disabled={submitting}
                                aria-pressed={type === 'INDIVIDUAL'}
                                className={`flex-1 min-h-[44px] py-2 px-3 rounded-lg text-sm font-semibold border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                    type === 'INDIVIDUAL'
                                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                👤 {t('individual')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setType('GROUP');
                                    setGroupError(null);
                                }}
                                disabled={submitting}
                                aria-pressed={type === 'GROUP'}
                                className={`flex-1 min-h-[44px] py-2 px-3 rounded-lg text-sm font-semibold border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                    type === 'GROUP'
                                        ? 'bg-purple-50 text-purple-700 border-purple-300'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                👥 {t('group')}
                            </button>
                        </div>
                    </div>

                    {type === 'GROUP' && (
                        <div>
                            <label
                                htmlFor={groupIdFieldId}
                                className="block text-sm font-semibold text-gray-700 mb-1"
                            >
                                {t('managedGroupLabel')}
                            </label>
                            <select
                                ref={groupSelectRef}
                                id={groupIdFieldId}
                                value={groupId}
                                onChange={(event) => {
                                    setGroupId(event.target.value);
                                    setGroupError(null);
                                }}
                                onBlur={() => {
                                    if (!groupId && !groupSelectionDisabled) {
                                        setGroupError(t('managedGroupRequired'));
                                    }
                                }}
                                onInvalid={() => {
                                    setGroupError(t('managedGroupRequired'));
                                }}
                                disabled={groupSelectionDisabled}
                                required
                                aria-invalid={Boolean(groupError)}
                                aria-describedby={groupError ? groupErrorId : groupStatusId}
                                aria-errormessage={groupError ? groupErrorId : undefined}
                                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-base sm:text-sm text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <option value="" disabled>{t('managedGroupPlaceholder')}</option>
                                {managedGroups.groups.map((group) => (
                                    <option key={group.id} value={group.id}>
                                        {group.name}
                                    </option>
                                ))}
                            </select>
                            {groupError ? (
                                <p
                                    id={groupErrorId}
                                    role="alert"
                                    className="mt-1 text-sm text-red-600"
                                >
                                    {groupError}
                                </p>
                            ) : (
                                <div id={groupStatusId} className="mt-2 text-sm">
                                    {managedGroups.status === 'unavailable' ? (
                                        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                                            {t('managedGroupsUnavailable')}
                                        </p>
                                    ) : managedGroups.groups.length === 0 ? (
                                        <p className="rounded-lg bg-gray-50 p-3 text-gray-700">
                                            {t('managedGroupsEmpty')}{' '}
                                            <Link
                                                href="/groups/create"
                                                className="inline-flex min-h-[44px] items-center font-semibold text-[var(--color-primary-strong)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)]"
                                            >
                                                {t('createManagedGroupAction')}
                                            </Link>
                                        </p>
                                    ) : (
                                        <p className="text-gray-500">{t('managedGroupHelp')}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 目標歩数 */}
                    <div>
                        <label htmlFor={targetStepsId} className="block text-sm font-semibold text-gray-700 mb-1">{t('targetSteps')}</label>
                        <input
                            id={targetStepsId}
                            type="number"
                            value={targetSteps}
                            onChange={e => setTargetSteps(Number(e.target.value))}
                            disabled={submitting}
                            min={1000}
                            step={1000}
                            aria-invalid={Boolean(error && targetSteps <= 0)}
                            aria-describedby={error ? errorId : undefined}
                            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-60"
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
                                disabled={submitting}
                                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-60"
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
                                disabled={submitting}
                                aria-invalid={Boolean(
                                    error && startDate && endDate && endDate <= startDate,
                                )}
                                aria-describedby={error ? errorId : undefined}
                                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-60"
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
                            disabled={submitting}
                            min={100}
                            max={10000}
                            step={100}
                            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-60"
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
                        disabled={submitting || (type === 'GROUP' && groupSelectionDisabled)}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-[var(--theme-primary)] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <svg className="w-4 h-4 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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
        </div>,
        document.body,
    );
}
