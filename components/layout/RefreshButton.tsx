'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/Toast';

interface StepSyncResponse {
    code?: unknown;
    success?: unknown;
}

function isStepSyncResponse(value: unknown): value is StepSyncResponse {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default function RefreshButton(): React.ReactNode {
    const [loading, setLoading] = useState(false);
    const t = useTranslations('Dashboard');
    const router = useRouter();
    const toast = useToast();

    const handleRefresh = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await fetch('/api/steps/sync', { method: 'POST' });
            const payload: unknown = await res.json();
            if (
                res.ok
                && isStepSyncResponse(payload)
                && payload.success === true
                && payload.code === 'updated'
            ) {
                toast.success(t('refreshSteps') + ' ✓');
            } else if (isStepSyncResponse(payload)) {
                switch (payload.code) {
                    case 'no_data':
                        toast.toast(t('refreshNoData'), 'info');
                        break;
                    case 'reauthorization_required':
                        toast.error(t('refreshReauthorizationRequired'));
                        break;
                    case 'sync_in_progress':
                        toast.toast(t('refreshInProgress'), 'info');
                        break;
                    default:
                        toast.error(t('refreshFailed'));
                }
            } else {
                toast.error(t('refreshFailed'));
            }
            router.refresh();
        } catch {
            toast.error(t('refreshFailed'));
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
            className="refresh-sync-btn inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-full text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] active:bg-[var(--color-primary-soft)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
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
