'use client';

import { useState } from 'react';
import BadgeIcon from '@/components/BadgeIcon';

interface Badge {
    badge_code: string;
    period_date: string;
    badges: {
        name: string;
        description?: string;
        category: string;
        type: string;
        rank: number;
    };
}

interface ProfileBadgesProps {
    badges: Badge[];
}

export default function ProfileBadges({ badges }: ProfileBadgesProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    // We want to display specific "Slots" for achievements.
    const SLOTS = [
        // Rankings
        { type: 'GLOBAL', category: 'DAILY', label: 'Global Daily', color: 'text-amber-500' },
        { type: 'GLOBAL', category: 'WEEKLY', label: 'Global Weekly', color: 'text-sky-500' },
        { type: 'GLOBAL', category: 'MONTHLY', label: 'Global Monthly', color: 'text-violet-500' },
        { type: 'GROUP', category: 'DAILY', label: 'Group Daily', color: 'text-emerald-500' },
        { type: 'GROUP', category: 'WEEKLY', label: 'Group Weekly', color: 'text-rose-500' },
        { type: 'GROUP', category: 'MONTHLY', label: 'Group Monthly', color: 'text-fuchsia-500' },

        // Personal Achievements
        { type: 'ACHIEVEMENT', category: 'STREAK', label: 'Best Streak', color: 'text-orange-500' },
        { type: 'ACHIEVEMENT', category: 'MILESTONE', label: 'Milestone', color: 'text-indigo-500' },
        { type: 'ACHIEVEMENT', category: 'LIFESTYLE', label: 'Weekend Warrior', color: 'text-teal-500' },

        // Titles (Average Daily Steps)
        { type: 'ACHIEVEMENT', category: 'TITLE', label: 'Walker (6k)', color: 'text-fuchsia-400', matchRank: 1 },
        { type: 'ACHIEVEMENT', category: 'TITLE', label: 'Hiker (8k)', color: 'text-fuchsia-500', matchRank: 2 },
        { type: 'ACHIEVEMENT', category: 'TITLE', label: 'Achiever (10k)', color: 'text-fuchsia-600', matchRank: 3 },
        { type: 'ACHIEVEMENT', category: 'TITLE', label: 'Athlete (15k)', color: 'text-fuchsia-700', matchRank: 4 },
        { type: 'ACHIEVEMENT', category: 'TITLE', label: 'Champion (20k)', color: 'text-fuchsia-800', matchRank: 5 },
    ];

    const bestBadges = SLOTS.map(slot => {
        const relevantBadges = badges.filter(b => {
            const typeMatch = b.badges.type === slot.type;
            const catMatch = b.badges.category === slot.category;
            // @ts-ignore
            const rankMatch = slot.matchRank ? b.badges.rank === slot.matchRank : true;
            return typeMatch && catMatch && rankMatch;
        });

        if (relevantBadges.length === 0) return { ...slot, badge: null };

        // Sort by rank ascending (1 is best) => for matchRank slots, irrelevant but safe.
        relevantBadges.sort((a, b) => a.badges.rank - b.badges.rank);
        return { ...slot, badge: relevantBadges[0] };
    });

    // Summary View: Show only earned badges, max 6
    const earnedBadges = bestBadges.filter(b => b.badge !== null);
    const displayBadges = earnedBadges.slice(0, 6);

    return (
        <>
            <div className="md:col-span-1 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                        Achievements
                    </h3>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                        View All ({bestBadges.length})
                    </button>
                </div>

                {displayBadges.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                        {displayBadges.map((slot) => (
                            <BadgeSlot key={`${slot.type}-${slot.category}-${slot.label}`} slot={slot} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 text-gray-400 text-xs">
                        <p>No achievements yet.</p>
                        <p className="mt-1">Keep walking to unlock!</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">All Achievements</h2>
                                <p className="text-sm text-gray-500 hidden sm:block">Unlock badges by ranking in groups or hitting personal milestones.</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {bestBadges.map((slot) => (
                                <BadgeSlot key={`${slot.type}-${slot.category}-${slot.label}`} slot={slot} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// Extracted Component for consistency
function BadgeSlot({ slot }: { slot: any }) {
    const [hovered, setHovered] = useState(false);
    const hasBadge = !!slot.badge;

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => setHovered(!hovered)}
            className={`
                relative flex flex-col items-center justify-between p-2 rounded-lg border 
                transition-all duration-300 cursor-pointer touch-manipulation h-32
                ${hasBadge
                    ? 'bg-white border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md'
                    : 'bg-gray-50 border-gray-100 opacity-60 grayscale hover:opacity-100'}
                ${hovered ? 'z-[60] border-indigo-300 shadow-md opacity-100 grayscale-0' : ''}
            `}
        >
            {/* Header Label */}
            <div className={`text-[9px] font-bold uppercase tracking-wide mb-1 text-center ${slot.color} h-6 flex items-center justify-center leading-none`}>
                {slot.label}
            </div>

            {/* Icon */}
            <div className="my-1 relative flex items-center justify-center flex-1">
                {hasBadge ? (
                    <BadgeIcon
                        type={slot.badge!.badges.type}
                        category={slot.badge!.badges.category}
                        rank={slot.badge!.badges.rank}
                        className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-sm"
                    />
                ) : (
                    <BadgeIcon
                        type={slot.type}
                        category={slot.category}
                        rank={1}
                        className="w-10 h-10 sm:w-12 sm:h-12 opacity-30 grayscale blur-[0.5px]"
                    />
                )}
            </div>

            {/* Tooltip */}
            {hovered && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 px-3 py-2 bg-gray-900/95 text-white text-[10px] rounded-md transition-opacity pointer-events-none z-[100] text-center shadow-xl border border-white/10 animate-in fade-in zoom-in-95 duration-200">
                    {hasBadge ? (
                        <p className="font-semibold leading-tight">{slot.badge!.badges.description || slot.label}</p>
                    ) : (
                        <div className="space-y-1">
                            <p className="font-bold text-gray-300 uppercase tracking-wider text-[9px] border-b border-gray-700 pb-1 mb-1">How to Unlock</p>
                            <p className="leading-tight text-gray-200">
                                {slot.category === 'STREAK' && "Reach step goal for consecutive days (Min: 3 Days)."}
                                {slot.category === 'MILESTONE' && "Reach total lifetime steps (Min: 100k Steps)."}
                                {slot.category === 'LIFESTYLE' && "Active >20k steps on a weekend."}
                                {slot.category === 'TITLE' && `Maintain a daily average of ${slot.label.split('(')[1].replace(')', '')} steps.`}
                                {['DAILY', 'WEEKLY', 'MONTHLY'].includes(slot.category) && `Rank top 3 in ${slot.label}.`}
                            </p>
                        </div>
                    )}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900/95"></div>
                </div>
            )}

            {/* Footer: Date instead of Name */}
            <div className="text-center w-full mt-1 h-3">
                {hasBadge ? (
                    <p className="text-[9px] font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
                        {slot.badge!.period_date}
                    </p>
                ) : (
                    <p className="text-[9px] font-medium text-gray-400">
                        Locked
                    </p>
                )}
            </div>
        </div>
    );
}
