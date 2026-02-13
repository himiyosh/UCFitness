'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ImageModal from '@/components/ImageModal';
import UserAvatar from '@/components/UserAvatar';
import { useToast } from '@/components/Toast';
import { useTranslations } from 'next-intl';
import LeaveGroupButton from './LeaveGroupButton';

type Member = {
    user_id: string;
    role: 'OWNER' | 'MEMBER';
    users: {
        id: string;
        name: string | null;
        image: string | null;
        username: string | null;
    };
};

type SearchUser = {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
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
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
    const router = useRouter();
    const { success: toastSuccess, error: toastError } = useToast();
    const detailT = useTranslations('GroupDetail');
    const commonT = useTranslations('Common');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setMembers(initialMembers);
    }, [initialMembers]);

    const handleTransferOwnership = useCallback(async (targetId: string, memberName: string) => {
        setConfirmAction({
            message: detailT('confirmPromote', { name: memberName }),
            onConfirm: async () => {
                setConfirmAction(null);
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
                        const err = await res.json().catch(() => ({}));
                        toastError(err.error || detailT('promoteFailed'));
                        return;
                    }

                    toastSuccess(detailT('promoteSuccess', { name: memberName }));
                    router.refresh();
                } catch {
                    toastError(detailT('errorOccurred'));
                } finally {
                    setIsProcessing(null);
                }
            }
        });
    }, [groupKeyword, router, toastSuccess, toastError]);

    const handleDemote = useCallback(async (targetId: string, memberName: string, isSelf: boolean) => {
        const msg = isSelf
            ? detailT('confirmDemoteSelf')
            : detailT('confirmDemote', { name: memberName });

        setConfirmAction({
            message: msg,
            onConfirm: async () => {
                setConfirmAction(null);
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
                        const err = await res.json().catch(() => ({}));
                        toastError(err.error || detailT('demoteFailed'));
                        return;
                    }

                    toastSuccess(isSelf ? detailT('demoteSelfSuccess') : detailT('demoteSuccess', { name: memberName }));
                    router.refresh();
                } catch {
                    toastError(detailT('errorOccurred'));
                } finally {
                    setIsProcessing(null);
                }
            }
        });
    }, [groupKeyword, router, toastSuccess, toastError]);

    const handleKick = useCallback(async (targetId: string, memberName: string) => {
        setConfirmAction({
            message: detailT('confirmRemove', { name: memberName }),
            onConfirm: async () => {
                setConfirmAction(null);
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
                        const err = await res.json().catch(() => ({}));
                        toastError(err.error || detailT('removeFailed'));
                        return;
                    }

                    setMembers(prev => prev.filter(m => m.user_id !== targetId));
                    router.refresh();
                } catch {
                    toastError(detailT('errorOccurred'));
                } finally {
                    setIsProcessing(null);
                }
            }
        });
    }, [groupKeyword, router, toastError]);

    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (query.length < 3) {
            setSearchResults([]);
            return;
        }

        // デバウンス: 前回のタイマーをクリア
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

        searchTimerRef.current = setTimeout(async () => {
            // 前回のリクエストをキャンセル（race condition 防止）
            searchAbortRef.current?.abort();
            const controller = new AbortController();
            searchAbortRef.current = controller;

            setIsSearching(true);
            try {
                const res = await fetch(`/api/user/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal
                });
                const data = await res.json();
                if (res.ok) {
                    const existingIds = new Set(members.map(m => m.user_id));
                    const filtered = (data.users || []).filter((u: SearchUser) => !existingIds.has(u.id));
                    setSearchResults(filtered);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                toastError('Search failed. Please try again.');
            } finally {
                setIsSearching(false);
            }
        }, 300);
    }, [members, toastError]);

    const handleInvite = useCallback(async (userId: string) => {
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
                const err = await res.json().catch(() => ({}));
                toastError(err.error || detailT('inviteFailed'));
                return;
            }

            toastSuccess(detailT('inviteSuccess'));
            setSearchQuery('');
            setSearchResults([]);
            setIsInviteOpen(false);
            router.refresh();
        } catch {
            toastError('Failed to invite user');
        } finally {
            setIsProcessing(null);
        }
    }, [groupKeyword, router, toastSuccess, toastError]);


    const handleLeaveGroup = useCallback(async () => {
        setConfirmAction({
            message: detailT('confirmLeave', { name: groupName }),
            onConfirm: async () => {
                setConfirmAction(null);
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
                        const err = await res.json().catch(() => ({}));
                        toastError(err.error || detailT('leaveFailed'));
                        return;
                    }

                    router.push('/groups');
                    router.refresh();
                } catch {
                    toastError(detailT('errorOccurred'));
                }
            }
        });
    }, [groupKeyword, groupName, router, toastError]);

    const ownerCount = useMemo(() => members.filter(m => m.role === 'OWNER').length, [members]);
    const [selectedImage, setSelectedImage] = useState<{ src: string, alt: string } | null>(null);

    // デバウンスタイマーのクリーンアップ
    useEffect(() => {
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            searchAbortRef.current?.abort();
        };
    }, []);

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
                    <h3 className="font-bold text-[var(--foreground)]">{detailT('membersCount', { count: members.length })}</h3>
                    {isOwner && <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">{detailT('owner')}</span>}
                </div>
                <div className="flex gap-2">
                    {isOwner && (
                        <button
                            onClick={() => setIsInviteOpen(!isInviteOpen)}
                            className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${isInviteOpen ? 'bg-[var(--theme-primary)] text-white' : 'text-[var(--theme-primary)] bg-[var(--theme-primary-light)] hover:bg-[var(--theme-primary-light)] border border-[var(--theme-primary)]/20'}`}
                        >
                            {isInviteOpen ? detailT('close') : detailT('invite')}
                        </button>
                    )}
                    <button
                        onClick={onToggleEdit}
                        className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${isEditing ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                    >
                        {isEditing ? detailT('done') : detailT('edit')}
                    </button>
                </div>
            </div>

            {/* Invite Panel */}
            {isInviteOpen && (
                <div className="p-4 bg-[var(--theme-primary-light)] border-b border-[var(--theme-primary)]/20 animate-fade-in">
                    <p className="text-sm text-[var(--theme-primary)] mb-2 font-bold">{detailT('inviteNewMember')}</p>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder={detailT('searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="w-full pl-4 pr-4 py-2 text-sm text-gray-900 border border-[var(--theme-primary)]/30 rounded-lg focus:ring-2 focus:ring-[var(--theme-primary)] outline-none bg-white"
                        />
                        {isSearching && (
                            <div className="absolute right-3 top-2.5">
                                <svg className="animate-spin h-4 w-4 text-[var(--theme-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            </div>
                        )}
                    </div>

                    {/* Results */}
                    {searchResults.length > 0 && (
                        <div className="mt-3 bg-white rounded-lg border border-[var(--theme-primary)]/20 shadow-sm max-h-48 overflow-y-auto">
                            {searchResults.map(user => (
                                <div key={user.id} className="p-3 flex items-center justify-between hover:bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <UserAvatar src={user.image} name={user.name || '?'} size="sm" borderClass="border-gray-200" />
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{user.name}</p>
                                            <p className="text-xs text-gray-500">@{user.username || user.id.substring(0, 8)}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleInvite(user.id)}
                                        disabled={!!isProcessing}
                                        className="text-xs font-bold text-white bg-[var(--theme-primary)] px-3 py-1.5 rounded hover:bg-[var(--theme-primary)]/90 transition-colors disabled:opacity-50"
                                    >
                                        {isProcessing === user.id ? detailT('adding') : detailT('add')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {searchQuery.length >= 3 && searchResults.length === 0 && !isSearching && (
                        <p className="text-xs text-[var(--theme-primary)]/70 mt-2">{detailT('noUsersFound')}</p>
                    )}
                </div>
            )}

            {/* 確認ダイアログ（alert/confirm の代替） */}
            {confirmAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmAction(null)}>
                    <div className="bg-white rounded-xl shadow-xl p-6 mx-4 max-w-sm w-full animate-fade-in" onClick={(e) => e.stopPropagation()}>
                        <p className="text-sm mb-4 text-[var(--foreground)]">{confirmAction.message}</p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmAction(null)}
                                className="text-xs font-bold px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors text-[var(--foreground-muted)]"
                            >
                                {detailT('cancel')}
                            </button>
                            <button
                                onClick={confirmAction.onConfirm}
                                className="text-xs font-bold px-4 py-2 rounded-lg bg-[var(--theme-primary)] text-white hover:opacity-90 transition-opacity"
                            >
                                {detailT('confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ul className="divide-y divide-gray-100">
                {members.length === 0 && (
                    <li className="py-8 text-center">
                        <p className="text-sm text-[var(--foreground-muted)]">{detailT('noMembersYet')}</p>
                    </li>
                )}
                {members.map((member) => (
                    <li key={member.user_id} className="py-3 sm:py-4 grid grid-cols-[1fr_auto] gap-4 items-center hover:bg-gray-50 transition-colors rounded-lg px-2">
                        <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            <div
                                className="h-10 w-10 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={(e) => {
                                    e.preventDefault(); // Prevent Link navigation
                                    if (member.users.image) {
                                        setSelectedImage({ src: member.users.image, alt: member.users.name || 'User' });
                                    }
                                }}
                            >
                                <UserAvatar src={member.users.image} name={member.users.name || '?'} size="md" borderClass="border-gray-200" />
                            </div>

                            <div className="min-w-0">
                                <Link href={member.users.username ? `/user/${member.users.username}` : '#'} className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--theme-primary)] transition-colors truncate block flex items-center gap-2" aria-label={`View profile of ${member.users.name || detailT('unknownUser')}`}>
                                    <span>{member.users.name || detailT('unknownUser')}</span>
                                    {member.user_id === currentUserId && (
                                        <span className="text-[10px] font-bold text-[var(--theme-primary)] bg-[var(--theme-primary-light)] px-1.5 py-0.5 rounded border border-[var(--theme-primary)]/20 shrink-0">{commonT('you')}</span>
                                    )}
                                </Link>
                                <p className="text-xs text-gray-500 truncate">
                                    {member.role === 'OWNER' ? detailT('owner') : detailT('member')}
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
                                                {detailT('demoteSelf')}
                                            </button>
                                            {ownerCount > 1 && (
                                                <button
                                                    onClick={handleLeaveGroup}
                                                    disabled={!!isProcessing}
                                                    className="text-xs text-red-500 hover:text-red-700 font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors border border-red-100 whitespace-nowrap"
                                                >
                                                    {detailT('leave')}
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
                                                {detailT('demote')}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleTransferOwnership(member.user_id, member.users.name || 'this user')}
                                                disabled={!!isProcessing}
                                                className="text-xs text-[var(--theme-primary)] hover:text-[var(--theme-primary)] font-bold px-3 py-1.5 rounded-lg bg-[var(--theme-primary-light)] hover:bg-[var(--theme-primary-light)] transition-colors border border-[var(--theme-primary)]/20 whitespace-nowrap"
                                            >
                                                {detailT('makeOwner')}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleKick(member.user_id, member.users.name || 'this user')}
                                            disabled={!!isProcessing}
                                            className="text-xs text-red-500 hover:text-red-700 font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors border border-red-100 whitespace-nowrap"
                                        >
                                            {isProcessing === member.user_id ? '...' : detailT('remove')}
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
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">{detailT('dangerZone')}</h4>
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
