'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface JoinGroupPreviewProps {
    group: {
        id: string;
        name: string;
        keyword: string;
        image_url?: string | null;
        header_image_url?: string | null;
        description?: string | null; // Future proofing
    };
    userId: string;
}

export default function JoinGroupPreview({ group, userId }: JoinGroupPreviewProps) {
    const [isJoining, setIsJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleJoin = async () => {
        setIsJoining(true);
        setError(null);

        try {
            const response = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add', keyword: group.keyword }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to join group');
            }

            // Success! Refresh page to show the full dashboard (server will now see membership)
            router.refresh();

        } catch (err: any) {
            console.error(err);
            setError(err.message || "An error occurred");
            setIsJoining(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">

            {/* Preview Card */}
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden border border-[var(--theme-primary-light)] transform transition-all hover:scale-[1.01] duration-500">

                {/* Header Image */}
                <div className="h-32 sm:h-48 bg-gray-200 relative">
                    {group.header_image_url ? (
                        <>
                            <img src={group.header_image_url} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                        </>
                    ) : (
                        <div className="w-full h-full bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)]"></div>
                    )}
                </div>

                {/* Content */}
                <div className="px-8 pb-10 pt-0 relative">

                    {/* Group Icon (Negative Margin to overlap header) */}
                    <div className="flex justify-center -mt-12 mb-6">
                        <div className="h-24 w-24 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-white flex items-center justify-center text-3xl font-black text-[var(--theme-primary-light)]">
                            {group.image_url ? (
                                <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="bg-[var(--theme-primary)] w-full h-full flex items-center justify-center text-white">
                                    {group.name.substring(0, 1).toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>

                    <h2 className="text-3xl font-black text-gray-900 mb-2">{group.name}</h2>
                    <p className="text-gray-500 font-medium mb-8 flex items-center justify-center gap-2">
                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-mono">ID: {group.keyword}</span>
                    </p>

                    <div className="space-y-4">
                        <button
                            onClick={handleJoin}
                            disabled={isJoining}
                            className="w-full py-4 px-6 rounded-xl bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/90 text-white font-bold text-lg shadow-lg shadow-[var(--theme-primary)]/20 transition-all transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isJoining ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Joining...
                                </>
                            ) : (
                                "Join Group"
                            )}
                        </button>

                        {error && (
                            <p className="text-red-500 text-sm font-medium animate-pulse">{error}</p>
                        )}

                        <p className="text-xs text-gray-400 mt-6">
                            You are not a member of this group.<br />Join to see leaderboards and compete with others.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
