'use client';

import { useState } from 'react';
import GroupMembersPanel from './GroupMembersPanel';
import DeleteGroupButton from './DeleteGroupButton';
import LeaveGroupButton from './LeaveGroupButton';

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
    const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Settings</h2>
                {/* Mobile Toggle */}
                <button
                    onClick={() => setIsMobileSettingsOpen(!isMobileSettingsOpen)}
                    className="lg:hidden text-sm font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full transition-colors"
                >
                    {isMobileSettingsOpen ? 'Hide' : 'Show'}
                </button>
            </div>

            <div className={`${isMobileSettingsOpen ? 'block' : 'hidden'} lg:block space-y-6`}>
                {/* Member Management */}
                <GroupMembersPanel
                    members={members}
                    groupKeyword={group.keyword}
                    isOwner={isOwner}
                    currentUserId={currentUserId}
                    isEditing={isEditing}
                    onToggleEdit={() => setIsEditing(!isEditing)}
                />

                {/* Owner Danger Zone (Visible only when editing) */}
                {isOwner && isEditing && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                        <DeleteGroupButton
                            groupKeyword={group.keyword}
                            groupName={group.name}
                        />
                    </div>
                )}

                {/* Leave Button (Non-Owners) */}
                {!isOwner && (
                    <LeaveGroupButton
                        groupKeyword={group.keyword}
                        groupName={group.name}
                    />
                )}
            </div>
        </div>
    );
}
