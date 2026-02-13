'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* オーバーレイ */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* モーダル */}
            <div className="relative bg-white midnight-solid-panel rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
                {/* ヘッダー */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">
                        🏆 {t('createEvent')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
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
                    <div className="grid grid-cols-2 gap-3">
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
                            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {submitting ? commonT('loading') : t('create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
