'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

// ストリークシールド残数表示コンポーネント
export default function StreakShieldIndicator() {
    const t = useTranslations('Shield');
    const [remaining, setRemaining] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchShields = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/user/shields');
            if (res.ok) {
                const data = await res.json();
                setRemaining(data.remaining ?? 0);
            } else {
                setRemaining(0);
            }
        } catch {
            setRemaining(0);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchShields();
    }, [fetchShields]);

    if (loading) {
        return (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-secondary)' }}>
                <span>🛡️</span>
                <span>…</span>
            </div>
        );
    }

    if (remaining === null || remaining <= 0) {
        return (
            <Link href="/shop" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-secondary)' }}
                title={t('buyMore')}>
                <span className="opacity-50">🛡️</span>
                <span>×0</span>
            </Link>
        );
    }

    return (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ backgroundColor: 'var(--theme-primary-light, rgba(59,130,246,0.1))', color: 'var(--theme-primary)' }}
            title={t('remaining', { count: remaining })}>
            <span>🛡️</span>
            <span>×{remaining}</span>
        </div>
    );
}
