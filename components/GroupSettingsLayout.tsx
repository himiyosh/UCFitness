'use client';

import { useCallback, useState } from 'react';
import GroupMembersPanel from './GroupMembersPanel';

/** メンバー情報の型定義 */
interface GroupMember {
    id: string;
    username: string | null;
    display_name: string | null;
    profile_image: string | null;
    role?: string;
}

interface Props {
    members: GroupMember[];
    group: {
        id: string;
        name: string;
        keyword: string;
    };
    isOwner: boolean;
    currentUserId: string;
}

export default function GroupSettingsLayout({ members, group, isOwner, currentUserId }: Props) {
    const [isEditing, setIsEditing] = useState(false);

    const handleToggleEdit = useCallback(() => {
        setIsEditing(prev => !prev);
    }, []);

    return (
        <div className="space-y-8">
            {/* メンバー管理 */}
            <GroupMembersPanel
                members={members}
                groupKeyword={group.keyword}
                groupName={group.name}
                isOwner={isOwner}
                currentUserId={currentUserId}
                isEditing={isEditing}
                onToggleEdit={handleToggleEdit}
            />
        </div>
    );
}
