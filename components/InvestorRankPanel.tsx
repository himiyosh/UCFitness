'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

// coin-service.ts の INVESTOR_RANKS と同期（降順: 最高ランクが先）
const RANKS = [
    { minBalance: 5_000_000, rank: 'TYCOON', icon: '👑', color: 'from-yellow-400 to-amber-500', border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', glow: 'shadow-amber-200' },
    { minBalance: 1_000_000, rank: 'DIAMOND', icon: '💎', color: 'from-cyan-400 to-blue-500', border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-700', glow: 'shadow-blue-200' },
    { minBalance: 500_000, rank: 'FUND_MANAGER', icon: '📊', color: 'from-violet-400 to-purple-500', border: 'border-purple-400', bg: 'bg-purple-50', text: 'text-purple-700', glow: 'shadow-purple-200' },
    { minBalance: 100_000, rank: 'BUSINESS', icon: '💼', color: 'from-emerald-400 to-green-500', border: 'border-green-400', bg: 'bg-green-50', text: 'text-green-700', glow: 'shadow-green-200' },
    { minBalance: 0, rank: 'BEGINNER', icon: '🌱', color: 'from-gray-300 to-gray-400', border: 'border-gray-300', bg: 'bg-gray-50', text: 'text-gray-600', glow: 'shadow-gray-200' },
] as const;

// 降順 → 昇順の静的配列（毎レンダーで再生成しない）
const RANKS_ASCENDING = [...RANKS].reverse();

// rank名 → 降順インデックスの事前マッピング（O(1)ルックアップ用）
const RANK_INDEX_MAP = new Map(RANKS.map((r, i) => [r.rank, i]));

interface InvestorRankPanelProps {
    currentRank: string;
    lifetimeEarnings: number;
}

export default function InvestorRankPanel({ currentRank, lifetimeEarnings }: InvestorRankPanelProps) {
    const t = useTranslations('Bank');

    // 現在のランクのインデックス（RANKS は降順なので index が小さい = ランクが高い）
    // 不正なランク値の場合はBEGINNER（最後のインデックス）にフォールバック
    const currentIndex = RANK_INDEX_MAP.get(currentRank as typeof RANKS[number]['rank']) ?? (RANKS.length - 1);

    // 各ランクの状態を事前計算（.map() 内での繰り返し findIndex を排除）
    const rankStates = useMemo(() => {
        return RANKS_ASCENDING.map((rank) => {
            const rankIndex = RANK_INDEX_MAP.get(rank.rank) ?? -1;
            const isCurrentRank = rank.rank === currentRank;
            const isAchieved = rankIndex >= currentIndex;
            const isNext = !isAchieved && rankIndex === currentIndex - 1;

            // 次のランクまでのプログレス計算
            let progressPercent = 0;
            if (isNext) {
                const prevRankMin = RANKS[currentIndex]?.minBalance ?? 0;
                const denominator = rank.minBalance - prevRankMin;
                // ゼロ除算ガード: 分母が0以下の場合はプログレスを0%にする
                progressPercent = denominator > 0
                    ? Math.min(100, Math.max(0,
                        ((lifetimeEarnings - prevRankMin) / denominator) * 100
                    ))
                    : 0;
            }

            return { rank, isCurrentRank, isAchieved, isNext, progressPercent };
        });
    }, [currentRank, currentIndex, lifetimeEarnings]);

    return (
        <div
            className="investor-rank-panel rounded-xl p-4 shadow-sm border h-full hover:shadow-lg transition-shadow"
            style={{
                backgroundColor: 'var(--theme-secondary)',
                borderColor: 'var(--foreground-muted, rgba(0,0,0,0.1))',
            }}
        >
            <h3
                className="text-base font-bold mb-4 flex items-center gap-2"
                style={{ color: 'var(--theme-primary)' }}
            >
                🏅 {t('investorRank')}
            </h3>

            <div className="relative" role="list" aria-label={t('investorRank')}>
                {/* 縦のコネクティングライン */}
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-200 z-0" />

                <div className="space-y-2 relative z-10">
                    {rankStates.map(({ rank, isCurrentRank, isAchieved, isNext, progressPercent }) => (
                        <div
                            key={rank.rank}
                            role="listitem"
                            aria-current={isCurrentRank ? 'true' : undefined}
                            aria-label={`${t(`ranks.${rank.rank}`)}${isCurrentRank ? ` — ${t('currentLabel')}` : ''}`}
                            className={`
                                relative flex items-center gap-2 p-2 rounded-lg transition-all duration-300
                                hover:scale-[1.02] hover:shadow-md cursor-default
                                ${isCurrentRank
                                    ? `${rank.bg} border-2 ${rank.border} shadow-md ${rank.glow}`
                                    : isAchieved
                                        ? `${rank.bg} border border-gray-200 opacity-90 hover:opacity-100`
                                        : 'bg-gray-50/50 border border-dashed border-gray-200 opacity-60 hover:opacity-75'
                                }
                            `}
                        >
                            {/* ランクアイコン */}
                            <div
                                className={`
                                    flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg
                                    ${isAchieved || isCurrentRank
                                        ? `bg-gradient-to-br ${rank.color} shadow-sm`
                                        : 'bg-gray-200'
                                    }
                                `}
                                aria-hidden="true"
                            >
                                {isAchieved || isCurrentRank ? rank.icon : '🔒'}
                            </div>

                            {/* ランク情報 */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                    <span className={`text-sm font-bold leading-tight ${isCurrentRank ? rank.text : isAchieved ? 'text-gray-700' : 'text-gray-400'}`}>
                                        {t(`ranks.${rank.rank}`)}
                                    </span>
                                    {isCurrentRank && (
                                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${rank.text} ${rank.bg} border ${rank.border}`}>
                                            {t('currentLabel')}
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs leading-tight" style={{ color: 'var(--foreground-muted)' }}>
                                    {rank.minBalance === 0
                                        ? '0 UC'
                                        : `${(rank.minBalance / 1000).toLocaleString()}K UC`
                                    }
                                </span>

                                {/* 次のランクへのプログレスバー */}
                                {isNext && (
                                    <div className="mt-1">
                                        <div
                                            className="w-full h-1 bg-gray-200 rounded-full overflow-hidden"
                                            role="progressbar"
                                            aria-valuenow={Math.round(progressPercent)}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-label={`${t(`ranks.${rank.rank}`)} ${Math.round(progressPercent)}%`}
                                        >
                                            <div
                                                className={`h-full rounded-full bg-gradient-to-r ${rank.color} transition-all duration-1000 ease-out`}
                                                style={{ width: `${progressPercent}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
                                            {Math.round(progressPercent)}%
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
