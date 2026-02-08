'use client';

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
} from 'recharts';

interface BalanceHistoryEntry {
    date: string;
    dailyCoins: number;
    balance: number;
}

interface CoinGrowthChartProps {
    data: BalanceHistoryEntry[];
}

export default function CoinGrowthChart({ data }: CoinGrowthChartProps) {
    const t = useTranslations('Bank');

    if (!data || data.length === 0) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-4">{t('assetGrowth')}</h3>
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                    {t('noTransactions')}
                </div>
            </div>
        );
    }

    // 日付フォーマット
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr + 'T00:00:00');
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    // 数値フォーマット
    const formatNumber = (num: number) => {
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
        return num.toString();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg p-3 shadow-lg">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="text-sm font-bold text-amber-600">
                        {t('balance')}: {payload[0]?.value?.toLocaleString()} UC
                    </p>
                    {payload[1] && (
                        <p className="text-xs text-green-600 font-medium">
                            +{payload[1]?.value?.toLocaleString()} UC
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    const chartData = data.map(d => ({
        ...d,
        dateLabel: formatDate(d.date),
    }));

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    📈 {t('assetGrowth')}
                </h3>
                <span className="text-xs text-gray-400">{t('last30days')}</span>
            </div>

            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
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
                        {/* 左軸: 累積残高 */}
                        <YAxis
                            yAxisId="balance"
                            orientation="left"
                            tick={{ fontSize: 10, fill: '#d97706' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatNumber}
                        />
                        {/* 右軸: 日次獲得コイン */}
                        <YAxis
                            yAxisId="daily"
                            orientation="right"
                            tick={{ fontSize: 10, fill: '#22c55e' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatNumber}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar
                            yAxisId="daily"
                            dataKey="dailyCoins"
                            fill="#86efac"
                            opacity={0.7}
                            radius={[2, 2, 0, 0]}
                            barSize={10}
                        />
                        <Area
                            yAxisId="balance"
                            type="monotone"
                            dataKey="balance"
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
