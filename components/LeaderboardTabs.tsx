'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export default function LeaderboardTabs() {
    const searchParams = useSearchParams();
    const currentPeriod = (searchParams.get('period') as Period) || 'DAILY';

    const tabs: { key: Period; label: string }[] = [
        { key: 'DAILY', label: 'Today' },
        { key: 'WEEKLY', label: 'This Week' },
        { key: 'MONTHLY', label: 'This Month' },
        { key: 'YEARLY', label: 'This Year' },
    ];

    return (
        <div className="flex p-1 space-x-1 bg-gray-100/80 rounded-lg mb-6 w-fit">
            {tabs.map((tab) => {
                const isActive = currentPeriod === tab.key;
                return (
                    <Link
                        key={tab.key}
                        href={`/?period=${tab.key}`}
                        scroll={false} // Prevent scroll jump
                        className={`
                            px-4 py-2 text-sm font-medium rounded-md transition-all
                            ${isActive
                                ? 'bg-white text-[var(--theme-primary)] shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}
                        `}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
