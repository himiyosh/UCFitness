'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoSync() {
    const router = useRouter();

    useEffect(() => {
        const syncSteps = async () => {
            try {
                const res = await fetch('/api/steps/sync', {
                    method: 'POST',
                });

                if (res.ok) {
                    // Refresh the server components to show new data
                    router.refresh();
                }
            } catch (error) {
                console.error('Auto sync failed:', error);
            }
        };

        syncSteps();
    }, [router]);

    return null; // This component renders nothing
}
