'use client';

import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

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

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        // クライアント側バリデーション
        if (!title.trim()) {
            setError('Title is required');
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
                throw new Error(data.error || 'Failed to create challenge');
            }

            // リセット & 閉じる
            setTitle('');
            setDescription('');
            setTargetSteps(100000);
            setRewardUC(500);
            onCreated?.();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setSubmitting(false);
        }
    }, [title, description, type, targetSteps, rewardUC, startDate, endDate, submitting, onCreated, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* オーバーレイ */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* モーダル */}
            <div className="relative w-full max-w-lg bg-white midnight-solid-panel rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* ヘッダー */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        🎯 {t('create')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
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
                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('titleLabel')}</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            maxLength={100}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                            placeholder={t('titlePlaceholder')}
                            required
                        />
                    </div>

                    {/* 説明 */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('description')}</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent resize-none"
                            placeholder={t('descriptionPlaceholder')}
                        />
                    </div>

                    {/* タイプ */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('type')}</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setType('INDIVIDUAL')}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
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
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
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
                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('targetSteps')}</label>
                        <input
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
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('startDate')}</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('endDate')}</label>
                            <input
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
                        <label className="block text-sm font-semibold text-gray-700 mb-1">{t('rewardUC')}</label>
                        <input
                            type="number"
                            value={rewardUC}
                            onChange={e => setRewardUC(Number(e.target.value))}
                            min={100}
                            max={10000}
                            step={100}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent"
                            required
                        />
                    </div>

                    {/* エラー */}
                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
                            {error}
                        </div>
                    )}

                    {/* 送信ボタン */}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-[var(--theme-primary)] hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
