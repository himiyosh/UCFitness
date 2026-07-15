'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';

import ImageModal from '@/components/ui/ImageModal';
import UserAvatar from '@/components/UserAvatar';
import { useToast } from '@/components/ui/Toast';
import { useDialogFocus } from '@/hooks/useDialogFocus';

import LeaveGroupButton from './LeaveGroupButton';

type Member = {
    user_id: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
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
    const [selectedImage, setSelectedImage] = useState<{ src: string, alt: string } | null>(null);
    const router = useRouter();
    const { success: toastSuccess, error: toastError } = useToast();
    const detailT = useTranslations('GroupDetail');
    const commonT = useTranslations('Common');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchAbortRef = useRef<AbortController | null>(null);
    const confirmDialogRef = useRef<HTMLDivElement>(null);
    const confirmCancelButtonRef = useRef<HTMLButtonElement>(null);

    useDialogFocus({
        isOpen: Boolean(confirmAction),
        onClose: () => setConfirmAction(null),
        dialogRef: confirmDialogRef,
        initialFocusRef: confirmCancelButtonRef,
    });

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
    }, [groupKeyword, router, toastSuccess, toastError, detailT]);

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
    }, [groupKeyword, router, toastSuccess, toastError, detailT]);

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
    }, [groupKeyword, router, toastError, detailT]);

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
                } else {
                    setSearchResults([]);
                    toastError(detailT('searchFailed'));
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                toastError(detailT('searchFailed'));
            } finally {
                setIsSearching(false);
            }
        }, 300);
    }, [detailT, members, toastError]);

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
            toastError(detailT('inviteFailed'));
        } finally {
            setIsProcessing(null);
        }
    }, [groupKeyword, router, toastSuccess, toastError, detailT]);


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
    }, [groupKeyword, groupName, router, toastError, detailT]);

    const ownerCount = useMemo(() => members.filter(m => m.role === 'OWNER').length, [members]);

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
                            type="button"
                            onClick={() => setIsInviteOpen(!isInviteOpen)}
                            className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-strong)] ${isInviteOpen ? 'bg-[var(--color-primary-solid)] text-white' : 'text-[var(--color-primary-strong)] bg-[var(--theme-primary-light)] hover:bg-[var(--theme-primary-light)] border border-[var(--theme-primary)]/20'}`}
                        >
                            {isInviteOpen ? detailT('close') : detailT('invite')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onToggleEdit}
                        className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-strong)] ${isEditing ? 'bg-gray-800 text-white' : 'text-[var(--color-text-muted)] hover:text-gray-900 hover:bg-gray-100'}`}
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
                        <label className="sr-only" htmlFor="group-member-search">
                            {detailT('searchLabel')}
                        </label>
                        <input
                            id="group-member-search"
                            type="text"
                            placeholder={detailT('searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            aria-busy={isSearching}
                            className="min-h-[44px] w-full rounded-lg border border-[var(--theme-primary)]/30 bg-white py-2 pl-4 pr-10 text-base text-gray-900 outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
                        />
                        {isSearching && (
                            <div className="absolute right-3 top-2.5">
                                <svg className="animate-spin h-4 w-4 text-[var(--theme-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            </div>
                        )}
                    </div>
                    <p className="sr-only" role="status" aria-live="polite">
                        {isSearching
                            ? detailT('searchInProgress')
                            : searchQuery.length >= 3 && searchResults.length > 0
                                ? detailT('searchResults', { count: searchResults.length })
                                : searchQuery.length >= 3
                                    ? detailT('noUsersFound')
                                    : ''}
                    </p>

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
                                        type="button"
                                        onClick={() => handleInvite(user.id)}
                                        disabled={!!isProcessing}
                                        className="min-h-[44px] min-w-[44px] rounded-lg bg-[var(--color-primary-solid)] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--color-primary-strong)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-strong)] focus-visible:ring-offset-2"
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
            {confirmAction && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setConfirmAction(null)}>
                    <div ref={confirmDialogRef} role="dialog" aria-modal="true" aria-labelledby="group-member-confirm-title" tabIndex={-1} className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl outline-none animate-fade-in" onClick={(e) => e.stopPropagation()}>
                        <h2 id="group-member-confirm-title" className="sr-only">{detailT('confirm')}</h2>
                        <p className="text-sm mb-4 text-[var(--foreground)]">{confirmAction.message}</p>
                        <div className="flex gap-2 justify-end">
                            <button
                                ref={confirmCancelButtonRef}
                                onClick={() => setConfirmAction(null)}
                                className="min-h-[44px] rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-[var(--foreground-muted)] transition-colors hover:bg-gray-100"
                            >
                                {detailT('cancel')}
                            </button>
                            <button
                                onClick={confirmAction.onConfirm}
                                className="min-h-[44px] rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--color-primary-strong)]"
                            >
                                {detailT('confirm')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            <ul className="divide-y divide-gray-100">
                {members.length === 0 && (
                    <li className="py-8 text-center">
                        <p className="text-sm text-[var(--foreground-muted)]">{detailT('noMembersYet')}</p>
                    </li>
                )}
                {members.map((member) => {
                    const memberName = member.users.name || detailT('unknownUser');
                    const memberImage = member.users.image;
                    return (
                        <li key={member.user_id} className="flex flex-col gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-gray-50 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:py-4">
                        <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            {memberImage ? (
                                <button
                                    type="button"
                                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-strong)] focus-visible:ring-offset-2"
                                    aria-label={detailT('viewAvatar', { name: memberName })}
                                    onClick={() => {
                                        setSelectedImage({ src: memberImage, alt: memberName });
                                    }}
                                >
                                    <UserAvatar src={memberImage} name={memberName} size="md" borderClass="border-gray-200" />
                                </button>
                            ) : (
                                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center">
                                    <UserAvatar src={null} name={memberName} size="md" borderClass="border-gray-200" />
                                </div>
                            )}

                            <div className="min-w-0">
                                {member.users.username ? (
                                    <Link
                                        href={`/user/${member.users.username}`}
                                        className="flex min-h-[44px] min-w-[44px] items-center gap-2 truncate text-sm font-medium text-[var(--foreground)] transition-colors hover:text-[var(--theme-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-strong)]"
                                        aria-label={detailT('viewProfile', { name: memberName })}
                                    >
                                        <span>{memberName}</span>
                                        {member.user_id === currentUserId && (
                                            <span className="shrink-0 rounded border border-[var(--theme-primary)]/20 bg-[var(--theme-primary-light)] px-1.5 py-0.5 text-xs font-bold text-[var(--theme-primary)]">{commonT('you')}</span>
                                        )}
                                    </Link>
                                ) : (
                                    <p className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                                        <span>{memberName}</span>
                                        {member.user_id === currentUserId && (
                                            <span className="shrink-0 rounded border border-[var(--theme-primary)]/20 bg-[var(--theme-primary-light)] px-1.5 py-0.5 text-xs font-bold text-[var(--theme-primary)]">{commonT('you')}</span>
                                        )}
                                    </p>
                                )}
                                <p className="text-xs text-gray-500 truncate">
                                    {member.role === 'OWNER'
                                        ? detailT('owner')
                                        : member.role === 'ADMIN'
                                            ? detailT('admin')
                                            : detailT('member')}
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        {isOwner && (
                            <div className={`flex w-full flex-wrap gap-1.5 sm:w-auto sm:shrink-0 sm:gap-2 ${!isEditing ? 'invisible pointer-events-none' : ''}`}>
                                {member.user_id === currentUserId ? (
                                    member.role === 'OWNER' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleDemote(member.user_id, memberName, true)}
                                                disabled={!!isProcessing}
                                                className="min-h-[44px] rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
                                            >
                                                {isProcessing === member.user_id ? '...' : detailT('demoteSelf')}
                                            </button>
                                            {ownerCount > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={handleLeaveGroup}
                                                    disabled={!!isProcessing}
                                                    className="min-h-[44px] rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 hover:text-red-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
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
                                                type="button"
                                                onClick={() => handleDemote(member.user_id, memberName, false)}
                                                disabled={!!isProcessing}
                                                className="min-h-[44px] rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
                                            >
                                                {isProcessing === member.user_id ? '...' : detailT('demote')}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => handleTransferOwnership(member.user_id, memberName)}
                                                disabled={!!isProcessing}
                                                className="min-h-[44px] rounded-lg border border-[var(--theme-primary)]/20 bg-[var(--theme-primary-light)] px-3 py-2 text-xs font-bold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--theme-primary-light)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-strong)]"
                                            >
                                                {isProcessing === member.user_id ? '...' : detailT('makeOwner')}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleKick(member.user_id, memberName)}
                                            disabled={!!isProcessing}
                                            className="min-h-[44px] rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 hover:text-red-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                                        >
                                            {isProcessing === member.user_id ? '...' : detailT('remove')}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                        </li>
                    );
                })}
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
