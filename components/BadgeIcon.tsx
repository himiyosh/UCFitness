import React from 'react';

type BadgeType = 'GLOBAL' | 'GROUP';
type BadgeCategory = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type BadgeRank = 1 | 2 | 3;

interface BadgeIconProps {
    type: string;
    category: string;
    rank: number;
    className?: string;
}

export default function BadgeIcon({ type, category, rank, className = "w-10 h-10" }: BadgeIconProps) {
    const getStyles = (rank: number) => {
        switch (rank) {
            case 1: // Gold
                return {
                    body: 'fill-amber-400',
                    highlight: 'fill-amber-200',
                    shadow: 'fill-amber-600',
                    ribbon: 'fill-red-600',
                    ribbonShadow: 'fill-red-800',
                    text: 'fill-amber-900',
                    glow: 'shadow-amber-500/50'
                };
            case 2: // Silver
                return {
                    body: 'fill-slate-300',
                    highlight: 'fill-slate-100',
                    shadow: 'fill-slate-500',
                    ribbon: 'fill-blue-600',
                    ribbonShadow: 'fill-blue-800',
                    text: 'fill-slate-800',
                    glow: 'shadow-slate-400/50'
                };
            case 3: // Bronze
                return {
                    body: 'fill-orange-400',
                    highlight: 'fill-orange-200',
                    shadow: 'fill-orange-700',
                    ribbon: 'fill-green-600',
                    ribbonShadow: 'fill-green-800',
                    text: 'fill-orange-950',
                    glow: 'shadow-orange-500/50'
                };
            default:
                return {
                    body: 'fill-gray-400',
                    highlight: 'fill-gray-200',
                    shadow: 'fill-gray-600',
                    ribbon: 'fill-gray-600',
                    ribbonShadow: 'fill-gray-800',
                    text: 'fill-gray-900',
                    glow: 'shadow-gray-500/50'
                };
        }
    };

    const s = getStyles(rank);

    // Icon selection based on Period
    const PeriodIcon = () => {
        if (category === 'DAILY') {
            // Sun/Star
            return <path d="M12 2L14.39 8.26L21 9.27L16.47 14.14L17.54 20.73L12 17.77L6.46 20.73L7.53 14.14L3 9.27L9.61 8.26L12 2Z" className={s.text} opacity="0.9" transform="scale(0.6) translate(8, 8)" />;
        } else if (category === 'WEEKLY') {
            // Laurel / Wreath
            return <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.62L12 2L9.19 8.62L2 9.24L7.45 13.97L5.82 21L12 17.27Z" className={s.text} opacity="0.9" transform="scale(0.6) translate(8, 8)" />;
        } else {
            // Crown (Monthly)
            return <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z" className={s.text} opacity="0.9" transform="scale(0.5) translate(12, 12)" />;
        }
    }

    return (
        <div className={`relative flex items-center justify-center drop-shadow-md transition-transform hover:scale-110 ${className}`}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full filter drop-shadow-sm">
                {/* Ribbon Back */}
                <path d="M5 0L12 4L19 0V10H5V0Z" className={s.ribbonShadow} />
                <path d="M5 0L12 2L19 0H5Z" className={s.ribbon} />

                {/* Medal Body */}
                <circle cx="12" cy="14" r="9" className={s.shadow} />
                <circle cx="12" cy="14" r="8" className={s.body} />

                {/* Reflection/Highlight */}
                <path d="M12 6C7.58172 6 4 9.58172 4 14C4 14.5 4.05 15 4.15 15.5C4.7 10 9 6 14.5 6H12Z" className={s.highlight} opacity="0.6" />

                {/* Inner Ring */}
                <circle cx="12" cy="14" r="6" className={s.shadow} opacity="0.2" stroke="none" />

                {/* Content Icon */}
                <PeriodIcon />

                {/* Rank Text (Small) */}
                <text x="12" y="21" textAnchor="middle" className={`text-[4px] font-black ${s.text} uppercase`} style={{ fontSize: '4px', fontFamily: 'sans-serif' }}>
                    {type === 'GLOBAL' ? 'World' : 'Group'}
                </text>
            </svg>

            {/* Rank Number Overlay */}
            <div className={`absolute inset-0 flex items-center justify-center pt-2.5`}>
                <span className={`text-[10px] font-black ${rank === 1 ? 'text-amber-900' : rank === 2 ? 'text-slate-800' : 'text-orange-950'}`}>
                    {rank}
                </span>
            </div>
        </div>
    );
}
