'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SyncHistoryButton() {
    const [isSyncing, setIsSyncing] = useState(false);
    const router = useRouter();

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/user/sync-history', { method: 'POST' });
            if (!res.ok) throw new Error('Sync failed');
            router.refresh();
            alert('History synced successfully!'); // Simple feedback for now
        } catch (error) {
            console.error(error);
            alert('Failed to sync history. Please try signing in again.');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {isSyncing ? 'Syncing...' : 'Sync History'}
        </button>
    );
}
