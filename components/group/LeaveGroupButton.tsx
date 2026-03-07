'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

export default function LeaveGroupButton({
    groupKeyword,
    groupName
}: {
    groupKeyword: string,
    groupName: string
}) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const processingRef = useRef(false);
    const router = useRouter();
    const toast = useToast();

    const handleLeave = useCallback(async () => {
        if (processingRef.current) return;
        processingRef.current = true;
        setIsProcessing(true);
        try {
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'remove',
                    keyword: groupKeyword
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => null);
                toast.error(err?.error || 'Failed to leave group');
                processingRef.current = false;
                setIsProcessing(false);
                setShowConfirm(false);
                return;
            }

            toast.success('Left group successfully');
            router.push('/groups');
            router.refresh();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'An unexpected error occurred';
            toast.error(message);
            processingRef.current = false;
            setIsProcessing(false);
            setShowConfirm(false);
        }
    }, [groupKeyword, router, toast]);

    return (
        <div className="bg-white rounded-xl p-6 border border-gray-100 text-center shadow-sm hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-500 mb-4">You are a member of this group.</p>
            {showConfirm ? (
                <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-medium text-gray-700">
                        Leave <strong>{groupName}</strong>?
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleLeave}
                            disabled={isProcessing}
                            aria-label="Confirm leave group"
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors"
                        >
                            {isProcessing && (
                                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                            )}
                            {isProcessing ? 'Leaving...' : 'Yes, Leave'}
                        </button>
                        <button
                            onClick={() => setShowConfirm(false)}
                            disabled={isProcessing}
                            aria-label="Cancel leave group"
                            className="px-4 py-1.5 text-sm font-bold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowConfirm(true)}
                    aria-label={`Leave group ${groupName}`}
                    className="text-red-500 hover:text-red-700 text-sm font-bold hover:underline hover:scale-105 active:scale-95 transition-transform"
                >
                    Leave Group
                </button>
            )}
        </div>
    );
}
