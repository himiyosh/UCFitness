'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';

import { useDialogFocus } from '@/hooks/useDialogFocus';

// ============================================
// WalkingRoutes — ウォーキングコース記録コンポーネント
// プロフィールページに配置し、お気に入りコースを管理
// ============================================

type Difficulty = 'easy' | 'normal' | 'hard';

interface WalkingRoute {
    id: string;
    name: string;
    description: string;
    distance_km: number | null;
    duration_minutes: number | null;
    difficulty: Difficulty;
    is_favorite: boolean;
    walk_count: number;
    last_walked_at: string | null;
    created_at: string;
}

/** 難易度の表示情報 */
const DIFFICULTY_MAP: Record<Difficulty, { emoji: string; colorClass: string }> = {
    easy: { emoji: '🟢', colorClass: 'text-green-600 bg-green-50' },
    normal: { emoji: '🟡', colorClass: 'text-amber-600 bg-amber-50' },
    hard: { emoji: '🔴', colorClass: 'text-red-600 bg-red-50' },
};

export default function WalkingRoutes() {
    const t = useTranslations('WalkingRoutes');

    const [routes, setRoutes] = useState<WalkingRoute[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const deleteDialogRef = useRef<HTMLDivElement>(null);
    const deleteCancelRef = useRef<HTMLButtonElement>(null);
    const closeDeleteDialog = useCallback(() => setDeleteConfirmId(null), []);

    useDialogFocus({
        isOpen: Boolean(deleteConfirmId),
        onClose: closeDeleteDialog,
        dialogRef: deleteDialogRef,
        initialFocusRef: deleteCancelRef,
    });

    // フォーム入力
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formDistance, setFormDistance] = useState('');
    const [formDuration, setFormDuration] = useState('');
    const [formDifficulty, setFormDifficulty] = useState<Difficulty>('normal');

    // 統計情報の計算
    const stats = useMemo(() => {
        const totalWalks = routes.reduce((sum, r) => sum + r.walk_count, 0);
        const totalDistance = routes.reduce((sum, r) => sum + (r.distance_km || 0) * r.walk_count, 0);
        const favoriteCount = routes.filter((r) => r.is_favorite).length;
        return { totalWalks, totalDistance: Math.round(totalDistance * 10) / 10, favoriteCount };
    }, [routes]);

    const fetchRoutes = useCallback(async () => {
        setError(false);
        try {
            const res = await fetch('/api/user/walking-routes');
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            setRoutes(data.routes || []);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoutes();
    }, [fetchRoutes]);

    // コース作成
    const handleCreate = useCallback(async () => {
        const name = formName.trim();
        if (!name || isSaving) return;

        setIsSaving(true);
        try {
            const res = await fetch('/api/user/walking-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    description: formDescription.trim(),
                    distance_km: formDistance ? parseFloat(formDistance) : null,
                    duration_minutes: formDuration ? parseInt(formDuration, 10) : null,
                    difficulty: formDifficulty,
                }),
            });

            if (!res.ok) throw new Error('create failed');
            const data = await res.json();

            setRoutes((prev) => [data.route, ...prev]);
            setShowForm(false);
            setFormName('');
            setFormDescription('');
            setFormDistance('');
            setFormDuration('');
            setFormDifficulty('normal');
        } catch {
            setActionError(t('createError'));
        } finally {
            setIsSaving(false);
        }
    }, [formName, formDescription, formDistance, formDuration, formDifficulty, isSaving, t]);

    // お気に入り切替
    const handleToggleFavorite = useCallback(async (routeId: string, currentValue: boolean) => {
        setActionLoadingId(routeId);
        try {
            const res = await fetch(`/api/user/walking-routes/${routeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_favorite: !currentValue }),
            });
            if (!res.ok) throw new Error('update failed');
            const data = await res.json();
            setRoutes((prev) => prev.map((r) => (r.id === routeId ? data.route : r)));
        } catch {
            setActionError(t('updateError'));
        } finally {
            setActionLoadingId(null);
        }
    }, [t]);

    // 歩いた記録
    const handleLogWalk = useCallback(async (routeId: string) => {
        setActionLoadingId(routeId);
        try {
            const res = await fetch(`/api/user/walking-routes/${routeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ log_walk: true }),
            });
            if (!res.ok) throw new Error('log walk failed');
            const data = await res.json();
            setRoutes((prev) => prev.map((r) => (r.id === routeId ? data.route : r)));
        } catch {
            setActionError(t('updateError'));
        } finally {
            setActionLoadingId(null);
        }
    }, [t]);

    // 削除
    const handleDelete = useCallback(async (routeId: string) => {
        setDeleteConfirmId(null);
        setActionLoadingId(routeId);
        try {
            const res = await fetch(`/api/user/walking-routes/${routeId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('delete failed');
            setRoutes((prev) => prev.filter((r) => r.id !== routeId));
        } catch {
            setActionError(t('deleteError'));
        } finally {
            setActionLoadingId(null);
        }
    }, [t]);

    // ローディング
    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-40 mb-3" />
                <div className="space-y-2">
                    <div className="h-16 bg-gray-200 rounded-xl" />
                    <div className="h-16 bg-gray-200 rounded-xl" />
                </div>
            </div>
        );
    }

    // エラー
    if (error) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-4 text-center">
                <p className="text-sm text-red-500">{t('loadError')}</p>
                <button
                    onClick={fetchRoutes}
                    className="mt-2 px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:scale-105 active:scale-95 transition-transform"
                >
                    🔄 {t('retry')}
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 p-4 hover:shadow-lg transition-shadow">
            {/* アクションエラートースト */}
            {actionError && (
                <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-2">
                    <p className="text-xs text-red-600 font-medium">{actionError}</p>
                    <button
                        onClick={() => setActionError(null)}
                        className="text-red-400 hover:text-red-600 text-xs font-bold shrink-0"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
            )}
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    🗺️ {t('title')}
                    {routes.length > 0 && (
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                            {routes.length}
                        </span>
                    )}
                </h3>
                <button
                    onClick={() => setShowForm((prev) => !prev)}
                    className="text-xs font-semibold text-[var(--theme-primary)] hover:underline min-h-[44px] px-2 flex items-center gap-1"
                    aria-label={t('addRoute')}
                >
                    ➕ {t('addRoute')}
                </button>
            </div>

            {/* 統計 */}
            {routes.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-400">{t('totalWalks')}</p>
                        <p className="text-sm font-bold text-gray-700">{stats.totalWalks}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-400">{t('totalDistance')}</p>
                        <p className="text-sm font-bold text-gray-700">{stats.totalDistance} km</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-400">{t('favorites')}</p>
                        <p className="text-sm font-bold text-gray-700">⭐ {stats.favoriteCount}</p>
                    </div>
                </div>
            )}

            {/* 新規作成フォーム */}
            {showForm && (
                <div className="mb-3 p-3 bg-[var(--theme-primary-light)]/30 rounded-xl border border-[var(--theme-primary)]/10 space-y-2">
                    <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value.slice(0, 100))}
                        placeholder={t('namePlaceholder')}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/30 min-h-[44px]"
                        maxLength={100}
                        aria-label={t('namePlaceholder')}
                    />
                    <input
                        type="text"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value.slice(0, 500))}
                        placeholder={t('descriptionPlaceholder')}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/30 min-h-[44px]"
                        maxLength={500}
                        aria-label={t('descriptionPlaceholder')}
                    />
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <input
                                type="number"
                                value={formDistance}
                                onChange={(e) => setFormDistance(e.target.value)}
                                placeholder={t('distancePlaceholder')}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/30 min-h-[44px]"
                                min="0"
                                step="0.1"
                                aria-label={t('distancePlaceholder')}
                            />
                        </div>
                        <div className="flex-1">
                            <input
                                type="number"
                                value={formDuration}
                                onChange={(e) => setFormDuration(e.target.value)}
                                placeholder={t('durationPlaceholder')}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/30 min-h-[44px]"
                                min="0"
                                aria-label={t('durationPlaceholder')}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500" htmlFor="route-difficulty">{t('difficulty')}:</label>
                        <select
                            id="route-difficulty"
                            value={formDifficulty}
                            onChange={(e) => setFormDifficulty(e.target.value as Difficulty)}
                            className="min-h-[44px] rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/30"
                        >
                            <option value="easy">{t('difficultyEasy')}</option>
                            <option value="normal">{t('difficultyNormal')}</option>
                            <option value="hard">{t('difficultyHard')}</option>
                        </select>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={handleCreate}
                            disabled={!formName.trim() || isSaving}
                            className="flex-1 px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg bg-[var(--theme-primary)] text-white disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center gap-2"
                        >
                            {isSaving ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                t('save')
                            )}
                        </button>
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            )}

            {/* コース一覧 */}
            {routes.length === 0 && !showForm ? (
                <div className="text-center py-6">
                    <p className="text-2xl mb-1">🗺️</p>
                    <p className="text-xs text-gray-400">{t('empty')}</p>
                    <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {routes.map((route) => {
                        const diff = DIFFICULTY_MAP[route.difficulty];
                        const isActioning = actionLoadingId === route.id;

                        return (
                            <div
                                key={route.id}
                                className="border border-gray-100 rounded-xl p-3 hover:bg-gray-50/50 hover:shadow-sm transition-all"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            {route.is_favorite && <span className="text-xs">⭐</span>}
                                            <h4 className="text-sm font-semibold text-gray-800 truncate">
                                                {route.name}
                                            </h4>
                                            <span className={`rounded-full px-1.5 py-0.5 text-xs ${diff.colorClass}`}>
                                                {diff.emoji} {t(`difficulty${route.difficulty.charAt(0).toUpperCase() + route.difficulty.slice(1)}` as 'difficultyEasy' | 'difficultyNormal' | 'difficultyHard')}
                                            </span>
                                        </div>

                                        {route.description && (
                                            <p className="line-clamp-1 text-xs text-gray-500">{route.description}</p>
                                        )}

                                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                                            {route.distance_km !== null && (
                                                <span>📏 {route.distance_km} km</span>
                                            )}
                                            {route.duration_minutes !== null && (
                                                <span>⏱️ {route.duration_minutes} {t('minutes')}</span>
                                            )}
                                            <span>🚶 {route.walk_count} {t('times')}</span>
                                        </div>
                                    </div>

                                    {/* アクションボタン */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => handleLogWalk(route.id)}
                                            disabled={isActioning}
                                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xs text-green-700 transition-colors hover:bg-green-50"
                                            aria-label={t('logWalk')}
                                            title={t('logWalk')}
                                        >
                                            {isActioning ? (
                                                <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                '👟'
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleToggleFavorite(route.id, route.is_favorite)}
                                            disabled={isActioning}
                                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xs transition-colors hover:bg-amber-50"
                                            aria-label={route.is_favorite ? t('unfavorite') : t('favorite')}
                                            title={route.is_favorite ? t('unfavorite') : t('favorite')}
                                        >
                                            {route.is_favorite ? '⭐' : '☆'}
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirmId(route.id)}
                                            disabled={isActioning}
                                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xs text-red-700 transition-colors hover:bg-red-50"
                                            aria-label={t('delete')}
                                            title={t('delete')}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 削除確認ダイアログ */}
            {deleteConfirmId &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    >
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDeleteDialog} aria-hidden="true" />
                        <div
                            ref={deleteDialogRef}
                            className="relative w-full max-w-sm rounded-xl bg-white p-4 shadow-xl sm:p-6"
                            role="alertdialog"
                            aria-modal="true"
                            aria-label={t('deleteConfirm')}
                            tabIndex={-1}
                        >
                            <h4 className="text-base font-bold text-gray-900 mb-2">{t('deleteConfirm')}</h4>
                            <p className="text-sm text-gray-500 mb-4">{t('deleteConfirmDesc')}</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleDelete(deleteConfirmId)}
                                    className="flex-1 px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                                >
                                    {t('delete')}
                                </button>
                                <button
                                    ref={deleteCancelRef}
                                    onClick={closeDeleteDialog}
                                    className="flex-1 px-4 py-2 min-h-[44px] text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    {t('cancel')}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
