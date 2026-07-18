'use client';

import { useState } from 'react';
import ImageModal from '@/components/ui/ImageModal';
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
    children?: React.ReactNode;
}

export default function ProfileHeader({ user, badges = [], readonly = false, frameColor, titleName, titleEmoji, children }: ProfileHeaderProps) {
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
            <div className="relative z-10 overflow-visible rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-lg md:sticky md:top-20">
                {/* Banner */}
                <div
                    className={`h-32 sm:h-36 w-full rounded-t-xl bg-cover bg-center ${!user.banner_url ? 'bg-[var(--theme-primary)]' : 'cursor-pointer hover:opacity-90 transition-opacity'}`}
                    style={user.banner_url ? { backgroundImage: `url(${encodeURI(user.banner_url)})` } : {}}
                    onClick={() => user.banner_url && setIsBannerModalOpen(true)}
                    onKeyDown={(e) => { if (user.banner_url && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setIsBannerModalOpen(true); } }}
                    role={user.banner_url ? 'button' : undefined}
                    tabIndex={user.banner_url ? 0 : undefined}
                    aria-label={user.banner_url ? `View ${user.name}'s banner` : undefined}
                >
                </div>

                <div className="px-4 pb-2 sm:pb-3 relative">
                    {/* Profile Image with Frame */}
                    <div className="-mt-8 sm:-mt-12 mb-2 flex justify-center relative group/image">
                        <div
                            onClick={() => user.image && setIsImageModalOpen(true)}
                            onKeyDown={(e) => { if (user.image && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setIsImageModalOpen(true); } }}
                            role={user.image ? 'button' : undefined}
                            tabIndex={user.image ? 0 : undefined}
                            aria-label={user.image ? `View ${user.name}'s profile picture` : undefined}
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
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">{user.name}</h2>
                        <p className="text-xs sm:text-sm text-gray-500">@{user.username || 'user'}</p>

                        {/* カード内追加コンテンツ（シェアボタン等） */}
                        {children && (
                            <div className="mt-3 flex justify-center">
                                {children}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
