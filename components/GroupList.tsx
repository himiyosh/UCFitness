'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface GroupMembership {
    role: string;
    joined_at: string;
    rank?: number | null;
    totalMembers?: number;
    groups: {
        id: string;
        name: string;
        keyword: string;
        image_url?: string | null;
        header_image_url?: string | null;
    };
}

export default function GroupList({ initialMemberships }: { initialMemberships: GroupMembership[] }) {
    const [memberships, setMemberships] = useState(initialMemberships);
    const [isUpdating, setIsUpdating] = useState(false);
    const router = useRouter();

    const handleMakePrimary = async (targetId: string) => {
        if (isUpdating) return;

        const targetIndex = memberships.findIndex(m => m.groups.id === targetId);
        if (targetIndex <= 0) return; // Already first or not found

        setIsUpdating(true);

        const targetGroup = memberships[targetIndex];
        const newList = [
            targetGroup,
            ...memberships.filter(m => m.groups.id !== targetId)
        ];

        // Optimistic Update
        setMemberships(newList);

        try {
            const keywords = newList.map(m => m.groups.keyword);

            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reorder',
                    groupKeywords: keywords
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to update order');
            }

            router.refresh(); // Refresh server data to ensure consistency
        } catch (error) {
            console.error(error);
            alert("Failed to save order. Reverting.");
            setMemberships(initialMemberships); // Revert
        } finally {
            setIsUpdating(false);
        }
    };

    const handleMove = async (index: number, direction: -1 | 1) => {
        if (isUpdating) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= memberships.length) return;

        setIsUpdating(true);

        const newList = [...memberships];
        [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];

        // Optimistic Update
        setMemberships(newList);

        try {
            const keywords = newList.map(m => m.groups.keyword);

            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reorder',
                    groupKeywords: keywords
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to update order');
            }

            router.refresh();
        } catch (error) {
            console.error(error);
            alert("Failed to save order. Reverting.");
            setMemberships(initialMemberships);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {memberships.map((m, index) => (
                <div
                    key={m.groups.id}
                    className="relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group overflow-hidden"
                >
                    <Link href={`/group/${m.groups.id}`} className="block relative h-full flex flex-row sm:flex-col min-h-[110px] sm:min-h-0">
                        {/* Banner Section */}
                        <div className="w-20 sm:w-full h-auto sm:h-24 bg-indigo-50 relative overflow-hidden shrink-0 border-r sm:border-r-0 border-gray-100">
                            {/* Rank Badge */}
                            {m.rank && (
                                <div className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide shadow-sm border border-white/20 backdrop-blur-md
                                    ${m.rank === 1 ? 'bg-yellow-300 text-yellow-900' :
                                        m.rank === 2 ? 'bg-gray-300 text-gray-900' :
                                            m.rank === 3 ? 'bg-orange-300 text-orange-900' : 'bg-black/50 text-white sm:bg-white/90 sm:text-indigo-900'}
                                `}>
                                    #{m.rank}
                                </div>
                            )}
                            {m.groups.header_image_url ? (
                                <div className="absolute inset-0">
                                    <img
                                        src={m.groups.header_image_url}
                                        alt=""
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                                </div>
                            ) : (
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50" />
                            )}
                        </div>

                        {/* Icon (Positioned Absolutely) */}
                        <div className="absolute z-10 
                            top-1/2 left-10 -translate-y-1/2 -translate-x-1/2 
                            sm:top-24 sm:left-8 sm:translate-x-[-50%] 
                            w-12 h-12 rounded-xl border-2 border-white shadow-sm 
                            sm:w-16 sm:h-16 sm:rounded-2xl sm:border-4
                            flex items-center justify-center bg-indigo-50 overflow-hidden text-indigo-600">

                            {m.groups.image_url ? (
                                <img src={m.groups.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center font-bold text-lg sm:text-xl bg-indigo-50 text-indigo-600">
                                    {m.groups.name.substring(0, 1).toUpperCase()}
                                </div>
                            )}
                        </div>

                        {/* Content Section */}
                        <div className="flex-1 p-3 pl-4 sm:p-4 sm:pt-12 relative min-w-0 flex flex-col justify-center sm:block">
                            <div className="min-w-0 pr-10 sm:pr-0">
                                <h3 className="text-base sm:text-lg font-bold text-gray-900 group-hover:text-indigo-600 truncate">
                                    {m.groups.name}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    {m.role === 'OWNER' && (
                                        <span className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide rounded">
                                            Owner
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-500 truncate">
                                        #{m.groups.keyword}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Link>

                    {/* Actions Column */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 sm:top-4 sm:right-4 sm:translate-y-0 flex flex-col gap-2 z-20">
                        {/* Primary Action (Pin) */}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (index !== 0) handleMakePrimary(m.groups.id);
                            }}
                            disabled={isUpdating || index === 0}
                            className={`p-1.5 rounded-full transition-colors ${index === 0
                                ? 'text-indigo-600 bg-indigo-50 cursor-default shadow-sm border border-indigo-100'
                                : 'text-gray-400 bg-white/80 backdrop-blur-sm shadow-sm hover:text-indigo-600 hover:bg-white border border-transparent hover:border-indigo-100'
                                }`}
                            title={index === 0 ? "Currently Primary Group" : "Pin as Primary Group"}
                        >
                            {index === 0 ? (
                                // Solid Pin (Active)
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4 6a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2h-1v2.586l2.707 2.707a1 1 0 01-1.414 1.414l-3-3A1 1 0 0111 11.414V10h-2v1.414a1 1 0 01-.293.707l-3 3a1 1 0 01-1.414-1.414l2.707-2.707V10H6a2 2 0 01-2-2V6z" />
                                </svg>
                            ) : (
                                // Outline Pin (Inactive)
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                            )}
                        </button>

                        {/* Reorder Arrows */}
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleMove(index, -1);
                                }}
                                disabled={isUpdating || index === 0}
                                className="p-1 w-7 h-7 flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-400 hover:text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 disabled:opacity-0 disabled:pointer-events-none transition-all shadow-sm active:scale-95"
                                title="Move Up"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleMove(index, 1);
                                }}
                                disabled={isUpdating || index === memberships.length - 1}
                                className="p-1 w-7 h-7 flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-400 hover:text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 disabled:opacity-0 disabled:pointer-events-none transition-all shadow-sm active:scale-95"
                                title="Move Down"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
