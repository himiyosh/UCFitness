
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Member = {
    user_id: string;
    role: 'OWNER' | 'MEMBER';
    users: {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
        username: string | null;
    };
};

export default function GroupMembersPanel({
    members: initialMembers,
    groupKeyword,
    isOwner,
    currentUserId,
    isEditing,
    onToggleEdit
}: {
    members: Member[],
    groupKeyword: string,
    isOwner: boolean,
    currentUserId: string,
    isEditing: boolean,
    onToggleEdit: () => void
}) {
    const [members, setMembers] = useState(initialMembers);
    const [isProcessing, setIsProcessing] = useState<string | null>(null); // userId being processed
    const router = useRouter();

    useEffect(() => {
        setMembers(initialMembers);
    }, [initialMembers]);

    const handleTransferOwnership = async (targetId: string, memberName: string) => {
        if (!confirm(`Are you sure you want to promote ${memberName} to Owner? You will also remain an owner.`)) return;

        setIsProcessing(targetId);
        try {
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'transfer_ownership',
                    keyword: groupKeyword,
                    targetUserId: targetId
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to promote member');
                return;
            }

            alert(`${memberName} is now an Owner.`);
            router.refresh();

        } catch (error) {
            console.error(error);
            alert('An error occurred.');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleDemote = async (targetId: string, memberName: string, isSelf: boolean) => {
        const msg = isSelf
            ? "Are you sure you want to demote yourself to Member? You will lose owner privileges."
            : `Are you sure you want to demote ${memberName} to Member?`;

        if (!confirm(msg)) return;

        setIsProcessing(targetId);
        try {
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'demote',
                    keyword: groupKeyword,
                    targetUserId: targetId
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to demote member');
                return;
            }

            alert(isSelf ? "You are now a member." : `${memberName} is now a member.`);
            router.refresh();

        } catch (error) {
            console.error(error);
            alert('An error occurred.');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleKick = async (targetId: string, memberName: string) => {
        if (!confirm(`Are you sure you want to remove ${memberName}?`)) return;

        setIsProcessing(targetId);
        try {
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'kick',
                    keyword: groupKeyword,
                    targetUserId: targetId
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to remove member');
                return;
            }

            // Update local state (though useEffect will likely overwrite this soon which is fine)
            setMembers(prev => prev.filter(m => m.user_id !== targetId));
            router.refresh();

        } catch (error) {
            console.error(error);
            alert('An error occurred.');
        } finally {
            setIsProcessing(null);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">Members ({members.length})</h3>
                    {isOwner && <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">Owner</span>}
                </div>
                {isOwner && (
                    <button
                        onClick={onToggleEdit}
                        className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${isEditing ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                    >
                        {isEditing ? 'Done' : 'Edit'}
                    </button>
                )}
            </div>
            <ul className="divide-y divide-gray-100">
                {members.map((member) => (
                    <li key={member.user_id} className="px-6 py-4 grid grid-cols-[1fr_auto] gap-4 items-center hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            <div className="h-10 w-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                                {member.users.image ? (
                                    <img src={member.users.image} alt={member.users.name || 'User'} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-gray-500 font-bold">
                                        {(member.users.name?.[0] || member.users.email?.[0] || '?').toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0">
                                <Link href={`/user/${member.users.username}`} className="font-medium text-gray-900 hover:text-indigo-600 transition-colors truncate block flex items-center gap-2">
                                    <span>{member.users.name || 'Unknown User'}</span>
                                    {member.user_id === currentUserId && (
                                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">YOU</span>
                                    )}
                                </Link>
                                <p className="text-xs text-gray-500 truncate">
                                    {member.role === 'OWNER' ? 'Owner' : 'Member'}
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        {isOwner && (
                            <div className={`flex flex-col gap-1 shrink-0 w-20 ${!isEditing ? 'invisible pointer-events-none' : ''}`}>
                                {member.user_id === currentUserId ? (
                                    member.role === 'OWNER' && (
                                        <button
                                            onClick={() => handleDemote(member.user_id, 'yourself', true)}
                                            disabled={!!isProcessing}
                                            className="text-[10px] text-amber-600 hover:text-amber-800 font-bold px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-100 whitespace-nowrap text-center w-full"
                                        >
                                            Demote Self
                                        </button>
                                    )
                                ) : (
                                    <>
                                        {member.role === 'OWNER' ? (
                                            <button
                                                onClick={() => handleDemote(member.user_id, member.users.name || 'this user', false)}
                                                disabled={!!isProcessing}
                                                className="text-[10px] text-amber-600 hover:text-amber-800 font-bold px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-100 whitespace-nowrap text-center w-full"
                                            >
                                                Demote
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleTransferOwnership(member.user_id, member.users.name || 'this user')}
                                                disabled={!!isProcessing}
                                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-100 whitespace-nowrap text-center w-full"
                                            >
                                                Make Owner
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleKick(member.user_id, member.users.name || 'this user')}
                                            disabled={!!isProcessing}
                                            className="text-[10px] text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-100 transition-colors border border-red-100 whitespace-nowrap text-center w-full"
                                        >
                                            {isProcessing === member.user_id ? '...' : 'Remove'}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
