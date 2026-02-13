'use client';

import { useState, useCallback } from 'react';
import EditGroupModal from './EditGroupModal';

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
}

export default function GroupHeaderActions({ group, isOwner }: Props) {
    const [isEditOpen, setIsEditOpen] = useState(false);

    const handleOpen = useCallback(() => setIsEditOpen(true), []);
    const handleClose = useCallback(() => setIsEditOpen(false), []);

    if (!isOwner) return null;

    return (
        <>
            <button
                onClick={handleOpen}
                aria-label={`Edit group ${group.name}`}
                className="bg-white/90 backdrop-blur-sm text-gray-700 hover:text-[var(--theme-primary)] px-3 py-1.5 rounded-full text-xs font-bold border border-gray-200 shadow-sm flex items-center gap-1 transition-colors"
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Edit Group
            </button>

            <EditGroupModal
                groupId={group.id}
                groupKeyword={group.keyword}
                currentName={group.name}
                currentIcon={group.image_url}
                currentHeader={group.header_image_url}
                isVisible={group.is_public ?? true}
                isOpen={isEditOpen}
                onClose={handleClose}
            />
        </>
    );
}
