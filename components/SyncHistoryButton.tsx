'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './Toast';
import { useTranslations } from 'next-intl';

export default function SyncHistoryButton() {
    const [isSyncing, setIsSyncing] = useState(false);
    const router = useRouter();
    const toast = useToast();
    const t = useTranslations('Profile');

    const handleSync = useCallback(async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const res = await fetch('/api/user/sync-history', { method: 'POST' });
            if (!res.ok) throw new Error('Sync failed');
            router.refresh();
            toast.success('History synced successfully!');
        } catch (error: unknown) {
            void error;
            toast.error('Failed to sync history. Please try signing in again.');
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, router, toast]);

    return (
        <button
            onClick={handleSync}
            disabled={isSyncing}
            aria-label={isSyncing ? t('syncing') : t('syncHistory')}
            className="cursor-pointer inline-flex items-center gap-1.5 sm:gap-2 rounded-md bg-white px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:scale-105 active:scale-95 disabled:opacity-50 whitespace-nowrap flex-shrink-0 transition-all"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {isSyncing ? t('syncing') : t('syncHistory')}
        </button>
    );
}
