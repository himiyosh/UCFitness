'use client';

export const runtime = 'edge';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import ProfileImageEditor from "@/components/profile/ProfileImageEditor";
import Spinner from '@/components/ui/Spinner';

export default function SetupPage() {
    const { data: session, update } = useSession();
    const router = useRouter();
    const t = useTranslations('Setup');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsEmail, setNeedsEmail] = useState(false);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [isCustomImage, setIsCustomImage] = useState(false);
    const usernameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const checkStatus = async () => {
            if (session?.user) {
                setCurrentImage(session.user.image || null);
                setName(session.user.name || '');

                if (session.user.email?.includes('@pending.setup')) {
                    setNeedsEmail(true);
                } else {
                    setEmail(session.user.email || '');
                }

                try {
                    const res = await fetch('/api/user/status');
                    const data = await res.json();

                    if (data.is_custom_image !== undefined) {
                        setIsCustomImage(data.is_custom_image);
                    }

                    if (data.isSetup && data.username) {
                        window.location.href = '/';
                    }
                } catch (e) {
                    console.error("Failed to check status", e);
                }
            }
        };

        checkStatus();
    }, [session, update, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/user/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    name,
                    email: needsEmail ? email : undefined
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            if (data.merged) {
                await signOut({ callbackUrl: '/' });
                return;
            }

            window.location.href = '/';

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Something went wrong';
            setError(msg);
            // エラー時に最初の入力フィールドにフォーカス
            usernameRef.current?.focus();
        } finally {
            setLoading(false);
        }
    };

    if (!session) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--theme-page-bg)]" role="status">
                <Spinner size="lg" />
                <span className="sr-only">{t('loadingSession')}</span>
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-screen bg-[var(--theme-page-bg)] flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                {/* ロゴ */}
                <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] flex items-center justify-center shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>

                <h2 className="text-center text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)]">
                    {t('welcome')}
                </h2>
                <p className="mt-2 text-center text-sm text-gray-500">
                    {t('subtitle')}
                </p>
            </div>

            <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
                {/* アバター選択 */}
                <div className="mb-6 flex justify-center">
                    <ProfileImageEditor
                        initialImage={currentImage}
                        isCustom={isCustomImage}
                        onSuccess={async (newUrl) => {
                            if (newUrl) {
                                setCurrentImage(newUrl);
                                setIsCustomImage(true);
                            } else {
                                setIsCustomImage(false);
                                window.location.reload();
                            }
                            await update({
                                ...session,
                                user: {
                                    ...session?.user,
                                    image: newUrl || session?.user?.image
                                }
                            });
                        }}
                    >
                        <div className="relative group cursor-pointer" role="button" tabIndex={0} aria-label={t('changePhoto')}>
                            <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-white shadow-lg bg-[var(--surface-container)]">
                                {currentImage ? (
                                    <img src={currentImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-[var(--theme-primary)]/40 bg-[var(--theme-primary-light)]">
                                        {(session?.user?.name?.[0] || 'U')}
                                    </div>
                                )}
                            </div>
                            <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div className="absolute bottom-0 right-0 bg-[var(--theme-primary)] rounded-full p-1.5 border-2 border-white shadow-sm">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                        </div>
                    </ProfileImageEditor>
                </div>

                <div className="glass-card rounded-2xl py-6 px-4 sm:px-8 shadow-lg">
                    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                        {error && (
                            <div className="rounded-xl bg-red-50 border border-red-200 p-3" role="alert">
                                <p className="text-sm text-red-700 font-medium">{error}</p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-1">
                                {t('usernameLabel')}
                            </label>
                            <input
                                ref={usernameRef}
                                id="username"
                                name="username"
                                type="text"
                                required
                                autoComplete="username"
                                aria-required="true"
                                aria-invalid={error ? 'true' : undefined}
                                aria-describedby="username-hint"
                                className="block w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-sm placeholder:text-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-[var(--theme-primary)] text-sm transition-shadow"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder={t('usernamePlaceholder')}
                            />
                            <p id="username-hint" className="mt-1 text-xs text-gray-500">
                                {t('usernameHint')}
                            </p>
                        </div>

                        <div>
                            <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-1">
                                {t('displayNameLabel')}
                            </label>
                            <input
                                id="name"
                                name="name"
                                type="text"
                                required
                                autoComplete="name"
                                aria-required="true"
                                className="block w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-sm placeholder:text-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-[var(--theme-primary)] text-sm transition-shadow"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('displayNamePlaceholder')}
                                maxLength={50}
                            />
                        </div>

                        {needsEmail && (
                            <div>
                                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">
                                    {t('emailLabel')}
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    aria-required="true"
                                    aria-describedby="email-hint"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-sm placeholder:text-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-[var(--theme-primary)] text-sm transition-shadow"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <p id="email-hint" className="mt-1 text-xs text-gray-500">
                                    {t('emailHint')}
                                </p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] hover:opacity-90 hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:ring-offset-2 disabled:opacity-50 transition-all shadow-md shadow-[var(--theme-primary)]/20"
                        >
                            {loading && <Spinner size="xs" />}
                            {loading ? t('saving') : t('submit')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

