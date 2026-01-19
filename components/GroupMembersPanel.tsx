'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ImageModal from '@/components/ImageModal';
import LeaveGroupButton from './LeaveGroupButton';

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
    groupName,
    isOwner,
    currentUserId,
    isEditing,
    onToggleEdit
}: {
    members: Member[],
    groupKeyword: string,
    groupName: string,
    isOwner: boolean,
    currentUserId: string,
    isEditing: boolean,
    onToggleEdit: () => void
}) {
    const [members, setMembers] = useState(initialMembers);
    const [isProcessing, setIsProcessing] = useState<string | null>(null); // userId being processed
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
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

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 3) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const res = await fetch(`/api/user/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (res.ok) {
                // Filter out existing members
                const existingIds = new Set(members.map(m => m.user_id));
                const filtered = (data.users || []).filter((u: any) => !existingIds.has(u.id));
                setSearchResults(filtered);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleInvite = async (userId: string) => {
        setIsProcessing(userId);
        try {
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'invite',
                    keyword: groupKeyword,
                    targetUserId: userId
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to invite user');
                return;
            }

            alert('User invited successfully!');
            setSearchQuery('');
            setSearchResults([]);
            setIsInviteOpen(false);
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to invite user');
        } finally {
            setIsProcessing(null);
        }
    };


    const handleLeaveGroup = async () => {
        if (!confirm(`Are you sure you want to leave ${groupName}?`)) return;

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
                return;
            }

            // Redirect to groups list
            router.push('/groups');
            router.refresh();

        } catch (error) {
            console.error(error);
            alert('An error occurred.');
        }
    };

    const ownerCount = members.filter(m => m.role === 'OWNER').length;
    const [selectedImage, setSelectedImage] = useState<{ src: string, alt: string } | null>(null);

    return (
        <div>
            <ImageModal
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                src={selectedImage?.src || null}
                alt={selectedImage?.alt}
            />
            <div className="px-0 py-2 pb-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">Members ({members.length})</h3>
                    {isOwner && <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">Owner</span>}
                </div>
                <div className="flex gap-2">
                    {isOwner && (
                        <button
                            onClick={() => setIsInviteOpen(!isInviteOpen)}
                            className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${isInviteOpen ? 'bg-indigo-600 text-white' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100'}`}
                        >
                            {isInviteOpen ? 'Close' : 'Invite'}
                        </button>
                    )}
                    <button
                        onClick={onToggleEdit}
                        className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${isEditing ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                    >
                        {isEditing ? 'Done' : 'Edit'}
                    </button>
                </div>
            </div>

            {/* Invite Panel */}
            {isInviteOpen && (
                <div className="p-4 bg-indigo-50 border-b border-indigo-100 animate-fade-in">
                    <p className="text-sm text-indigo-900 mb-2 font-bold">Invite New Member</p>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search by ID, Username, or Email..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="w-full pl-4 pr-4 py-2 text-sm text-gray-900 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        />
                        {isSearching && (
                            <div className="absolute right-3 top-2.5">
                                <svg className="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            </div>
                        )}
                    </div>

                    {/* Results */}
                    {searchResults.length > 0 && (
                        <div className="mt-3 bg-white rounded-lg border border-indigo-100 shadow-sm max-h-48 overflow-y-auto">
                            {searchResults.map(user => (
                                <div key={user.id} className="p-3 flex items-center justify-between hover:bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-gray-200 overflow-hidden">
                                            {user.image ? (
                                                <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-xs font-bold text-gray-500">
                                                    {(user.name?.[0] || '?').toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{user.name}</p>
                                            <p className="text-xs text-gray-500">@{user.username || user.id.substring(0, 8)}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleInvite(user.id)}
                                        disabled={!!isProcessing}
                                        className="text-xs font-bold text-white bg-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                    >
                                        {isProcessing === user.id ? 'Adding...' : 'Add'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {searchQuery.length >= 3 && searchResults.length === 0 && !isSearching && (
                        <p className="text-xs text-indigo-400 mt-2">No users found.</p>
                    )}
                </div>
            )}

            <ul className="divide-y divide-gray-100">
                {members.map((member) => (
                    <li key={member.user_id} className="py-3 sm:py-4 grid grid-cols-[1fr_auto] gap-4 items-center hover:bg-gray-50 transition-colors rounded-lg px-2">
                        <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            <div
                                className="h-10 w-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={(e) => {
                                    e.preventDefault(); // Prevent Link navigation
                                    if (member.users.image) {
                                        setSelectedImage({ src: member.users.image, alt: member.users.name || 'User' });
                                    }
                                }}
                            >
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
                            <div className={`flex flex-row gap-2 shrink-0 ${!isEditing ? 'invisible pointer-events-none' : ''}`}>
                                {member.user_id === currentUserId ? (
                                    member.role === 'OWNER' && (
                                        <>
                                            <button
                                                onClick={() => handleDemote(member.user_id, 'yourself', true)}
                                                disabled={!!isProcessing}
                                                className="text-xs text-amber-600 hover:text-amber-800 font-bold px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-100 whitespace-nowrap"
                                            >
                                                Demote Self
                                            </button>
                                            {ownerCount > 1 && (
                                                <button
                                                    onClick={handleLeaveGroup}
                                                    disabled={!!isProcessing}
                                                    className="text-xs text-red-500 hover:text-red-700 font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors border border-red-100 whitespace-nowrap"
                                                >
                                                    Leave
                                                </button>
                                            )}
                                        </>
                                    )
                                ) : (
                                    <>
                                        {member.role === 'OWNER' ? (
                                            <button
                                                onClick={() => handleDemote(member.user_id, member.users.name || 'this user', false)}
                                                disabled={!!isProcessing}
                                                className="text-xs text-amber-600 hover:text-amber-800 font-bold px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-100 whitespace-nowrap"
                                            >
                                                Demote
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleTransferOwnership(member.user_id, member.users.name || 'this user')}
                                                disabled={!!isProcessing}
                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-100 whitespace-nowrap"
                                            >
                                                Make Owner
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleKick(member.user_id, member.users.name || 'this user')}
                                            disabled={!!isProcessing}
                                            className="text-xs text-red-500 hover:text-red-700 font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors border border-red-100 whitespace-nowrap"
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

            {/* Group Actions (Leave) - Only Visible in Edit Mode for Non-Owners */}
            {
                isEditing && !isOwner && (
                    <div className="mt-6 pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-top-2">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Danger Zone</h4>
                        <LeaveGroupButton
                            groupKeyword={groupKeyword}
                            groupName={groupName}
                        />
                    </div>
                )
            }
        </div >
    );
}
