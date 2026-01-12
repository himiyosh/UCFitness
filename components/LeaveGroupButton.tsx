'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LeaveGroupButton({
    groupKeyword,
    groupName
}: {
    groupKeyword: string,
    groupName: string
}) {
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();

    const handleLeave = async () => {
        if (!confirm(`Are you sure you want to leave ${groupName}?`)) return;

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
                const err = await res.json();
                alert(err.error || 'Failed to leave group');
                setIsProcessing(false);
                return;
            }

            // Redirect to groups list
            router.push('/groups');
            router.refresh();

        } catch (error) {
            console.error(error);
            alert('An error occurred.');
            setIsProcessing(false);
        }
    };

    return (
        <div className="bg-white rounded-xl p-6 border border-gray-100 text-center shadow-sm">
            <p className="text-sm text-gray-500 mb-4">You are a member of this group.</p>
            <button
                onClick={handleLeave}
                disabled={isProcessing}
                className="text-red-500 hover:text-red-700 text-sm font-bold hover:underline disabled:opacity-50 disabled:no-underline"
            >
                {isProcessing ? 'Leaving...' : 'Leave Group'}
            </button>
        </div>
    );
}
