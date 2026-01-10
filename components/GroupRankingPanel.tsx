'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
    keyword: string;
    neighbors: any[];
    userEmail?: string | null;
    index: number;
    totalCount: number;
};

export default function GroupRankingPanel({ keyword, neighbors, userEmail, index, totalCount }: Props) {
    const [isLeaving, setIsLeaving] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const router = useRouter();

    const handleMove = async (direction: 'up' | 'down') => {
        setIsMoving(true);
        try {
            await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'move', keyword: keyword, direction }),
            });
            router.refresh();
        } catch (error) {
            console.error(error);
        } finally {
            setIsMoving(false);
        }
    };

    const handleLeave = async () => {
        if (!confirm(`Are you sure you want to leave the group "${keyword}"?`)) return;

        setIsLeaving(true);
        try {
            await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove', keyword: keyword }),
            });
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to leave group');
            setIsLeaving(false);
        }
    };

    if (isLeaving) {
        return (
            <div className="overflow-hidden rounded-xl bg-gray-50 shadow-sm border border-gray-100 p-8 text-center opacity-50">
                Leaving group...
            </div>
        );
    }

    const isFirst = index === 0;
    const isLast = index === totalCount - 1;

    return (
        <div className={`overflow-hidden rounded-xl bg-indigo-50 shadow-sm border border-indigo-100 relative group/panel ${isMoving ? 'opacity-50' : ''}`}>
            <div className="px-4 py-3 border-b border-indigo-100 flex justify-between items-center">
                <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-1.5 truncate">
                        Group:
                        <span className="truncate bg-white text-indigo-600 py-0.5 px-2 rounded-full text-xs border border-indigo-200">{keyword}</span>
                    </h3>
                </div>
                <div className="flex items-center gap-1">
                    {!isFirst && (
                        <button
                            onClick={() => handleMove('up')}
                            className="p-1 text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 rounded"
                            title="Move Up"
                            disabled={isMoving}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}
                    {!isLast && (
                        <button
                            onClick={() => handleMove('down')}
                            className="p-1 text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 rounded"
                            title="Move Down"
                            disabled={isMoving}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}
                    <div className="w-px h-3 bg-indigo-200 mx-1"></div>
                    <button
                        onClick={handleLeave}
                        className="text-xs text-indigo-400 hover:text-red-600 underline transition-colors px-1"
                        title="Leave Group"
                    >
                        Leave
                    </button>
                </div>
            </div>
            <div className="p-3 space-y-2">
                {neighbors.length > 0 ? neighbors.map((entry: any) => {
                    const isMe = entry.users.email === userEmail;
                    return (
                        <div
                            key={entry.originalRank}
                            className={`
                                flex items-center justify-between p-2 rounded-lg shadow-sm
                                ${isMe ? 'bg-white ring-2 ring-indigo-500 z-10 scale-[1.01] transform transition-transform' : 'bg-white/60'}
                            `}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="flex flex-col items-center justify-center min-w-[1.5rem]">
                                    <span className="text-[10px] text-gray-400 uppercase">Rank</span>
                                    <span className={`text-lg font-black ${isMe ? 'text-indigo-600' : 'text-gray-400'}`}>
                                        {entry.originalRank}
                                    </span>
                                </div>
                                {entry.users?.image ? (
                                    <img className="h-8 w-8 rounded-full" src={entry.users.image} alt="" />
                                ) : (
                                    <div className="h-8 w-8 rounded-full bg-gray-200" />
                                )}
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-sm font-bold truncate ${isMe ? 'text-gray-900' : 'text-gray-600'}`}>
                                        {entry.users.name || 'Anonymous'}
                                    </span>
                                    {isMe && <span className="text-[10px] text-indigo-500 font-medium leading-none">YOU</span>}
                                </div>
                            </div>
                            <div className={`text-base font-bold whitespace-nowrap pl-2 ${isMe ? 'text-indigo-600' : 'text-gray-500'}`}>
                                {entry.steps.toLocaleString()}
                            </div>
                        </div>
                    );
                }) : (
                    <p className="text-center text-indigo-400 py-4">No group activity yet today.</p>
                )}
            </div>
        </div>
    );
}
