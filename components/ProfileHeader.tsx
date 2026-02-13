'use client';

import { useState } from 'react';
import ImageModal from '@/components/ImageModal';
import UserAvatar from '@/components/UserAvatar';

interface UserData {
    name: string | null;
    image: string | null;
    username: string | null;
    group_keyword: string[] | string | null;
    is_custom_image: boolean | null;
    banner_url?: string | null;
}

interface Badge {
    badge_code: string;
    period_date: string;
    badges: {
        name: string;
        category: string;
        type: string;
        rank: number;
    };
}

interface ProfileHeaderProps {
    user: UserData;
    badges?: Badge[];
    readonly?: boolean;
    frameColor?: string | null;
    titleName?: string | null;
    titleEmoji?: string | null;
}

export default function ProfileHeader({ user, badges = [], readonly = false, frameColor, titleName, titleEmoji }: ProfileHeaderProps) {
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);

    return (
        <div className="md:col-span-1">
            {/* Image Modal */}
            <ImageModal
                isOpen={isImageModalOpen}
                onClose={() => setIsImageModalOpen(false)}
                src={user.image}
                alt={`${user.name}'s profile picture`}
            />

            {/* Banner Image Modal */}
            <ImageModal
                isOpen={isBannerModalOpen}
                onClose={() => setIsBannerModalOpen(false)}
                src={user.banner_url || null}
                alt={`${user.name}'s banner`}
            />

            {/* Main Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 sticky top-8">
                {/* Banner */}
                <div
                    className={`h-32 sm:h-36 w-full rounded-t-xl bg-cover bg-center ${!user.banner_url ? 'bg-[var(--theme-primary)]' : 'cursor-pointer hover:opacity-90 transition-opacity'}`}
                    style={user.banner_url ? { backgroundImage: `url(${encodeURI(user.banner_url)})` } : {}}
                    onClick={() => user.banner_url && setIsBannerModalOpen(true)}
                >
                </div>

                <div className="px-4 pb-2 sm:pb-3 relative">
                    {/* Profile Image with Frame */}
                    <div className="-mt-8 sm:-mt-12 mb-2 flex justify-center relative group/image">
                        <div
                            onClick={() => user.image && setIsImageModalOpen(true)}
                            className={user.image ? 'cursor-pointer transition-transform hover:scale-105 active:scale-95' : ''}
                        >
                            <UserAvatar
                                src={user.image}
                                name={user.name}
                                size="lg"
                                frameColor={frameColor}
                                borderClass="border-white"
                                alt=""
                            />
                        </div>
                    </div>

                    <div className="text-center mb-2 sm:mb-4">
                        {/* 称号表示 */}
                        {titleName && (
                            <p className="text-xs font-bold text-[var(--theme-primary)] mb-1">
                                {titleEmoji && <span className="mr-1">{titleEmoji}</span>}
                                {titleName}
                            </p>
                        )}
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900">{user.name}</h1>
                        <p className="text-xs sm:text-sm text-gray-500">@{user.username || 'user'}</p>


                    </div>
                </div>
            </div>
        </div>
    );
}
