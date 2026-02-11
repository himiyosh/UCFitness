'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export default function RefreshButton() {
    const [loading, setLoading] = useState(false);
    const t = useTranslations('Dashboard');
    const router = useRouter();

    const handleRefresh = async () => {
        setLoading(true);
        try {
            await fetch('/api/steps/sync', { method: 'POST' });
            router.refresh();
        } catch (error) {
            console.error('Failed to refresh steps', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleRefresh}
            disabled={loading}
            className={`midnight-vivid-btn cursor-pointer rounded-lg bg-[var(--theme-primary)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 transition-all`}
        >
            {loading ? t('refreshing') : t('refreshSteps')}
        </button>
    );
}
