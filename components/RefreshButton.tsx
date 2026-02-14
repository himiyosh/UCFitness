'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useToast } from './Toast';

export default function RefreshButton() {
    const [loading, setLoading] = useState(false);
    const t = useTranslations('Dashboard');
    const router = useRouter();
    const toast = useToast();

    const handleRefresh = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await fetch('/api/steps/sync', { method: 'POST' });
            if (!res.ok) {
                toast.error(t('refreshFailed') ?? 'Failed to refresh steps');
            }
            router.refresh();
        } catch (error: unknown) {
            void error;
            toast.error(t('refreshFailed') ?? 'Failed to refresh steps');
        } finally {
            setLoading(false);
        }
    }, [loading, router, toast, t]);

    return (
        <button
            onClick={handleRefresh}
            disabled={loading}
            aria-label={loading ? t('refreshing') : t('refreshSteps')}
            className="midnight-vivid-btn cursor-pointer inline-flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-[var(--theme-primary)] px-3 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-base font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50 transition-all"
        >
            {loading && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
            )}
            {loading ? t('refreshing') : t('refreshSteps')}
        </button>
    );
}
