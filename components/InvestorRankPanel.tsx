'use client';

import { useTranslations } from 'next-intl';

// coin-service.ts の INVESTOR_RANKS と同期（降順: 最高ランクが先）
const RANKS = [
    { minBalance: 5_000_000, rank: 'TYCOON', icon: '👑', color: 'from-yellow-400 to-amber-500', border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', glow: 'shadow-amber-200' },
    { minBalance: 1_000_000, rank: 'DIAMOND', icon: '💎', color: 'from-cyan-400 to-blue-500', border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-700', glow: 'shadow-blue-200' },
    { minBalance: 500_000, rank: 'FUND_MANAGER', icon: '📊', color: 'from-violet-400 to-purple-500', border: 'border-purple-400', bg: 'bg-purple-50', text: 'text-purple-700', glow: 'shadow-purple-200' },
    { minBalance: 100_000, rank: 'BUSINESS', icon: '💼', color: 'from-emerald-400 to-green-500', border: 'border-green-400', bg: 'bg-green-50', text: 'text-green-700', glow: 'shadow-green-200' },
    { minBalance: 0, rank: 'BEGINNER', icon: '🌱', color: 'from-gray-300 to-gray-400', border: 'border-gray-300', bg: 'bg-gray-50', text: 'text-gray-600', glow: 'shadow-gray-200' },
];

interface InvestorRankPanelProps {
    currentRank: string;
    totalBalance: number;
}

export default function InvestorRankPanel({ currentRank, totalBalance }: InvestorRankPanelProps) {
    const t = useTranslations('Bank');

    // 現在のランクのインデックス（RANKS は降順なので index が小さい = ランクが高い）
    const currentIndex = RANKS.findIndex(r => r.rank === currentRank);

    // 表示は下から上（昇順）にしたいので reverse
    const ranksAscending = [...RANKS].reverse();

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 h-full">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                🏅 {t('investorRank')}
            </h3>

            <div className="relative">
                {/* 縦のコネクティングライン */}
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-200 z-0" />

                <div className="space-y-2 relative z-10">
                    {ranksAscending.map((rank, i) => {
                        const isCurrentRank = rank.rank === currentRank;
                        const isAchieved = RANKS.findIndex(r => r.rank === rank.rank) >= currentIndex;
                        const isNext = !isAchieved && RANKS.findIndex(r => r.rank === rank.rank) === currentIndex - 1;

                        // 次のランクまでのプログレス計算
                        let progressPercent = 0;
                        if (isNext) {
                            const prevRankMin = RANKS[currentIndex]?.minBalance || 0;
                            progressPercent = Math.min(100, Math.max(0,
                                ((totalBalance - prevRankMin) / (rank.minBalance - prevRankMin)) * 100
                            ));
                        }

                        return (
                            <div
                                key={rank.rank}
                                className={`
                                    relative flex items-center gap-2 p-2 rounded-lg transition-all duration-300
                                    ${isCurrentRank
                                        ? `${rank.bg} border-2 ${rank.border} shadow-md ${rank.glow}`
                                        : isAchieved
                                            ? `${rank.bg} border border-gray-200 opacity-90`
                                            : 'bg-gray-50/50 border border-dashed border-gray-200 opacity-60'
                                    }
                                `}
                            >
                                {/* ランクアイコン */}
                                <div className={`
                                    flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg
                                    ${isAchieved || isCurrentRank
                                        ? `bg-gradient-to-br ${rank.color} shadow-sm`
                                        : 'bg-gray-200'
                                    }
                                `}>
                                    {isAchieved || isCurrentRank ? rank.icon : '🔒'}
                                </div>

                                {/* ランク情報 */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1 flex-wrap">
                                        <span className={`text-xs font-bold leading-tight ${isCurrentRank ? rank.text : isAchieved ? 'text-gray-700' : 'text-gray-400'}`}>
                                            {t(`ranks.${rank.rank}`)}
                                        </span>
                                        {isCurrentRank && (
                                            <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${rank.text} ${rank.bg} border ${rank.border}`}>
                                                {t('currentLabel')}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-gray-400 leading-tight">
                                        {rank.minBalance === 0
                                            ? '0 UC'
                                            : `${(rank.minBalance / 1000).toLocaleString()}K UC`
                                        }
                                    </span>

                                    {/* 次のランクへのプログレスバー */}
                                    {isNext && (
                                        <div className="mt-1">
                                            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full bg-gradient-to-r ${rank.color} transition-all duration-1000 ease-out`}
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>
                                            <span className="text-[9px] text-gray-400">{Math.round(progressPercent)}%</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
