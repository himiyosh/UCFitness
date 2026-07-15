'use client';

export const runtime = 'edge';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { signOut, useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { reportError } from '@/lib/errors';

import ProfileImageEditor from '@/components/profile/ProfileImageEditor';
import Spinner from '@/components/ui/Spinner';

export default function SetupPage() {
    const { data: session, status, update } = useSession();
    const router = useRouter();
    const t = useTranslations('Setup');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [stepGoal, setStepGoal] = useState(5_000);
    const [provider, setProvider] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [statusLoading, setStatusLoading] = useState(true);
    const [statusRetryKey, setStatusRetryKey] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [statusError, setStatusError] = useState<'retryable' | 'missing' | null>(null);
    const [completed, setCompleted] = useState(false);
    const [needsEmail, setNeedsEmail] = useState(false);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [isCustomImage, setIsCustomImage] = useState(false);
    const completionHeadingRef = useRef<HTMLHeadingElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const stepGoalRef = useRef<HTMLInputElement>(null);
    const setupCompletedRef = useRef(false);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.replace('/');
            return;
        }
        const controller = new AbortController();
        const checkStatus = async () => {
            if (session?.user) {
                setStatusLoading(true);
                setCurrentImage(session.user.image || null);
                setName(session.user.name || '');

                if (session.user.email?.includes('@pending.setup')) {
                    setNeedsEmail(true);
                } else {
                    setEmail(session.user.email || '');
                }

                try {
                    const res = await fetch('/api/user/status', {
                        signal: controller.signal,
                    });
                    if (res.status === 404) {
                        setProvider(null);
                        setStatusError('missing');
                        return;
                    }
                    if (!res.ok) throw new Error('Failed to load setup status');
                    const data = await res.json();

                    if (data.isSetup && data.username && !setupCompletedRef.current) {
                        window.location.href = '/';
                        return;
                    }
                    if (data.is_custom_image !== undefined) {
                        setIsCustomImage(data.is_custom_image);
                    }
                    setProvider(typeof data.provider === 'string' ? data.provider : null);
                    if (
                        typeof data.step_goal === 'number'
                        && Number.isInteger(data.step_goal)
                        && data.step_goal >= 500
                        && data.step_goal <= 100_000
                    ) {
                        setStepGoal(data.step_goal);
                    } else if (data.step_goal !== null && data.step_goal !== undefined) {
                        throw new Error('Invalid setup step goal');
                    }
                    setStatusError(null);
                } catch (statusLoadError) {
                    if (statusLoadError instanceof Error && statusLoadError.name === 'AbortError') {
                        return;
                    }
                    reportError('setup:status', statusLoadError, {
                        userId: session.user.id,
                    });
                    setProvider(null);
                    setStatusError('retryable');
                } finally {
                    if (!controller.signal.aborted) {
                        setStatusLoading(false);
                    }
                }
            }
        };

        checkStatus();
        return () => controller.abort();
    }, [session, status, update, router, statusRetryKey]);

    useEffect(() => {
        if (completed) {
            completionHeadingRef.current?.focus();
        }
    }, [completed]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const sessionUser = session?.user;
        if (!sessionUser) {
            setError(t('sessionExpired'));
            return;
        }
        if (statusLoading || statusError !== null) {
            setError(t('statusLoadError'));
            return;
        }
        const trimmedUsername = username.trim();
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        if (!trimmedName) {
            setError(t('displayNameRequired'));
            nameRef.current?.focus();
            return;
        }
        if (trimmedUsername.length < 3 || trimmedUsername.length > 30 || !/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
            setError(t('usernameInvalid'));
            usernameRef.current?.focus();
            return;
        }
        if (needsEmail && !trimmedEmail) {
            setError(t('emailRequired'));
            emailRef.current?.focus();
            return;
        }
        if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            setError(t('emailInvalid'));
            emailRef.current?.focus();
            return;
        }
        if (!Number.isInteger(stepGoal) || stepGoal < 500 || stepGoal > 100_000) {
            setError(t('stepGoalInvalid'));
            stepGoalRef.current?.focus();
            return;
        }
        setLoading(true);

        try {
            const res = await fetch('/api/user/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: trimmedUsername,
                    name: trimmedName,
                    email: needsEmail ? trimmedEmail : undefined,
                    step_goal: stepGoal,
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

            setupCompletedRef.current = true;
            try {
                await update({
                    user: {
                        ...sessionUser,
                        username: trimmedUsername,
                        name: trimmedName,
                    },
                });
            } catch (sessionUpdateError) {
                reportError('setup:session-update', sessionUpdateError, {
                    userId: sessionUser.id,
                });
            }
            setCompleted(true);

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Something went wrong';
            setError(msg);
            // エラー時に最初の入力フィールドにフォーカス
            usernameRef.current?.focus();
        } finally {
            setLoading(false);
        }
    };

    if (status !== 'authenticated' || !session) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--theme-page-bg)]" role="status">
                <Spinner size="lg" />
                <span className="sr-only">{t('loadingSession')}</span>
            </div>
        );
    }

    if (completed) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[var(--theme-page-bg)] px-4 py-8 sm:px-6">
                <section className="w-full max-w-md rounded-2xl border border-[var(--color-success)]/25 bg-[var(--color-surface)] p-4 shadow-sm sm:p-6" aria-labelledby="setup-complete-title">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-success-soft)] text-2xl text-[var(--color-success-strong)]" aria-hidden="true">✓</span>
                    <h1
                        ref={completionHeadingRef}
                        id="setup-complete-title"
                        tabIndex={-1}
                        className="mt-3 text-center text-2xl font-black text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-primary)] sm:text-3xl"
                    >
                        {t('completeTitle')}
                    </h1>
                    <p className="mt-1 text-center text-sm leading-6 text-[var(--color-text-muted)]">
                        {t(provider ? 'completeDescription' : 'completeDescriptionNoConnection')}
                    </p>
                    <ul className="mt-4 space-y-2">
                        {[t('completeProfile'), t(provider ? 'completeConnection' : 'completeConnectionPending'), t('completeGoal', {
                            goal: stepGoal.toLocaleString(),
                        })].map((item) => (
                            <li key={item} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--color-success-soft)]/60 px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                                <span className="text-[var(--color-success-strong)]" aria-hidden="true">✓</span>
                                {item}
                            </li>
                        ))}
                    </ul>
                    <div className={`mt-4 rounded-xl border px-3 py-3 ${provider
                        ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary-soft)]'
                        : 'border-[var(--color-warning)]/30 bg-[var(--color-surface-muted)]'
                        }`}>
                        <p className={`text-xs font-bold ${provider
                            ? 'text-[var(--color-primary-strong)]'
                            : 'text-[var(--color-warning)]'
                            }`}>
                            {t(provider ? 'firstQuestLabel' : 'connectionMissingTitle')}
                        </p>
                        <p className="mt-0.5 text-sm font-black text-[var(--color-text)]">
                            {t(provider ? 'firstQuestTitle' : 'connectionMissingDescription')}
                        </p>
                        {provider && (
                            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{t('firstQuestDescription')}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => router.push(provider ? '/' : '/settings')}
                        className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-primary-solid)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                    >
                        {t(provider ? 'startFirstQuest' : 'reviewConnection')}
                    </button>
                </section>
            </main>
        );
    }

    return (
        <div className="flex-1 min-h-screen bg-[var(--theme-page-bg)] flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                {/* ロゴ */}
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary-soft)] shadow-sm ring-1 ring-[var(--color-primary)]/20">
                    <svg className="h-8 w-8 text-[var(--color-primary-strong)]" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 15.5 8.5 11l3 3L20 5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 19h14" stroke="var(--color-reward)" strokeWidth="2.4" strokeLinecap="round" />
                        <circle cx="18.5" cy="5.5" r="2.25" fill="var(--color-success)" />
                    </svg>
                </div>

                <h1 className="text-center text-2xl font-bold tracking-tight text-[var(--color-primary-strong)] sm:text-3xl">
                    {t('welcome')}
                </h1>
                <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
                    {t('subtitle')}
                </p>
            </div>

            <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
                {statusError === 'retryable' && (
                    <div className="mb-3 rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-danger)]" role="alert">
                        <p>{t('statusLoadError')}</p>
                        <button
                            type="button"
                            onClick={() => setStatusRetryKey((current) => current + 1)}
                            disabled={statusLoading}
                            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--color-danger)] px-4 py-2 text-sm font-bold transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {t('retryStatus')}
                        </button>
                    </div>
                )}
                {statusError === 'missing' && (
                    <div className="mb-3 rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-danger)]" role="alert">
                        <p>{t('accountMissing')}</p>
                        <button
                            type="button"
                            onClick={() => signOut({ callbackUrl: '/' })}
                            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--color-danger)] px-4 py-2 text-sm font-bold transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)] focus-visible:ring-offset-2"
                        >
                            {t('signInAgain')}
                        </button>
                    </div>
                )}
                {!statusLoading && statusError === null && !provider && (
                    <div className="mb-4 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface-muted)] px-3 py-2.5">
                        <p className="text-sm font-bold text-[var(--color-text)]">{t('connectionMissingTitle')}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{t('connectionMissingDescription')}</p>
                    </div>
                )}
                {provider && (
                    <div
                        role="status"
                        aria-live="polite"
                        className="mb-4 flex items-center gap-3 border-y border-[var(--color-success)]/20 bg-[var(--color-success-soft)]/55 px-3 py-2.5"
                    >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-success-strong)] text-[var(--color-surface)]" aria-hidden="true">✓</span>
                        <span className="min-w-0">
                            <span className="block text-xs font-bold text-[var(--color-success-strong)]">{t('connectionReady')}</span>
                            <span className="block text-sm font-semibold text-[var(--color-text)]">{t('connectionProvider', {
                                provider: provider === 'fitbit' ? 'Fitbit' : provider,
                            })}</span>
                        </span>
                    </div>
                )}

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
                        <div
                            className="relative group cursor-pointer"
                            role="button"
                            tabIndex={0}
                            aria-label={t('changePhoto')}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    event.currentTarget.click();
                                }
                            }}
                        >
                            <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-[var(--color-surface)] shadow-lg bg-[var(--surface-container)]">
                                {currentImage ? (
                                    <img src={currentImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-[var(--color-primary-soft)] text-3xl font-bold text-[var(--color-primary-strong)]">
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
                            <div className="absolute bottom-0 right-0 bg-[var(--color-primary-solid)] rounded-full p-1.5 border-2 border-[var(--color-surface)] shadow-sm">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                        </div>
                    </ProfileImageEditor>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6">
                    <form className="space-y-5" onSubmit={handleSubmit} aria-busy={loading || statusLoading}>
                        {error && (
                            <div className="rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-surface)] p-3" role="alert">
                                <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="username" className="mb-1 block text-sm font-semibold text-[var(--color-text)]">
                                {t('usernameLabel')}
                            </label>
                            <input
                                ref={usernameRef}
                                id="username"
                                name="username"
                                type="text"
                                required
                                minLength={3}
                                maxLength={30}
                                pattern="[A-Za-z0-9_.\-]+"
                                autoComplete="username"
                                aria-required="true"
                                aria-invalid={error ? 'true' : undefined}
                                aria-describedby="username-hint"
                                className="block min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] shadow-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder={t('usernamePlaceholder')}
                            />
                            <p id="username-hint" className="mt-1 text-xs text-[var(--color-text-muted)]">
                                {t('usernameHint')}
                            </p>
                        </div>

                        <div>
                            <label htmlFor="name" className="mb-1 block text-sm font-semibold text-[var(--color-text)]">
                                {t('displayNameLabel')}
                            </label>
                            <input
                                id="name"
                                ref={nameRef}
                                name="name"
                                type="text"
                                required
                                autoComplete="name"
                                aria-required="true"
                                className="block min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] shadow-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('displayNamePlaceholder')}
                                maxLength={50}
                            />
                        </div>

                        {needsEmail && (
                            <div>
                                <label htmlFor="email" className="mb-1 block text-sm font-semibold text-[var(--color-text)]">
                                    {t('emailLabel')}
                                </label>
                                <input
                                    id="email"
                                    ref={emailRef}
                                    name="email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    aria-required="true"
                                    aria-describedby="email-hint"
                                    className="block min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] shadow-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <p id="email-hint" className="mt-1 text-xs text-[var(--color-text-muted)]">
                                    {t('emailHint')}
                                </p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="step-goal" className="mb-1 block text-sm font-semibold text-[var(--color-text)]">
                                {t('stepGoalLabel')}
                            </label>
                            <input
                                ref={stepGoalRef}
                                id="step-goal"
                                name="step-goal"
                                type="number"
                                required
                                min={500}
                                max={100000}
                                step={500}
                                inputMode="numeric"
                                aria-required="true"
                                aria-describedby="step-goal-hint"
                                className="block min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm font-semibold tabular-nums text-[var(--color-text)] shadow-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                value={stepGoal}
                                onChange={(event) => setStepGoal(Number(event.target.value))}
                            />
                            <p id="step-goal-hint" className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                                {t('stepGoalHint')}
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || statusLoading || statusError !== null}
                            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary-solid)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 disabled:opacity-50"
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
