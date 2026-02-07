'use client';

import { useState } from 'react';
import ProfileImageEditor from "@/components/ProfileImageEditor";
import BannerImageEditor from "@/components/BannerImageEditor";
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/navigation';
import { useSession } from 'next-auth/react'; // Import useSession
import { useTheme, Theme } from '@/components/ThemeProvider';
import PushNotificationManager from '@/components/PushNotificationManager';
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
    const [switchingLocale, setSwitchingLocale] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter(); // Use navigation router
    const pathname = usePathname();
    const locale = useLocale();
    const t = useTranslations('Settings');
    const commonT = useTranslations('Common');
    const { update } = useSession(); // Get update function
    const { theme, setTheme } = useTheme(); // Theme hook

    const handleLanguageChange = async (newLocale: string) => {
        if (switchingLocale) return;
        setSwitchingLocale(newLocale);
        try {
            // Use API Route instead of Server Action
            const res = await fetch('/api/user/language', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: newLocale }),
            });

            if (!res.ok) {
                throw new Error('Failed to update language');
            }

            await update({ user: { language: newLocale } }); // Update session immediately
            router.replace(pathname, { locale: newLocale });
            router.refresh();
        } catch (e) {
            console.error("Failed to update language:", e);
            setSwitchingLocale(null);
        }
    };

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

            setMessage({ text: t('saveSuccess'), type: 'success' }); // Use translation
            router.refresh();
        } catch (error: any) {
            console.error(error);
            setMessage({ text: error.message || t('saveError'), type: 'error' }); // Use translation
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Column: Profile Settings */}
            <section className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                <h2 className="text-xl font-bold text-gray-900 mb-6">{t('profileSettings')}</h2>

                <div className="flex flex-col gap-8">
                    {/* Profile Visuals (Banner + Avatar) */}
                    <div className="relative mb-6">
                        {/* Banner Image */}
                        <div className="relative group w-full h-48 sm:h-64 bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                            {user.banner_url ? (
                                <img
                                    className="w-full h-full object-cover"
                                    src={user.banner_url}
                                    alt="Banner"
                                />
                            ) : (
                                <div className="w-full h-full bg-[var(--theme-primary-light)] flex items-center justify-center text-xs text-[var(--theme-primary)]/70 font-medium">
                                    {t('noBanner')}
                                </div>
                            )}

                            {/* Edit Banner Button (Bottom Right) */}
                            <div className="absolute bottom-4 right-4 z-10">
                                <BannerImageEditor currentBanner={user.banner_url || null}>
                                    <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-200 text-gray-700 hover:text-[var(--theme-primary)] transition-all cursor-pointer flex items-center gap-2 font-bold text-xs hover:bg-white">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                        </svg>
                                        {t('banner')}
                                    </div>
                                </BannerImageEditor>
                            </div>
                        </div>

                        {/* Avatar Image (Overlapping) */}
                        <div className="absolute -bottom-12 left-6 sm:left-10">
                            <div className="relative group">
                                {user.image ? (
                                    <img
                                        className="h-24 w-24 sm:h-32 sm:w-32 rounded-full border-4 border-white shadow-md bg-white object-cover"
                                        src={user.image}
                                        alt=""
                                    />
                                ) : (
                                    <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-full border-4 border-white shadow-md bg-[var(--theme-primary-light)] flex items-center justify-center text-4xl font-bold text-[var(--theme-primary)]">
                                        {(name?.[0] || 'U')}
                                    </div>
                                )}
                                <ProfileImageEditor initialImage={user.image} isCustom={user.is_custom_image || false} />
                            </div>
                        </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-6 w-full max-w-xl">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('displayName')}</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-[var(--theme-primary)] focus:ring-[var(--theme-primary)] sm:text-sm py-2.5 text-gray-900"
                                maxLength={50}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('userId')} {t('unique')}</label>
                            <div className="relative rounded-md shadow-sm">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 sm:text-sm">@</span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full rounded-lg border-gray-300 pl-8 focus:border-[var(--theme-primary)] focus:ring-[var(--theme-primary)] sm:text-sm py-2.5 text-gray-900"
                                    maxLength={20}
                                    minLength={6}
                                    pattern="[a-zA-Z0-9_\-\.]+"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1" dangerouslySetInnerHTML={{ __html: t.raw('usernameHint') }} />
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
                                className="px-6 py-2.5 bg-[var(--theme-primary)] text-white text-sm font-bold rounded-lg hover:bg-[var(--theme-primary)]/90 disabled:opacity-50 transition-all shadow-sm hover:shadow-md flex items-center gap-2 justify-center"
                            >
                                {isSaving && (
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {isSaving ? t('saving') : t('saveChanges')}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Sidebar Column: Preferences */}
            <div className="space-y-8">

                {/* Language Switcher */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                        {commonT('language')}
                    </h2>
                    <p className="text-xs text-gray-500 mb-6 font-medium">{t('languageDescription')}</p>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => handleLanguageChange('ja')}
                            disabled={!!switchingLocale}
                            className={`w-full px-4 py-2 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${locale === 'ja'
                                ? 'bg-[var(--theme-primary-light)] border-[var(--theme-primary)]/30 text-[var(--theme-primary)]'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                日本語
                                {switchingLocale === 'ja' && (
                                    <svg className="animate-spin h-3.5 w-3.5 text-[var(--theme-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                            </span>
                            {locale === 'ja' && !switchingLocale && <span className="text-[var(--theme-primary)]">✓</span>}
                        </button>
                        <button
                            onClick={() => handleLanguageChange('en')}
                            disabled={!!switchingLocale}
                            className={`w-full px-4 py-2 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${locale === 'en'
                                ? 'bg-[var(--theme-primary-light)] border-[var(--theme-primary)]/30 text-[var(--theme-primary)]'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                English
                                {switchingLocale === 'en' && (
                                    <svg className="animate-spin h-3.5 w-3.5 text-[var(--theme-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                            </span>
                            {locale === 'en' && !switchingLocale && <span className="text-[var(--theme-primary)]">✓</span>}
                        </button>
                    </div>
                </section>

                {/* Theme Switcher */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                        {t('theme')}
                    </h2>
                    <p className="text-xs text-gray-500 mb-6 font-medium">{t('themeDescription')}</p>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => setTheme('classic')}
                            className={`w-full px-4 py-3 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${theme === 'classic'
                                ? 'bg-[var(--theme-primary-light)] border-[var(--theme-primary)]/30 text-[var(--theme-primary)]'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <span className="flex items-center gap-3">
                                <span className="w-6 h-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"></span>
                                Classic
                            </span>
                            {theme === 'classic' && <span className="text-[var(--theme-primary)]">✓</span>}
                        </button>
                        <button
                            onClick={() => setTheme('pop')}
                            className={`w-full px-4 py-3 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${theme === 'pop'
                                ? 'bg-pink-50 border-pink-200 text-pink-700'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <span className="flex items-center gap-3">
                                <span className="w-6 h-6 rounded-full bg-gradient-to-r from-[var(--accent-coral)] via-[var(--accent-pink)] to-[var(--accent-purple)]"></span>
                                Pop & Fun 🎨
                            </span>
                            {theme === 'pop' && <span className="text-pink-600">✓</span>}
                        </button>
                        <button
                            onClick={() => setTheme('midnight')}
                            className={`w-full px-4 py-3 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${theme === 'midnight'
                                ? 'bg-slate-900 border-slate-700 text-indigo-400'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <span className="flex items-center gap-3 whitespace-nowrap">
                                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-600 via-slate-900 to-slate-950 border border-indigo-400/50 shadow-[0_0_6px_rgba(99,102,241,0.4)] shrink-0"></span>
                                Midnight (Dark) 🌙
                                <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 ml-1 shrink-0">Beta</span>
                            </span>
                            {theme === 'midnight' && <span className="text-indigo-400">✓</span>}
                        </button>
                    </div>
                </section>

                {/* Daily Goal */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5 text-[var(--theme-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        {t('dailyGoal')}
                    </h2>
                    <p className="text-xs text-gray-500 mb-6 font-medium">{t('setDailyGoal')}</p>
                    <div className="w-full">
                        <StepGoalForm initialGoal={user.step_goal || 10000} />
                    </div>
                </section>

                {/* Notifications */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        {t('notifications')}
                    </h2>
                    <PushNotificationManager />
                </section>
            </div>
        </div>
    );
}
