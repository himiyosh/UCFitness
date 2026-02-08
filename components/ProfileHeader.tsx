'use client';

import { useState } from 'react';
import ImageModal from '@/components/ImageModal';

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

export default function ProfileHeader({ user, badges = [], readonly = false }: { user: UserData; badges?: Badge[]; readonly?: boolean }) {
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
                    className={`h-24 sm:h-32 w-full rounded-t-xl bg-cover bg-center ${!user.banner_url ? 'bg-[var(--theme-primary)]' : 'cursor-pointer hover:opacity-90 transition-opacity'}`}
                    style={user.banner_url ? { backgroundImage: `url(${user.banner_url})` } : {}}
                    onClick={() => user.banner_url && setIsBannerModalOpen(true)}
                >
                </div>

                <div className="px-4 pb-3 sm:pb-4 relative">
                    {/* Profile Image */}
                    <div className="-mt-8 sm:-mt-12 mb-3 flex justify-center relative group/image">
                        {user.image ? (
                            <div
                                onClick={() => setIsImageModalOpen(true)}
                                className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                            >
                                <img className="h-16 w-16 sm:h-24 sm:w-24 rounded-full border-4 border-white shadow-md bg-white object-cover" src={user.image} alt="" />
                            </div>
                        ) : (
                            <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-full border-4 border-white shadow-md bg-[var(--theme-primary-light)] flex items-center justify-center text-2xl sm:text-3xl font-bold text-[var(--theme-primary)]">
                                {(user.name?.[0] || 'U')}
                            </div>
                        )}
                    </div>

                    <div className="text-center mb-4 sm:mb-6">
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900">{user.name}</h1>
                        <p className="text-xs sm:text-sm text-gray-500">@{user.username || 'user'}</p>


                    </div>
                </div>
            </div>
        </div>
    );
}
