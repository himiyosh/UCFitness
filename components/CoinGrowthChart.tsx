'use client';

import { useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Bar,
    ComposedChart,
    Cell,
    ReferenceLine,
} from 'recharts';

interface BalanceHistoryEntry {
    date: string;
    dailyCoins: number;
    balance: number;
}

interface CoinGrowthChartProps {
    data: BalanceHistoryEntry[];
}

/** 日付フォーマット（コンポーネント外に定数化） */
function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 数値フォーマット（コンポーネント外に定数化） */
function formatNumber(num: number): string {
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
}

/** Tooltip payload型定義 */
interface TooltipPayloadItem {
    dataKey: string;
    value?: number;
}

interface CustomTooltipProps {
    active?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: readonly any[];
    label?: string | number;
}

export default function CoinGrowthChart({ data }: CoinGrowthChartProps) {
    const t = useTranslations('Bank');

    // チャートデータとドメインの計算をメモ化
    const { chartData, hasNegative, balanceDomain, dailyDomain } = useMemo(() => {
        if (!data || data.length === 0) {
            return { chartData: [], hasNegative: false, balanceDomain: [0, 1000] as [number, number], dailyDomain: [0, 500] as [number, number] };
        }

        const mapped = data.map(d => ({
            ...d,
            dateLabel: formatDate(d.date),
        }));

        const neg = mapped.some(d => d.dailyCoins < 0);

        const maxBalance = Math.max(...mapped.map(d => d.balance));
        const minBalance = Math.min(...mapped.map(d => d.balance));
        const balPadding = Math.ceil((maxBalance - minBalance) * 0.15) || 1000;
        const balDomain: [number, number] = [
            Math.min(0, minBalance - balPadding),
            maxBalance + balPadding,
        ];

        const maxDaily = Math.max(...mapped.map(d => Math.abs(d.dailyCoins)));
        const dailyPad = Math.ceil(maxDaily * 0.2) || 500;
        const dDomain: [number, number] = [
            neg ? -(maxDaily + dailyPad) : 0,
            maxDaily + dailyPad,
        ];

        return { chartData: mapped, hasNegative: neg, balanceDomain: balDomain, dailyDomain: dDomain };
    }, [data]);

    // ツールチップレンダラー（安定参照でRechartsの不要なリマウントを防止）
    const renderTooltip = useCallback(({ active, payload, label }: CustomTooltipProps) => {
        if (active && payload && payload.length) {
            const daily = payload.find((p: TooltipPayloadItem) => p.dataKey === 'dailyCoins');
            const bal = payload.find((p: TooltipPayloadItem) => p.dataKey === 'balance');
            const dailyVal = daily?.value ?? 0;
            const isExpense = dailyVal < 0;
            return (
                <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg p-3 shadow-lg">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    {bal && (
                        <p className="text-sm font-bold text-amber-600">
                            {t('balance')}: {bal.value?.toLocaleString()} UC
                        </p>
                    )}
                    {daily && dailyVal !== 0 && (
                        <p className={`text-xs font-medium ${isExpense ? 'text-red-500' : 'text-green-600'}`}>
                            {isExpense ? '' : '+'}{dailyVal.toLocaleString()} UC
                        </p>
                    )}
                </div>
            );
        }
        return null;
    }, [t]);

    if (!data || data.length === 0) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-base font-bold text-gray-900 mb-4">{t('assetGrowth')}</h3>
                <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
                    <span className="text-4xl">📊</span>
                    <p>{t('noTransactions')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="chart-container bg-white rounded-xl p-3 sm:p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    📈 {t('assetGrowth')}
                </h3>
                <span className="text-xs text-gray-400">{t('last30days')}</span>
            </div>

            <div className="h-72 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
                        <defs>
                            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                            dataKey="dateLabel"
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            tickLine={false}
                            axisLine={{ stroke: '#e5e7eb' }}
                            interval="preserveStartEnd"
                        />
                        {/* 左Y軸: 累積残高スケール（オレンジ線） */}
                        <YAxis
                            yAxisId="balance"
                            domain={balanceDomain}
                            tick={{ fontSize: 10, fill: '#d97706' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatNumber}
                        />
                        {/* 右Y軸: 日次変動スケール（バー） */}
                        <YAxis
                            yAxisId="daily"
                            orientation="right"
                            domain={dailyDomain}
                            tick={{ fontSize: 10, fill: '#6b7280' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatNumber}
                        />
                        <Tooltip content={renderTooltip} />
                        {hasNegative && (
                            <ReferenceLine yAxisId="daily" y={0} stroke="#d1d5db" strokeDasharray="3 3" />
                        )}
                        <Bar
                            dataKey="dailyCoins"
                            yAxisId="daily"
                            opacity={0.8}
                            radius={[2, 2, 0, 0]}
                            barSize={10}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.dailyCoins < 0 ? '#ef4444' : '#86efac'}
                                />
                            ))}
                        </Bar>
                        <Area
                            type="monotone"
                            dataKey="balance"
                            yAxisId="balance"
                            stroke="#f59e0b"
                            strokeWidth={2.5}
                            fill="url(#balanceGradient)"
                            dot={false}
                            activeDot={{ r: 4, stroke: '#f59e0b', strokeWidth: 2, fill: '#fff' }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
