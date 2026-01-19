'use client';

import { useState } from 'react';
import ProfileImageEditor from "@/components/ProfileImageEditor";
import { useRouter } from 'next/navigation';
import ImageModal from '@/components/ImageModal';

interface UserData {
    name: string | null;
    image: string | null;
    username: string | null;
    group_keyword: string[] | string | null;
    is_custom_image: boolean | null;
}

export default function ProfileHeader({ user, readonly = false }: { user: UserData; readonly?: boolean }) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(user.name || '');
    const [username, setUsername] = useState(user.username || '');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();

    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);

        try {
            // Update Name
            const nameRes = await fetch('/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!nameRes.ok) throw new Error('Failed to update name');

            // Update Username
            const usernameRes = await fetch('/api/user/username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });

            const usernameData = await usernameRes.json();
            if (!usernameRes.ok) throw new Error(usernameData.error || 'Failed to update ID');

            setMessage({ text: 'Profile updated!', type: 'success' });
            router.refresh();
            setIsEditing(false);
        } catch (error: any) {
            console.error(error);
            setMessage({ text: error.message || 'Failed to save changes.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setName(user.name || '');
        setUsername(user.username || '');
        setMessage(null);
    };

    return (
        <div className="md:col-span-1">
            {/* Image Modal */}
            <ImageModal
                isOpen={isImageModalOpen}
                onClose={() => setIsImageModalOpen(false)}
                src={user.image}
                alt={`${user.name}'s profile picture`}
            />

            <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 sticky top-8">
                <div className="bg-indigo-600 h-16 sm:h-24 w-full"></div>
                <div className="px-4 pb-3 sm:pb-4 relative">
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
                        {!readonly && <ProfileImageEditor initialImage={user.image} isCustom={user.is_custom_image || false} />}
                    </div>

                    <div className="text-center mb-4 sm:mb-6">
                        {!isEditing ? (
                            <>
                                <h1 className="text-lg sm:text-xl font-bold text-gray-900">{user.name}</h1>
                                <p className="text-xs sm:text-sm text-gray-500">@{user.username || 'user'}</p>

                                {user.group_keyword && (
                                    <div className="mt-2">
                                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-indigo-700">
                                            Group: {Array.isArray(user.group_keyword) ? user.group_keyword.join(', ') : user.group_keyword}
                                        </span>
                                    </div>
                                )}

                                {!readonly && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="mt-3 sm:mt-4 px-3 py-1 sm:px-4 sm:py-1.5 bg-gray-100 text-gray-700 text-[10px] sm:text-xs font-bold rounded-full hover:bg-gray-200 transition-colors inline-flex items-center gap-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3L10.58 12.42a4 4 0 01-1.343.886l-3.155 1.262a.5.5 0 01-.65-.65z" />
                                            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                        </svg>
                                        Edit Profile
                                    </button>
                                )}
                            </>
                        ) : (
                            <div className="animate-in fade-in zoom-in-95 duration-200 space-y-3 text-left">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1 text-left">Display Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                        placeholder="Display Name"
                                        maxLength={50}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1 text-left">User ID</label>
                                    <div className="flex items-center gap-1">
                                        <span className="text-gray-400 select-none">@</span>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                            placeholder="User ID"
                                            maxLength={20}
                                            pattern="[a-zA-Z0-9_]+"
                                        />
                                    </div>
                                </div>

                                {message && (
                                    <p className={`text-xs ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                        {message.text}
                                    </p>
                                )}

                                <div className="pt-2 flex gap-2">
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                        onClick={handleCancel}
                                        disabled={isSaving}
                                        className="flex-1 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
