'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { useNearViewport } from '@/hooks/useNearViewport';

import type {
    BalanceHistoryEntry,
    CoinGrowthChartProps,
} from '@/components/CoinGrowthChart';

function CoinGrowthChartFallback(): React.ReactNode {
    const t = useTranslations('Bank');

    return (
        <section
            aria-busy="true"
            aria-label={t('assetGrowth')}
            className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:p-6"
        >
            <div className="mb-3 flex items-center justify-between sm:mb-4">
                <h3 className="text-base font-bold text-gray-900">
                    <span aria-hidden="true">📈</span> {t('assetGrowth')}
                </h3>
                <span className="text-xs text-[var(--color-text-muted)]">{t('last30days')}</span>
            </div>
            <div className="h-48 animate-pulse rounded-lg bg-[var(--color-surface-muted)] motion-reduce:animate-none sm:h-52" />
        </section>
    );
}

function CoinGrowthEmptyState(): React.ReactNode {
    const t = useTranslations('Bank');

    return (
        <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-bold text-gray-900">{t('assetGrowth')}</h3>
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
                <span className="text-4xl" aria-hidden="true">📊</span>
                <p>{t('noTransactions')}</p>
            </div>
        </section>
    );
}

interface CoinGrowthTableProps {
    data: BalanceHistoryEntry[];
}

function CoinGrowthTable({ data }: CoinGrowthTableProps): React.ReactNode {
    const t = useTranslations('Bank');
    if (data.length === 0) return null;

    return (
        <div className="sr-only">
            <table>
                <caption>{t('assetGrowth')}</caption>
                <thead>
                    <tr>
                        <th scope="col">{t('date')}</th>
                        <th scope="col">{t('dailyNetChange')}</th>
                        <th scope="col">{t('balance')}</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((entry) => (
                        <tr key={entry.date}>
                            <th scope="row">{entry.date}</th>
                            <td>{entry.dailyCoins.toLocaleString()} UC</td>
                            <td>{entry.balance.toLocaleString()} UC</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const CoinGrowthChart = dynamic(
    () => import('@/components/CoinGrowthChart'),
    {
        ssr: false,
        loading: CoinGrowthChartFallback,
    },
);

export default function DeferredCoinGrowthChart(
    props: CoinGrowthChartProps,
): React.ReactNode {
    const { targetRef, isNearViewport } = useNearViewport();

    if (props.data.length === 0) {
        return <CoinGrowthEmptyState />;
    }

    return (
        <div ref={targetRef}>
            {isNearViewport
                ? <CoinGrowthChart {...props} showAccessibleTable={false} />
                : <CoinGrowthChartFallback />}
            <CoinGrowthTable data={props.data} />
        </div>
    );
}
