'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
    groupKeyword: string;
    groupName: string;
}

export default function DeleteGroupButton({ groupKeyword, groupName }: Props) {
    const [isConfirming, setIsConfirming] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        if (!confirmText || confirmText !== groupName) {
            alert("Please type the group name exactly to confirm.");
            return;
        }

        if (!confirm("Are you absolutely sure? This action cannot be undone and will remove all members.")) {
            return;
        }

        setIsThinking(true);
        try {
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete_group',
                    keyword: groupKeyword
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete group');
            }

            // Redirect to Groups
            router.push('/groups');
            router.refresh();

        } catch (error: any) {
            console.error(error);
            alert(error.message);
            setIsThinking(false);
        }
    };

    if (isConfirming) {
        return (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mt-6">
                <h3 className="text-red-800 font-bold mb-2">Delete Group</h3>
                <p className="text-red-600 text-sm mb-4">
                    This action is <span className="font-bold">irreversible</span>. All members will be removed and the group data will be permanently deleted.
                </p>
                <div className="mb-4">
                    <label className="block text-xs font-bold text-red-700 mb-1">
                        Type <span className="select-all bg-white px-1 rounded border border-red-200">{groupName}</span> to confirm:
                    </label>
                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                        placeholder={groupName}
                    />
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleDelete}
                        disabled={isThinking || confirmText !== groupName}
                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-bold py-2 rounded-lg transition-colors text-sm"
                    >
                        {isThinking ? 'Deleting...' : 'Delete Group'}
                    </button>
                    <button
                        onClick={() => { setIsConfirming(false); setConfirmText(''); }}
                        className="px-4 py-2 bg-white text-gray-700 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="pt-6 border-t border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Danger Zone</h3>
            <p className="text-xs text-gray-500 mb-4">
                Once you delete a group, there is no going back. Please be certain.
            </p>
            <button
                onClick={() => setIsConfirming(true)}
                className="w-full bg-white text-red-600 hover:bg-red-50 hover:text-red-700 border border-red-200 font-bold py-2 px-4 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete this Group
            </button>
        </div>
    );
}
