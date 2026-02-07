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
        <div
            className={`flex p-1 space-x-1 rounded-lg mb-6 w-fit ${theme !== 'midnight' ? 'bg-white/80 backdrop-blur-sm border border-gray-200' : ''}`}
            style={theme === 'midnight' ? { backgroundColor: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(100, 116, 139, 0.5)' } : undefined}
        >
            {tabs.map((tab) => {
                const isActive = currentPeriod === tab.key;
                return (
                    <Link
                        key={tab.key}
                        href={`/?period=${tab.key}`}
                        scroll={false}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${theme !== 'midnight' ? (isActive ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100') : ''}`}
                        style={theme === 'midnight' ? {
                            backgroundColor: isActive ? 'var(--theme-primary)' : 'transparent',
                            color: '#ffffff',
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                        } : undefined}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
