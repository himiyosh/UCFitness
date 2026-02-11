'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';

export type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export default function LeaderboardTabs() {
    const searchParams = useSearchParams();
    const currentPeriod = (searchParams.get('period') as Period) || 'DAILY';
    const { theme } = useTheme();

    const tabs: { key: Period; label: string }[] = [
        { key: 'DAILY', label: 'Today' },
        { key: 'WEEKLY', label: 'This Week' },
        { key: 'MONTHLY', label: 'This Month' },
        { key: 'YEARLY', label: 'This Year' },
    ];

    return (
        <nav aria-label="Ranking period">
        <div
            className={`flex p-1 rounded-lg mb-6 w-fit gap-2 ${theme !== 'midnight' ? 'bg-white border border-gray-200' : ''}`}
            role="tablist"
        >
            {tabs.map((tab) => {
                const isActive = currentPeriod === tab.key;
                return (
                    <Link
                        key={tab.key}
                        href={`/?period=${tab.key}`}
                        scroll={false}
                        role="tab"
                        aria-selected={isActive}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${theme !== 'midnight' ? (isActive ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'text-gray-600 border border-gray-200 hover:bg-gray-50') : ''}`}
                        style={theme === 'midnight' ? (isActive ? {
                            background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
                            color: '#ffffff',
                            boxShadow: '0 4px 20px -3px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
                            border: '1px solid rgba(165,180,252,0.3)',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                        } : {
                            background: 'rgba(30, 41, 59, 0.7)',
                            color: '#94a3b8',
                            border: '1px solid rgba(148,163,184,0.2)',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                        }) : undefined}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
        </nav>
    );
}
