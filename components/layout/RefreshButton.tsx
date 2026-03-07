'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

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
            } else {
                toast.success(t('refreshSteps') + ' ✓');
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
            title={loading ? t('refreshing') : t('refreshSteps')}
            className="refresh-sync-btn cursor-pointer inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] disabled:opacity-50 transition-all active:scale-90"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className={`w-5 h-5 sm:w-6 sm:h-6 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
        </button>
    );
}
