'use client';

import { useState } from 'react';
import ProfileImageEditor from "@/components/ProfileImageEditor";
import BannerImageEditor from "@/components/BannerImageEditor";
import { useRouter } from 'next/navigation';
import PushSubscriptionButton from '@/components/PushSubscriptionButton';
import StepGoalForm from '@/components/StepGoalForm';

interface UserData {
    name: string | null;
    image: string | null;
    username: string | null;
    is_custom_image: boolean | null;
    step_goal: number | null;
    banner_url?: string | null;
}

export default function SettingsForm({ user }: { user: UserData }) {
    const [name, setName] = useState(user.name || '');
    const [username, setUsername] = useState(user.username || '');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();

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

            setMessage({ text: 'Profile updated successfully!', type: 'success' });
            router.refresh();
        } catch (error: any) {
            console.error(error);
            setMessage({ text: error.message || 'Failed to save changes.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Column: Profile Settings */}
            <section className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Profile Settings</h2>

                <div className="flex flex-col gap-8">
                    {/* Top Row: Images (Icon & Banner) */}
                    <div className="flex flex-col xl:flex-row items-center xl:items-start gap-8">
                        {/* Icon */}
                        <div className="flex flex-col items-center gap-4 shrink-0">
                            <div className="relative group">
                                {user.image ? (
                                    <img
                                        className="h-32 w-32 rounded-full border-4 border-white shadow-md bg-white object-cover"
                                        src={user.image}
                                        alt=""
                                    />
                                ) : (
                                    <div className="h-32 w-32 rounded-full border-4 border-white shadow-md bg-indigo-100 flex items-center justify-center text-5xl font-bold text-indigo-600">
                                        {(name?.[0] || 'U')}
                                    </div>
                                )}
                                <ProfileImageEditor initialImage={user.image} isCustom={user.is_custom_image || false} />
                            </div>
                            <p className="text-xs text-gray-500 font-medium">Profile photo</p>
                        </div>

                        {/* Banner Image */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative group w-full max-w-sm h-32 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                                {user.banner_url ? (
                                    <img
                                        className="w-full h-full object-cover"
                                        src={user.banner_url}
                                        alt="Banner"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-indigo-50 flex items-center justify-center text-xs text-indigo-400 font-medium">
                                        No Banner
                                    </div>
                                )}
                                {/* Edit Button */}
                                <div className="absolute bottom-2 right-2">
                                    <BannerImageEditor currentBanner={user.banner_url || null}>
                                        <div className="bg-white rounded-full p-1.5 shadow-md border border-gray-200 text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                            </svg>
                                        </div>
                                    </BannerImageEditor>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 font-medium">Banner</p>
                        </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-6 w-full max-w-xl">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2.5"
                                maxLength={50}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">User ID (Unique)</label>
                            <div className="relative rounded-md shadow-sm">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 sm:text-sm">@</span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full rounded-lg border-gray-300 pl-8 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2.5"
                                    maxLength={20}
                                    minLength={6}
                                    pattern="[a-zA-Z0-9_\-\.]+"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Visible in URLs and leaderboards. Min 6 chars (letters, numbers, <code>. - _</code>).</p>
                        </div>

                        {message && (
                            <div className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {message.type === 'success' ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                )}
                                {message.text}
                            </div>
                        )}

                        <div className="pt-2">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
                            >
                                {isSaving ? 'Saving...' : 'Save Profile Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Sidebar Column: Preferences */}
            <div className="space-y-8">
                {/* Daily Goal */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Daily Goal
                    </h2>
                    <p className="text-xs text-gray-500 mb-6 font-medium">Set your daily step target.</p>
                    <div className="w-full">
                        <StepGoalForm initialGoal={user.step_goal || 10000} />
                    </div>
                </section>

                {/* Notifications */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        Notifications
                    </h2>
                    <PushSubscriptionButton />
                </section>
            </div>
        </div>
    );
}
