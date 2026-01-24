import React from 'react';

type BadgeType = 'GLOBAL' | 'GROUP';
type BadgeCategory = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type BadgeRank = 1 | 2 | 3;

interface BadgeIconProps {
    type: string; // 'GLOBAL' | 'GROUP'
    category: string; // 'DAILY' | 'WEEKLY' | 'MONTHLY'
    rank: number; // 1 | 2 | 3
    className?: string;
}

export default function BadgeIcon({ type, category, rank, className = "w-8 h-8" }: BadgeIconProps) {
    const getColors = (rank: number) => {
        switch (rank) {
            case 1: // Gold
                return {
                    bg: 'from-amber-300 to-amber-500',
                    border: 'border-amber-200',
                    text: 'text-amber-900',
                    shadow: 'shadow-amber-500/50'
                };
            case 2: // Silver
                return {
                    bg: 'from-slate-300 to-slate-400',
                    border: 'border-slate-200',
                    text: 'text-slate-800',
                    shadow: 'shadow-slate-400/50'
                };
            case 3: // Bronze
                return {
                    bg: 'from-orange-300 to-orange-400',
                    border: 'border-orange-200',
                    text: 'text-orange-900',
                    shadow: 'shadow-orange-500/50'
                };
            default:
                return {
                    bg: 'from-gray-300 to-gray-400',
                    border: 'border-gray-200',
                    text: 'text-gray-800',
                    shadow: 'shadow-gray-500/50'
                };
        }
    };

    const colors = getColors(rank);

    // Abbreviations
    const catLabel = category === 'DAILY' ? 'D' : category === 'WEEKLY' ? 'W' : 'M';
    const typeLabel = type === 'GLOBAL' ? 'G' : 'L'; // G: Global, L: Local/Group

    return (
        <div className={`relative flex items-center justify-center rounded-full bg-gradient-to-br ${colors.bg} border-2 ${colors.border} shadow-lg ${className}`} title={`${type} ${category} #${rank}`}>
            {/* Gloss Effect */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/30 rounded-t-full pointer-events-none"></div>

            <div className={`flex flex-col items-center justify-center -mt-0.5 ${colors.text} font-bold leading-none`}>
                <span className="text-[60%] opacity-80">{typeLabel}</span>
                <span className="text-[80%]">{rank}</span>
            </div>

            {/* Category Indicator (Small absolute badge) */}
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-gray-100 shadow-sm">
                <div className="w-3 h-3 flex items-center justify-center rounded-full bg-gray-900 text-[6px] font-bold text-white leading-none">
                    {catLabel}
                </div>
            </div>
        </div>
    );
}
