'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function RefreshButton() {
    const [loading, setLoading] = useState(false);
    const t = useTranslations('Dashboard');

    const handleRefresh = async () => {
        setLoading(true);
        try {
            await fetch('/api/steps/sync', { method: 'POST' });
            window.location.reload();
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
            className={`midnight-vivid-btn cursor-pointer rounded-md bg-[var(--theme-primary)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-80 disabled:opacity-50`}
        >
            {loading ? t('refreshing') : t('refreshSteps')}
        </button>
    );
}
