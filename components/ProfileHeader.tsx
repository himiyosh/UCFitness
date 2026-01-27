'use client';

import { useState } from 'react';
import ImageModal from '@/components/ImageModal';

interface UserData {
    name: string | null;
    image: string | null;
    username: string | null;
    group_keyword: string[] | string | null;
    is_custom_image: boolean | null;
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

    return (
        <div className="md:col-span-1">
            {/* Image Modal */}
            <ImageModal
                isOpen={isImageModalOpen}
                onClose={() => setIsImageModalOpen(false)}
                src={user.image}
                alt={`${user.name}'s profile picture`}
            />

            {/* Main Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 sticky top-8">
                {/* Banner */}
                <div className="bg-indigo-600 h-16 sm:h-24 w-full rounded-t-xl"></div>

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
                            <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-full border-4 border-white shadow-md bg-indigo-100 flex items-center justify-center text-2xl sm:text-3xl font-bold text-indigo-600">
                                {(user.name?.[0] || 'U')}
                            </div>
                        )}
                    </div>

                    <div className="text-center mb-4 sm:mb-6">
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900">{user.name}</h1>
                        <p className="text-xs sm:text-sm text-gray-500">@{user.username || 'user'}</p>

                        {user.group_keyword && (
                            <div className="mt-2">
                                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-indigo-700">
                                    Group: {Array.isArray(user.group_keyword) ? user.group_keyword.join(', ') : user.group_keyword}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
