'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import ProfileImageEditor from "@/components/ProfileImageEditor";
import BannerImageEditor from "@/components/BannerImageEditor";
import ImageModal from "@/components/ImageModal";
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname, Link } from '@/navigation';
import { useSession } from 'next-auth/react'; // Import useSession
import { useTheme, Theme } from '@/components/ThemeProvider';
import Spinner from '@/components/ui/Spinner';
import PushNotificationManager from '@/components/PushNotificationManager';
import UserAvatar from '@/components/UserAvatar';
import { getFrameColor } from '@/components/UserAvatar';
import TitleSelector, { type OwnedTitle } from '@/components/TitleSelector';
import FrameSelector, { type OwnedFrame } from '@/components/FrameSelector';
import StepGoalForm from '@/components/StepGoalForm';


interface UserData {
    name: string | null;
    image: string | null;
    username: string | null;
    is_custom_image: boolean | null;
    step_goal: number | null;
    banner_url?: string | null;
}

export default function SettingsForm({ user, ownsMidnight = false, ownedTitles = [], ownedFrames = [] }: { user: UserData; ownsMidnight?: boolean; ownedTitles?: OwnedTitle[]; ownedFrames?: OwnedFrame[] }) {
    const [name, setName] = useState(user.name || '');
    const [username, setUsername] = useState(user.username || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
    const [switchingLocale, setSwitchingLocale] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // フレームカラーのリアクティブ状態（遅延初期化で不要な再計算を防止）
    const [activeFrameColor, setActiveFrameColor] = useState<string | null>(() => {
        const equipped = ownedFrames.find(f => f.isEquipped);
        return equipped ? getFrameColor(equipped.previewValue) : null;
    });
    const router = useRouter(); // Use navigation router
    const pathname = usePathname();
    const locale = useLocale();
    const t = useTranslations('Settings');
    const commonT = useTranslations('Common');
    const { update } = useSession(); // Get update function
    const { theme, setTheme } = useTheme(); // Theme hook

    // S3: プロフィール完成度の計算
    const completionItems = useMemo(() => [
        { key: 'name', label: t('displayName'), done: !!user.name && user.name.trim().length > 0 },
        { key: 'username', label: t('userId'), done: !!user.username && user.username.trim().length > 0 },
        { key: 'banner', label: t('banner'), done: !!user.banner_url },
        { key: 'image', label: t('profilePhoto'), done: !!user.is_custom_image },
        { key: 'goal', label: t('dailyGoal'), done: !!user.step_goal && user.step_goal > 0 },
    ], [user.name, user.username, user.banner_url, user.is_custom_image, user.step_goal, t]);
    const completionPercent = useMemo(
        () => Math.round((completionItems.filter(i => i.done).length / completionItems.length) * 100),
        [completionItems]
    );

    // Midnight を所有していないのに適用中の場合、classic にリセット
    useEffect(() => {
        if (theme === 'midnight' && !ownsMidnight) {
            setTheme('classic');
        }
    }, [theme, ownsMidnight, setTheme]);

    const handleLanguageChange = useCallback(async (newLocale: string) => {
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
        } catch {
            setSwitchingLocale(null);
        }
    }, [switchingLocale, update, router, pathname]);

    const handleSave = useCallback(async () => {
        const trimmedName = name.trim();
        const trimmedUsername = username.trim();

        if (!trimmedName || !trimmedUsername) {
            setMessage({ text: t('saveError'), type: 'error' });
            return;
        }

        setIsSaving(true);
        setMessage(null);

        try {
            // 名前とユーザー名を並列で更新
            const [nameRes, usernameRes] = await Promise.all([
                fetch('/api/user/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: trimmedName }),
                }),
                fetch('/api/user/username', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: trimmedUsername }),
                }),
            ]);
            if (!nameRes.ok) throw new Error('Failed to update name');

            const usernameData = await usernameRes.json();
            if (!usernameRes.ok) throw new Error(usernameData.error || 'Failed to update ID');

            setMessage({ text: t('saveSuccess'), type: 'success' });
            router.refresh();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : t('saveError');
            setMessage({ text: msg, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    }, [name, username, router, t]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* フルサイズプレビュー用モーダル */}
            <ImageModal
                isOpen={isImageModalOpen}
                onClose={() => setIsImageModalOpen(false)}
                src={user.image}
                alt="Profile"
            />
            <ImageModal
                isOpen={isBannerModalOpen}
                onClose={() => setIsBannerModalOpen(false)}
                src={user.banner_url || null}
                alt="Banner"
            />

            {/* Main Column */}
            <div className="lg:col-span-2 space-y-6">

            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit relative overflow-hidden">
                {/* S8: 装飾的な背景グラデーション */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-[var(--theme-primary)]/5 to-transparent rounded-full -translate-y-20 translate-x-20 pointer-events-none" />
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <span className="text-2xl">👤</span>
                    {t('profileSettings')}
                </h2>

                <div className="flex flex-col gap-8">
                    {/* Profile Visuals (Banner + Avatar) */}
                    <div className="relative mb-6">
                        {/* Banner Image */}
                        <div className="relative group w-full h-48 sm:h-64 bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                            {user.banner_url ? (
                                <img
                                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    src={user.banner_url}
                                    alt="Banner"
                                    onClick={() => setIsBannerModalOpen(true)}
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
                                <UserAvatar
                                    src={user.image}
                                    name={name}
                                    size="2xl"
                                    borderClass="border-white"
                                    frameColor={activeFrameColor}
                                    onClick={user.image ? () => setIsImageModalOpen(true) : undefined}
                                />
                                <ProfileImageEditor initialImage={user.image} isCustom={user.is_custom_image || false} />
                            </div>
                        </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-6 w-full max-w-xl">
                        <div>
                            <label htmlFor="settings-display-name" className="block text-sm font-bold text-gray-700 mb-1">{t('displayName')}</label>
                            <input
                                id="settings-display-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-[var(--theme-primary)] focus:ring-[var(--theme-primary)] sm:text-sm py-2.5 text-gray-900"
                                maxLength={50}
                            />
                        </div>
                        <div>
                            <label htmlFor="settings-username" className="block text-sm font-bold text-gray-700 mb-1">{t('userId')} {t('unique')}</label>
                            <div className="relative rounded-md shadow-sm">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 sm:text-sm">@</span>
                                <input
                                    id="settings-username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full rounded-lg border-gray-300 pl-8 focus:border-[var(--theme-primary)] focus:ring-[var(--theme-primary)] sm:text-sm py-2.5 text-gray-900"
                                    maxLength={20}
                                    minLength={6}
                                    pattern="[a-zA-Z0-9_\-\.]+"
                                    aria-describedby="username-hint"
                                />
                            </div>
                            <p id="username-hint" className="text-xs text-gray-500 mt-1" dangerouslySetInnerHTML={{ __html: t.raw('usernameHint') }} />
                        </div>

                        <div role="status" aria-live="polite">
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
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-6 py-2.5 bg-[var(--theme-primary)] text-white text-sm font-bold rounded-lg hover:bg-[var(--theme-primary)]/90 disabled:opacity-50 transition-all shadow-sm hover:shadow-md flex items-center gap-2 justify-center"
                            >
                                {isSaving && (
                                    <Spinner size="sm" />
                                )}
                                {isSaving ? t('saving') : t('saveChanges')}
                            </button>
                        </div>
                    </div>

                    {/* 称号セレクター（プロフィールセクション内） */}
                    <TitleSelector ownedTitles={ownedTitles} />

                    {/* フレームセレクター（プロフィールセクション内） */}
                    <FrameSelector ownedFrames={ownedFrames} onFrameChange={setActiveFrameColor} />

                </div>
            </section>

            {/* S3: プロフィール完成度メーター */}
            {completionPercent < 100 ? (
                <div className="bg-white p-5 rounded-xl shadow-sm border border-[var(--theme-primary)]/15">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            📊 {t('profileCompletion')}
                        </span>
                        <span className="text-sm font-extrabold text-[var(--theme-primary)]">{completionPercent}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-[var(--theme-primary-light)] rounded-full overflow-hidden shadow-inner">
                        <div
                            className="h-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${completionPercent}%` }}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        {completionItems.map(item => (
                            <span key={item.key} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                                item.done
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : 'bg-white text-gray-400 border border-gray-200'
                            }`}>
                                {item.done ? '✅' : '⬜'} {item.label}
                            </span>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-green-200 flex items-center gap-3">
                    <span className="text-2xl">🎉</span>
                    <span className="text-sm font-bold text-green-700">{t('profileComplete')}</span>
                </div>
            )}

            {/* Shop CTA Banner — 独立パネル（リッチ版） */}
            <Link href="/shop" className="block group">
                <section className="relative overflow-hidden rounded-2xl border-2 border-[var(--theme-primary)]/25 bg-gradient-to-br from-[var(--theme-primary)] via-[var(--theme-primary)]/80 to-purple-600 p-6 shadow-md hover:shadow-xl hover:scale-[1.01] transition-all duration-300">
                    {/* 背景装飾 */}
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
                    <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/10 rounded-full translate-y-12 -translate-x-12"></div>
                    <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-white/5 rounded-full"></div>

                    <div className="relative">
                        {/* アイコン行 */}
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-3xl drop-shadow-md">🛍️</span>
                            <span className="text-2xl drop-shadow-md">✨</span>
                        </div>

                        {/* テキスト */}
                        <h3 className="text-xl font-extrabold text-white mb-1 drop-shadow-sm">{t('shopCta')}</h3>
                        <p className="text-sm text-white/80 mb-4 leading-relaxed">{t('shopCtaDescription')}</p>

                        {/* アイテムプレビュー */}
                        <div className="flex items-center gap-3 mb-5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/30 backdrop-blur-sm text-white text-xs font-semibold border border-white/30">
                                🏷️ {t('titleLabel')}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/30 backdrop-blur-sm text-white text-xs font-semibold border border-white/30">
                                💎 {t('frameLabel')}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/30 backdrop-blur-sm text-white text-xs font-semibold border border-white/30">
                                🎨 {t('theme')}
                            </span>
                        </div>

                        {/* ボタン */}
                        <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[var(--theme-primary)] text-sm font-extrabold shadow-lg group-hover:shadow-xl group-hover:gap-3 transition-all duration-300">
                            {t('shopCtaButton')}
                            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </span>
                    </div>
                </section>
            </Link>
            </div>

            {/* Sidebar Column: Preferences */}
            <div className="space-y-8">

                {/* Language Switcher */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-full -translate-y-14 translate-x-14 pointer-events-none" />
                    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <span className="text-xl">🌐</span>
                        {commonT('language')}
                    </h2>
                    <p className="text-xs text-gray-500 mb-6 font-medium">{t('languageDescription')}</p>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => handleLanguageChange('ja')}
                            disabled={!!switchingLocale}
                            className={`w-full px-4 py-2 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${locale === 'ja'
                                ? 'bg-[var(--theme-primary-light)] border-[var(--theme-primary)]/30 text-[var(--theme-primary)] midnight-option-selected'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 midnight-option-default'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                日本語
                                {switchingLocale === 'ja' && (
                                    <Spinner size="xs" className="text-[var(--theme-primary)]" />
                                )}
                            </span>
                            {locale === 'ja' && !switchingLocale && <span className="text-[var(--theme-primary)]">✓</span>}
                        </button>
                        <button
                            onClick={() => handleLanguageChange('en')}
                            disabled={!!switchingLocale}
                            className={`w-full px-4 py-2 text-sm font-medium rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${locale === 'en'
                                ? 'bg-[var(--theme-primary-light)] border-[var(--theme-primary)]/30 text-[var(--theme-primary)] midnight-option-selected'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 midnight-option-default'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                English
                                {switchingLocale === 'en' && (
                                    <Spinner size="xs" className="text-[var(--theme-primary)]" />
                                )}
                            </span>
                            {locale === 'en' && !switchingLocale && <span className="text-[var(--theme-primary)]">✓</span>}
                        </button>
                    </div>
                </section>

                {/* S2/S9: テーマカードスタイルスイッチャー */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-pink-500/5 to-transparent rounded-full translate-y-20 -translate-x-16 pointer-events-none" />
                    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <span className="text-xl">🎨</span>
                        {t('theme')}
                    </h2>
                    <p className="text-xs text-gray-500 mb-4 font-medium">{t('themeDescription')}</p>
                    <div className="flex flex-col gap-3">
                        {/* Classic */}
                        <button
                            onClick={() => setTheme('classic')}
                            className={`relative overflow-hidden rounded-xl border-2 p-4 transition-all cursor-pointer text-left group ${
                                theme === 'classic'
                                    ? 'border-indigo-500 shadow-lg ring-2 ring-indigo-200'
                                    : 'border-gray-200 hover:border-indigo-300 hover:shadow-md'
                            }`}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/8 via-purple-500/5 to-transparent pointer-events-none" />
                            <div className="relative flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-md flex items-center justify-center text-white shrink-0">
                                    <span className="text-lg">💎</span>
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold text-sm text-gray-900">Classic</div>
                                    <div className="text-xs text-gray-500">{t('classicDesc')}</div>
                                </div>
                                {theme === 'classic' && (
                                    <span className="ml-auto shrink-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">✓</span>
                                )}
                            </div>
                            {/* ミニプレビューバー */}
                            <div className="mt-3 flex gap-1.5">
                                <div className="h-1.5 flex-1 rounded-full bg-indigo-500/30" />
                                <div className="h-1.5 w-8 rounded-full bg-purple-500/30" />
                                <div className="h-1.5 w-6 rounded-full bg-indigo-300/30" />
                            </div>
                        </button>

                        {/* Pop & Fun */}
                        <button
                            onClick={() => setTheme('pop')}
                            className={`relative overflow-hidden rounded-xl border-2 p-4 transition-all cursor-pointer text-left group ${
                                theme === 'pop'
                                    ? 'border-pink-500 shadow-lg ring-2 ring-pink-200'
                                    : 'border-gray-200 hover:border-pink-300 hover:shadow-md'
                            }`}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-coral)]/8 via-[var(--accent-pink)]/5 to-transparent pointer-events-none" />
                            <div className="relative flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-coral)] via-[var(--accent-pink)] to-[var(--accent-purple)] shadow-md flex items-center justify-center text-white shrink-0">
                                    <span className="text-lg">🎨</span>
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold text-sm text-gray-900">Pop & Fun</div>
                                    <div className="text-xs text-gray-500">{t('popDesc')}</div>
                                </div>
                                {theme === 'pop' && (
                                    <span className="ml-auto shrink-0 w-6 h-6 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs font-bold">✓</span>
                                )}
                            </div>
                            <div className="mt-3 flex gap-1.5">
                                <div className="h-1.5 flex-1 rounded-full bg-pink-400/30" />
                                <div className="h-1.5 w-8 rounded-full bg-orange-400/30" />
                                <div className="h-1.5 w-6 rounded-full bg-purple-400/30" />
                            </div>
                        </button>

                        {/* Midnight */}
                        <button
                            onClick={() => ownsMidnight && setTheme('midnight')}
                            disabled={!ownsMidnight}
                            className={`relative overflow-hidden rounded-xl border-2 p-4 transition-all text-left group ${
                                ownsMidnight ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                            } ${
                                theme === 'midnight'
                                    ? 'border-indigo-400 shadow-lg ring-2 ring-indigo-300/50 bg-slate-900'
                                    : 'border-gray-200 hover:border-slate-400 hover:shadow-md'
                            }`}
                        >
                            <div className={`absolute inset-0 pointer-events-none ${
                                theme === 'midnight'
                                    ? 'bg-gradient-to-br from-indigo-600/20 via-slate-900/50 to-slate-950/80'
                                    : 'bg-gradient-to-br from-slate-800/8 via-indigo-900/5 to-transparent'
                            }`} />
                            <div className="relative flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 via-slate-900 to-slate-950 shadow-md border border-indigo-400/30 flex items-center justify-center text-white shrink-0">
                                    <span className="text-lg">🌙</span>
                                </div>
                                <div className="min-w-0">
                                    <div className={`font-bold text-sm ${theme === 'midnight' ? 'text-indigo-300' : 'text-gray-900'}`}>Midnight</div>
                                    <div className={`text-xs ${theme === 'midnight' ? 'text-indigo-400/70' : 'text-gray-500'}`}>{t('midnightDesc')}</div>
                                </div>
                                <div className="ml-auto shrink-0 flex items-center gap-2">
                                    {theme === 'midnight' && ownsMidnight && (
                                        <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold shadow-[0_0_8px_rgba(99,102,241,0.5)]">✓</span>
                                    )}
                                    {ownsMidnight && theme !== 'midnight' && (
                                        <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded border border-amber-200">Premium</span>
                                    )}
                                    {!ownsMidnight && (
                                        <Link href="/shop" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors">
                                            🔒 30,000 UC
                                        </Link>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 flex gap-1.5">
                                <div className={`h-1.5 flex-1 rounded-full ${theme === 'midnight' ? 'bg-indigo-500/40' : 'bg-slate-700/20'}`} />
                                <div className={`h-1.5 w-8 rounded-full ${theme === 'midnight' ? 'bg-indigo-400/30' : 'bg-slate-600/15'}`} />
                                <div className={`h-1.5 w-6 rounded-full ${theme === 'midnight' ? 'bg-slate-500/30' : 'bg-slate-500/10'}`} />
                            </div>
                        </button>
                    </div>
                    <Link href="/shop" className="mt-3 flex items-center gap-1 text-xs text-[var(--theme-primary)] font-medium hover:underline">
                        {t('moreThemes')} →
                    </Link>
                </section>
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit relative overflow-hidden">
                    <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-[var(--theme-primary)]/5 to-transparent rounded-full translate-y-14 translate-x-14 pointer-events-none" />
                    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <span className="text-xl">⚡</span>
                        {t('dailyGoal')}
                    </h2>
                    <p className="text-xs text-gray-500 mb-6 font-medium">{t('setDailyGoal')}</p>
                    <div className="w-full">
                        <StepGoalForm initialGoal={user.step_goal || 10000} />
                    </div>
                </section>

                {/* S5: アカウント統計 */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <span className="text-xl">📈</span>
                        {t('accountStats')}
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[var(--theme-primary-light)] rounded-lg p-3 text-center border border-[var(--theme-primary)]/10">
                            <div className="text-2xl font-black account-stat-number">{ownedTitles.length}</div>
                            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{t('titlesOwned')}</div>
                        </div>
                        <div className="bg-[var(--theme-primary-light)] rounded-lg p-3 text-center border border-[var(--theme-primary)]/10">
                            <div className="text-2xl font-black account-stat-number">{ownedFrames.length}</div>
                            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{t('framesOwned')}</div>
                        </div>
                        <div className="col-span-2 bg-[var(--theme-primary-light)] rounded-lg p-3 text-center border border-[var(--theme-primary)]/10">
                            <div className="text-sm font-bold text-gray-700 flex items-center justify-center gap-2">
                                <span className="text-lg">{theme === 'classic' ? '💎' : theme === 'pop' ? '🎨' : '🌙'}</span>
                                {t('currentTheme')}: <span className="account-stat-number capitalize">{theme}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Notifications */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-purple-500/5 to-transparent rounded-full -translate-y-14 -translate-x-14 pointer-events-none" />
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <span className="text-xl">🔔</span>
                        {t('notifications')}
                    </h2>
                    <PushNotificationManager />
                </section>
            </div>


        </div>
    );
}
