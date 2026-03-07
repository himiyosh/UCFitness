'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import EditGroupModal from './EditGroupModal';
import GroupSettingsLayout from './GroupSettingsLayout';

/** メンバー情報の型定義 */
interface GroupMember {
    user_id: string;
    role: 'OWNER' | 'MEMBER';
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
    /** メンバー一覧（メンバー管理モーダル用） */
    members?: GroupMember[];
    /** 現在のユーザーID */
    currentUserId?: string;
}

export default function GroupHeaderActions({ group, isOwner, members, currentUserId }: Props) {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isMembersOpen, setIsMembersOpen] = useState(false);
    const t = useTranslations('GroupDetail');

    const handleEditOpen = useCallback(() => setIsEditOpen(true), []);
    const handleEditClose = useCallback(() => setIsEditOpen(false), []);
    const handleMembersOpen = useCallback(() => setIsMembersOpen(true), []);
    const handleMembersClose = useCallback(() => setIsMembersOpen(false), []);

    return (
        <>
            {/* メンバー管理ボタン — 全メンバーに表示 */}
            <button
                onClick={handleMembersOpen}
                aria-label={t('settingsMembers')}
                className="bg-white/90 backdrop-blur-sm text-gray-700 hover:text-[var(--theme-primary)] px-3 py-1.5 rounded-full text-xs font-bold border border-gray-200 shadow-sm flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                {t('settingsMembers')}
            </button>

            {/* グループ編集ボタン — オーナーのみ */}
            {isOwner && (
                <button
                    onClick={handleEditOpen}
                    aria-label={t('editGroup')}
                    className="bg-white/90 backdrop-blur-sm text-gray-700 hover:text-[var(--theme-primary)] px-3 py-1.5 rounded-full text-xs font-bold border border-gray-200 shadow-sm flex items-center gap-1 hover:scale-105 active:scale-95 transition-all"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    {t('editGroup')}
                </button>
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
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    onClick={handleMembersClose}
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('settingsMembers')}
                >
                    {/* オーバーレイ */}
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                    {/* モーダル本体 */}
                    <div
                        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ヘッダー */}
                        <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h2 className="text-lg font-bold text-gray-900">{t('settingsMembers')}</h2>
                            <button
                                onClick={handleMembersClose}
                                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                                aria-label="Close"
                            >
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {/* コンテンツ */}
                        <div className="p-5">
                            {members && currentUserId ? (
                                <GroupSettingsLayout
                                    members={members}
                                    group={group}
                                    isOwner={isOwner}
                                    currentUserId={currentUserId}
                                />
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
