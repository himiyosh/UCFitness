'use client';

import { useCallback, useState } from 'react';
import GroupMembersPanel from './GroupMembersPanel';

/** メンバー情報の型定義（GroupMembersPanel の Member 型と一致） */
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
