'use client';

import { useState } from 'react';
import GroupMembersPanel from './GroupMembersPanel';

interface Props {
    members: any[];
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

    return (
        <div className="space-y-8">
            {/* Member Management */}
            <GroupMembersPanel
                members={members}
                groupKeyword={group.keyword}
                groupName={group.name}
                isOwner={isOwner}
                currentUserId={currentUserId}
                isEditing={isEditing}
                onToggleEdit={() => setIsEditing(!isEditing)}
            />
        </div>
    );
}
