'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useLocale, useTranslations } from 'next-intl';

import { useDialogFocus } from '@/hooks/useDialogFocus';
import { parseTimestampMillis } from '@/lib/date-utils';
import { createGroupInviteUrl } from '@/lib/group-invite';

import Spinner from '@/components/ui/Spinner';

import EditGroupModal from './EditGroupModal';
import GroupSettingsLayout from './GroupSettingsLayout';

/** メンバー情報の型定義 */
interface GroupMember {
    user_id: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
    users: {
        id: string;
        name: string | null;
        image: string | null;
        username: string | null;
    };
}

interface Props {
    group: {
        id: string;
        keyword: string;
        name: string;
        image_url?: string;
        header_image_url?: string;
        is_public?: boolean;
    };
    isOwner: boolean;
    canCreateInviteLinks: boolean;
    /** メンバー一覧（メンバー管理モーダル用） */
    members?: GroupMember[];
    /** メンバー一覧の取得に失敗したか */
    membersUnavailable?: boolean;
    /** 一部のメンバー行だけ解析できなかったか */
    membersIncomplete?: boolean;
    /** 現在のユーザーID */
    currentUserId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export default function GroupHeaderActions({
    group,
    isOwner,
    canCreateInviteLinks,
    members,
    membersUnavailable = false,
    membersIncomplete = false,
    currentUserId,
}: Props) {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isMembersOpen, setIsMembersOpen] = useState(false);
    const [isCreatingInvite, setIsCreatingInvite] = useState(false);
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [inviteExpiresAt, setInviteExpiresAt] = useState<number | null>(null);
    const [inviteFeedback, setInviteFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
    const [canShare, setCanShare] = useState(false);
    const t = useTranslations('GroupDetail');
    const inviteT = useTranslations('GroupInvite');
    const commonT = useTranslations('Common');
    const locale = useLocale();
    const membersDialogRef = useRef<HTMLDivElement>(null);
    const membersCloseButtonRef = useRef<HTMLButtonElement>(null);
    const inviteInputRef = useRef<HTMLInputElement>(null);

    const handleEditOpen = useCallback(() => setIsEditOpen(true), []);
    const handleEditClose = useCallback(() => setIsEditOpen(false), []);
    const handleMembersOpen = useCallback(() => setIsMembersOpen(true), []);
    const handleMembersClose = useCallback(() => setIsMembersOpen(false), []);

    const handleCreateInvite = useCallback(async (): Promise<void> => {
        setIsCreatingInvite(true);
        setInviteFeedback(null);
        try {
            const response = await fetch('/api/group/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', groupId: group.id }),
            });
            const body: unknown = await response.json().catch(() => null);
            const value = isRecord(body) ? body : null;
            const token = value?.token;
            const expiresAt = value?.expiresAt;

            if (!response.ok || typeof token !== 'string' || typeof expiresAt !== 'string') {
                const code = value?.code;
                const key = code === 'FORBIDDEN'
                    ? 'createForbidden'
                    : code === 'INVITE_LIMIT_REACHED'
                        ? 'createLimit'
                        : 'createUnavailable';
                setInviteFeedback({ kind: 'error', message: inviteT(key) });
                return;
            }
            const expiresAtMillis = parseTimestampMillis(expiresAt);
            if (expiresAtMillis === null) {
                setInviteFeedback({ kind: 'error', message: inviteT('createUnavailable') });
                return;
            }

            const url = createGroupInviteUrl(window.location.origin, token);
            if (!url) {
                setInviteFeedback({ kind: 'error', message: inviteT('createUnavailable') });
                return;
            }
            setInviteUrl(url);
            setInviteExpiresAt(expiresAtMillis);
            setInviteFeedback({ kind: 'success', message: inviteT('createSuccess') });
        } catch {
            setInviteFeedback({ kind: 'error', message: inviteT('createNetworkError') });
        } finally {
            setIsCreatingInvite(false);
        }
    }, [group.id, inviteT]);

    const handleCopy = useCallback(async (): Promise<void> => {
        if (!inviteUrl) return;
        if (!navigator.clipboard?.writeText) {
            inviteInputRef.current?.focus();
            inviteInputRef.current?.select();
            setInviteFeedback({ kind: 'error', message: inviteT('copyFailed') });
            return;
        }
        try {
            await navigator.clipboard.writeText(inviteUrl);
            setInviteFeedback({ kind: 'success', message: inviteT('copySuccess') });
        } catch {
            inviteInputRef.current?.focus();
            inviteInputRef.current?.select();
            setInviteFeedback({ kind: 'error', message: inviteT('copyFailed') });
        }
    }, [inviteT, inviteUrl]);

    const handleShare = useCallback(async (): Promise<void> => {
        if (!inviteUrl || !navigator.share) return;
        try {
            await navigator.share({ title: group.name, text: inviteT('shareText'), url: inviteUrl });
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                setInviteFeedback({ kind: 'error', message: inviteT('shareFailed') });
            }
        }
    }, [group.name, inviteT, inviteUrl]);

    useEffect(() => {
        setCanShare(typeof navigator.share === 'function');
    }, []);

    useEffect(() => {
        if (inviteUrl) {
            inviteInputRef.current?.focus();
            inviteInputRef.current?.select();
        }
    }, [inviteUrl]);

    useDialogFocus({
        isOpen: isMembersOpen,
        onClose: handleMembersClose,
        dialogRef: membersDialogRef,
        initialFocusRef: membersCloseButtonRef,
    });

    return (
        <>
            {/* メンバー管理ボタン — 全メンバーに表示 */}
            <button
                onClick={handleMembersOpen}
                aria-label={t('settingsMembers')}
                className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-3 py-2 text-xs font-bold text-gray-700 shadow-sm transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                {t('settingsMembers')}
            </button>

            {/* グループ編集ボタン — オーナーのみ */}
            {isOwner && (
                <button
                    onClick={handleEditOpen}
                    aria-label={t('editGroup')}
                    className="flex min-h-[44px] items-center gap-1 rounded-full border border-gray-200 bg-white/90 px-3 py-2 text-xs font-bold text-gray-700 shadow-sm transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    {t('editGroup')}
                </button>
            )}

            {canCreateInviteLinks && !inviteUrl && (
                <button
                    type="button"
                    onClick={handleCreateInvite}
                    disabled={isCreatingInvite}
                    className="flex min-h-[44px] max-w-full min-w-0 items-center gap-1.5 rounded-full bg-[var(--color-primary-solid)] px-3 py-2 text-center text-xs font-bold text-white shadow-sm transition-colors [overflow-wrap:anywhere] hover:bg-[var(--color-inverse-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {isCreatingInvite && <Spinner size="xs" label={inviteT('creating')} />}
                    {inviteT(isCreatingInvite ? 'creating' : 'create')}
                </button>
            )}

            {canCreateInviteLinks && inviteUrl && inviteExpiresAt !== null && (
                <div className="w-full min-w-0 max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)] shadow-lg">
                    <label htmlFor="group-invite-link" className="block text-xs font-bold">{inviteT('linkLabel')}</label>
                    <input
                        ref={inviteInputRef}
                        id="group-invite-link"
                        value={inviteUrl}
                        readOnly
                        dir="ltr"
                        onFocus={(event) => event.currentTarget.select()}
                        className="mt-2 min-h-[44px] w-full min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-sm text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)]"
                    />
                    <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
                        {inviteT('expiresAt', {
                            date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
                                .format(inviteExpiresAt),
                        })}
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-[var(--color-primary)] px-3 text-center text-xs font-bold text-[var(--color-primary-strong)] transition-colors [overflow-wrap:anywhere] hover:bg-[var(--color-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)]"
                        >
                            {inviteT('copy')}
                        </button>
                        {canShare && (
                            <button
                                type="button"
                                onClick={handleShare}
                                className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-[var(--color-border)] px-3 text-center text-xs font-bold transition-colors [overflow-wrap:anywhere] hover:bg-[var(--color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)]"
                            >
                                {inviteT('share')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {inviteFeedback && (
                <p
                    role={inviteFeedback.kind === 'error' ? 'alert' : 'status'}
                    className="w-full max-w-sm rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs leading-5 text-[var(--color-text)]"
                >
                    {inviteFeedback.message}
                </p>
            )}

            <EditGroupModal
                groupId={group.id}
                groupKeyword={group.keyword}
                currentName={group.name}
                currentIcon={group.image_url}
                currentHeader={group.header_image_url}
                isVisible={group.is_public ?? true}
                isOpen={isEditOpen}
                onClose={handleEditClose}
            />

            {/* メンバー管理モーダル */}
            {isMembersOpen && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    onClick={handleMembersClose}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="group-members-dialog-title"
                >
                    {/* オーバーレイ */}
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                    {/* モーダル本体 */}
                    <div
                        ref={membersDialogRef}
                        tabIndex={-1}
                        className="relative max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ヘッダー */}
                        <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h2 id="group-members-dialog-title" className="text-lg font-bold text-gray-900">{t('settingsMembers')}</h2>
                            <button
                                ref={membersCloseButtonRef}
                                onClick={handleMembersClose}
                                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors hover:bg-gray-100"
                                aria-label={commonT('close')}
                            >
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {/* コンテンツ */}
                        <div className="p-5">
                            {membersUnavailable || (membersIncomplete && members?.length === 0) ? (
                                <p role="status" className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                                    {t('memberDataUnavailable')}
                                </p>
                            ) : members && currentUserId ? (
                                <div className="space-y-3">
                                    {membersIncomplete && (
                                        <p
                                            role="status"
                                            className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text)]"
                                        >
                                            {t('memberDataUnavailable')}
                                        </p>
                                    )}
                                    <GroupSettingsLayout
                                        members={members}
                                        group={group}
                                        isOwner={isOwner}
                                        currentUserId={currentUserId}
                                    />
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 text-center py-8">Loading...</p>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
