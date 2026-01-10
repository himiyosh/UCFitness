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
        <div className={`overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 relative group/panel ${isMoving ? 'opacity-50' : ''}`}>
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5 truncate">
                        Group:
                        <span className="truncate bg-gray-100 text-indigo-600 py-0.5 px-2 rounded-full text-xs border border-gray-200">{keyword}</span>
                    </h3>
                </div>
                <div className="flex items-center gap-1">
                    {!isFirst && (
                        <button
                            onClick={() => handleMove('up')}
                            className="p-1 text-gray-400 hover:text-indigo-700 hover:bg-gray-100 rounded"
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
                            className="p-1 text-gray-400 hover:text-indigo-700 hover:bg-gray-100 rounded"
                            title="Move Down"
                            disabled={isMoving}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}
                    <div className="w-px h-3 bg-gray-200 mx-1"></div>
                    <button
                        onClick={handleLeave}
                        className="text-xs text-gray-400 hover:text-red-600 underline transition-colors px-1"
                        title="Leave Group"
                    >
                        Leave
                    </button>
                </div>
            </div>
            <div className="bg-white px-0">
                <div role="list" className="divide-y divide-gray-50">
                    {neighbors.length > 0 ? neighbors.map((entry: any, i: number) => {
                        const isMe = entry.users.email === userEmail;
                        const isGap = i > 0 && entry.originalRank > neighbors[i - 1].originalRank + 1;

                        if (isGap) {
                            return (
                                <div key={`gap-${i}`} className="px-6 py-2 bg-gray-50 flex justify-center border-b border-gray-50">
                                    <span className="text-gray-400 text-xs tracking-widest">•••</span>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={entry.originalRank}
                                className={`px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${isMe ? 'bg-indigo-50/50' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    <span className={`
                                        flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
                                        ${entry.originalRank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                            entry.originalRank === 2 ? 'bg-gray-100 text-gray-700' :
                                                entry.originalRank === 3 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}
                                    `}>
                                        {entry.originalRank}
                                    </span>
                                    {entry.users?.image ? (
                                        <img className="h-10 w-10 rounded-full border border-gray-100" src={entry.users.image} alt="" />
                                    ) : (
                                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold">
                                            {(entry.users?.name || '?')[0]}
                                        </div>
                                    )}
                                    <div className="flex flex-col min-w-0">
                                        <p className={`text-sm font-bold truncate ${isMe ? 'text-gray-900' : 'text-gray-900'}`}>
                                            {entry.users.name || 'Anonymous'}
                                        </p>
                                        {isMe && <span className="text-[10px] text-indigo-500 font-medium leading-none">YOU</span>}
                                    </div>
                                </div>
                                <div className="font-mono font-semibold text-indigo-600">
                                    {entry.steps.toLocaleString()}
                                </div>
                            </div>
                        );
                    }) : (
                        <p className="text-center text-gray-400 py-8">No group activity yet today.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
