import React from 'react';

type BadgeType = 'GLOBAL' | 'GROUP';
type BadgeCategory = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'STREAK' | 'MILESTONE' | 'LIFESTYLE';
type BadgeRank = 1 | 2 | 3;

interface BadgeIconProps {
    type: string;
    category: string;
    rank: number;
    className?: string;
}

export default function BadgeIcon({ type, category, rank, className = "w-10 h-10" }: BadgeIconProps) {
    const getStyles = (rank: number, category?: string) => {
        // Achievement specific color overrides
        if (category === 'STREAK') {
            return {
                body: 'fill-orange-500',
                highlight: 'fill-orange-300',
                shadow: 'fill-orange-700',
                text: 'fill-orange-950',
                glow: 'shadow-orange-500/50',
                ribbon: '', ribbonShadow: '' // Unused
            };
        } else if (category === 'MILESTONE') {
            return {
                body: 'fill-indigo-500',
                highlight: 'fill-indigo-300',
                shadow: 'fill-indigo-700',
                text: 'fill-indigo-950',
                glow: 'shadow-indigo-500/50',
                ribbon: '', ribbonShadow: ''
            };
        } else if (category === 'LIFESTYLE') {
            return {
                body: 'fill-teal-500',
                highlight: 'fill-teal-300',
                shadow: 'fill-teal-700',
                text: 'fill-teal-950',
                glow: 'shadow-teal-500/50',
                ribbon: '', ribbonShadow: ''
            };
        } else if (category === 'TITLE') {
            return {
                body: 'fill-fuchsia-500',
                highlight: 'fill-fuchsia-300',
                shadow: 'fill-fuchsia-700',
                text: 'fill-fuchsia-950',
                glow: 'shadow-fuchsia-500/50',
                ribbon: '', ribbonShadow: ''
            };
        }

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

    const s = getStyles(rank, category);

    // Render Logic for Achievements (Standalone Icon)
    if (type === 'ACHIEVEMENT') {
        let Path = <path />;
        let Scale = "scale(1)";

        if (category === 'STREAK') {
            // Flame (Large)
            Path = <path d="M12 23C15.866 23 19 19.866 19 16C19 12.897 16.337 10.609 16.142 10.457C15.842 10.222 15.421 10.709 15.655 11.026C15.706 11.096 16 11.516 16 12C16 12.552 15.552 13 15 13C14.448 13 14 12.552 14 12C14 10.669 15 9.408 15 7C15 6.002 14.618 5.766 14.542 5.727C14.07 5.483 13.626 6.088 13.731 6.577C13.821 7.002 13.905 7.854 13.273 8.694C12.833 9.277 12 9.176 12 8.5C12 8.058 12.246 7.298 12.441 6.885C12.822 6.082 12.428 5.034 11.649 4.887C9.37505 4.45772 7.82052 6.55169 8.07727 8.5147C8.16335 9.17326 7.42816 9.53935 6.94586 9.07062C6.46731 8.60538 5.64154 9.42173 5.92215 10.0246C6.54922 11.3713 5 12.6976 5 15C5 19.4183 8.13401 23 12 23Z" className={s.body} />;
            Scale = "scale(0.85) translate(2, 0)";
        } else if (category === 'MILESTONE') {
            // Flag/Mountain (Large)
            Path = <path d="M14.4 6L14 4H5V21H7V14H12.6L13 16H20V6H14.4Z" className={s.body} />;
            Scale = "scale(1)";
        } else if (category === 'TITLE') {
            // Shield (Large)
            Path = <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22ZM12 11.5V6.5L16 8V11.5C16 14.5 12 16.5 12 16.5V11.5Z" className={s.body} />;
            Scale = "scale(0.9) translate(1, 1)";
        } else {
            // Lifestyle Star (Large)
            Path = <path d="M12 2L14.39 8.26L21 9.27L16.47 14.14L17.54 20.73L12 17.77L6.46 20.73L7.53 14.14L3 9.27L9.61 8.26L12 2Z" className={s.body} />;
            Scale = "scale(0.9) translate(1, 1)";
        }

        return (
            <div className={`relative flex items-center justify-center drop-shadow-md transition-transform hover:scale-110 ${className}`}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full filter drop-shadow-sm">
                    {/* Main Icon Group */}
                    <g transform={Scale}>
                        {/* Shadow Layer */}
                        {React.cloneElement(Path as React.ReactElement, { className: s.shadow, transform: "translate(0, 1)" })}
                        {/* Main Body */}
                        {Path}
                        {/* Highlight */}
                        {React.cloneElement(Path as React.ReactElement, { className: 'fill-white', opacity: 0.2, transform: "scale(0.8) translate(3,3)" })}
                    </g>
                </svg>
                {/* Rank Number Overlay (Optional, maybe specific for ranks?) */}
                {rank <= 3 && (
                    <div className={`absolute inset-0 flex items-center justify-center pt-2`}>
                        <span className={`text-[10px] font-black ${s.text} opacity-90 drop-shadow-sm brightness-50`}>
                            {rank}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    // Default Render: Trophy (Review)
    const PeriodIcon = () => {
        if (category === 'DAILY') {
            // Sun/Star
            return <path d="M12 2L14.39 8.26L21 9.27L16.47 14.14L17.54 20.73L12 17.77L6.46 20.73L7.53 14.14L3 9.27L9.61 8.26L12 2Z" className={s.text} opacity="0.3" transform="scale(0.5) translate(12, 12)" />;
        } else if (category === 'WEEKLY') {
            // Laurel / Wreath
            return <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.62L12 2L9.19 8.62L2 9.24L7.45 13.97L5.82 21L12 17.27Z" className={s.text} opacity="0.3" transform="scale(0.5) translate(12, 12)" />;
        } else {
            // Crown (Monthly)
            return <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z" className={s.text} opacity="0.3" transform="scale(0.4) translate(18, 18)" />;
        }
    }

    return (
        <div className={`relative flex items-center justify-center drop-shadow-md transition-transform hover:scale-110 ${className}`}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full filter drop-shadow-sm">

                {/* Trophy Base */}
                <path d="M8 20L16 20L15.5 22H8.5L8 20Z" className={s.shadow} />
                <rect x="11" y="16" width="2" height="5" className={s.shadow} />

                {/* Handles (Back) */}
                <path d="M6 5H4C2.9 5 2 5.9 2 7V8C2 9.1 2.9 10 4 10H7" className={s.shadow} stroke={s.shadow.replace('fill-', 'text-').replace('text-', 'stroke-')} fill="none" strokeWidth="2" />
                <path d="M18 5H20C21.1 5 22 5.9 22 7V8C22 9.1 21.1 10 20 10H17" className={s.shadow} stroke={s.shadow.replace('fill-', 'text-').replace('text-', 'stroke-')} fill="none" strokeWidth="2" />

                {/* Trophy Cup Body */}
                <path d="M5 4H19L18 10C18 13.3137 15.3137 16 12 16C8.68629 16 6 13.3137 6 10L5 4Z" className={s.body} />

                {/* Reflection/Highlight */}
                <path d="M17.8 4.5H19L18.2 9C18.2 9 17 14 12 14V16C15.3137 16 18 13.3137 18 10L18.8 4.5H17.8Z" className={s.highlight} opacity="0.5" />
                <path d="M5.2 4.5H6.2L6 10C6 11 6.2 12 6.8 13L5.8 13.5L5.2 4.5Z" className={s.highlight} opacity="0.3" />

                {/* Inner Icon */}
                <PeriodIcon />

                {/* Rank Text - Moved to Base */}
                <text x="12" y="21.5" textAnchor="middle" className={`text-[2px] font-black fill-white uppercase tracking-widest`} style={{ fontSize: '2px', fontFamily: 'sans-serif' }}>
                    {type === 'GLOBAL' ? 'WORLD' : 'GROUP'}
                </text>
            </svg>

            {/* Rank Number Overlay */}
            <div className={`absolute inset-0 flex items-center justify-center pb-2`}>
                <span className={`text-[12px] sm:text-[14px] font-black ${rank === 1 ? 'text-amber-900' : rank === 2 ? 'text-slate-800' : 'text-orange-950'}`}>
                    {rank}
                </span>
            </div>
        </div>
    );
}
