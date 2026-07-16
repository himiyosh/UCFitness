'use client';

export const runtime = 'edge';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { signOut, useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';

import {
    AUTH_CALLBACK_STORAGE_KEY,
    getPostSetupReturnPath,
} from '@/lib/auth-flow';
import { reportError } from '@/lib/errors';
import {
    getCommunityDestination,
    getNextSetupStep,
    getPreviousSetupStep,
    getSetupProgressPercent,
    parseCommunityIntent,
    SETUP_STEPS,
    SETUP_TOTAL_STEPS,
    type CommunityIntent,
    type SetupStep,
} from '@/lib/setup-flow';
import {
    isValidStepGoal,
    MAX_STEP_GOAL,
    MIN_STEP_GOAL,
    RECOMMENDED_STEP_GOAL,
} from '@/lib/step-goal';

import ProfileImageEditor from '@/components/profile/ProfileImageEditor';
import Spinner from '@/components/ui/Spinner';

export default function SetupPage() {
    const { data: session, status, update } = useSession();
    const router = useRouter();
    const locale = useLocale();
    const t = useTranslations('Setup');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [stepGoal, setStepGoal] = useState(RECOMMENDED_STEP_GOAL);
    const [provider, setProvider] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [statusLoading, setStatusLoading] = useState(true);
    const [statusRetryKey, setStatusRetryKey] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [statusError, setStatusError] = useState<'retryable' | 'missing' | null>(null);
    const [completed, setCompleted] = useState(false);
    const [currentStep, setCurrentStep] = useState<SetupStep>(1);
    const [communityIntent, setCommunityIntent] = useState<CommunityIntent>('later');
    const [needsEmail, setNeedsEmail] = useState(false);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [isCustomImage, setIsCustomImage] = useState(false);
    const [storedAuthCallbackPath] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return window.sessionStorage.getItem(AUTH_CALLBACK_STORAGE_KEY);
    });
    const completionHeadingRef = useRef<HTMLHeadingElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const stepGoalRef = useRef<HTMLInputElement>(null);
    const setupCompletedRef = useRef(false);
    const stepHeadingRef = useRef<HTMLHeadingElement>(null);
    const previousStepRef = useRef<SetupStep>(1);
    const pendingStepFocusRef = useRef<'heading' | 'username'>('heading');
    const postSetupReturnPath = provider
        ? getPostSetupReturnPath(storedAuthCallbackPath, locale)
        : null;

    const handleCompletionNavigation = (destination: string): void => {
        window.sessionStorage.removeItem(AUTH_CALLBACK_STORAGE_KEY);
        router.push(destination);
    };

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
                    if (isValidStepGoal(data.step_goal)) {
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

    useEffect(() => {
        if (previousStepRef.current !== currentStep) {
            if (pendingStepFocusRef.current === 'username') {
                usernameRef.current?.focus();
            } else {
                stepHeadingRef.current?.focus();
            }
            pendingStepFocusRef.current = 'heading';
            previousStepRef.current = currentStep;
        }
    }, [currentStep]);

    const validateProfileStep = (): boolean => {
        setError(null);
        const sessionUser = session?.user;
        if (!sessionUser) {
            setError(t('sessionExpired'));
            return false;
        }
        if (statusLoading || statusError !== null) {
            setError(t('statusLoadError'));
            return false;
        }
        const trimmedUsername = username.trim();
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        if (!trimmedName) {
            setError(t('displayNameRequired'));
            nameRef.current?.focus();
            return false;
        }
        if (trimmedUsername.length < 3 || trimmedUsername.length > 30 || !/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
            setError(t('usernameInvalid'));
            usernameRef.current?.focus();
            return false;
        }
        if (needsEmail && !trimmedEmail) {
            setError(t('emailRequired'));
            emailRef.current?.focus();
            return false;
        }
        if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            setError(t('emailInvalid'));
            emailRef.current?.focus();
            return false;
        }

        return true;
    };

    const validateGoalStep = (): boolean => {
        setError(null);
        if (!isValidStepGoal(stepGoal)) {
            setError(t('stepGoalInvalid'));
            stepGoalRef.current?.focus();
            return false;
        }

        return true;
    };

    const moveToStep = (step: SetupStep): void => {
        setError(null);
        setCurrentStep(step);
    };

    const handleProfileImageSuccess = async (newUrl: string | null): Promise<void> => {
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
                image: newUrl || session?.user?.image,
            },
        });
    };

    const saveSetup = async (intent: CommunityIntent): Promise<void> => {
        const sessionUser = session?.user;
        if (!sessionUser) {
            setError(t('sessionExpired'));
            return;
        }
        const trimmedUsername = username.trim();
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();

        setCommunityIntent(intent);
        setError(null);
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
                if (res.status === 400 || res.status === 409) {
                    pendingStepFocusRef.current = 'username';
                    setCurrentStep(1);
                }
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
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();

        if (currentStep === 1) {
            if (validateProfileStep()) {
                moveToStep(getNextSetupStep(currentStep));
            }
            return;
        }

        if (currentStep === 2) {
            if (validateGoalStep()) {
                moveToStep(getNextSetupStep(currentStep));
            }
            return;
        }

        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        await saveSetup(parseCommunityIntent(submitter?.value));
    };

    const setupStepLabels = [
        t('profileStepShort'),
        t('goalStepShort'),
        t('communityStepShort'),
    ];
    const communityDestination = getCommunityDestination(communityIntent);
    const completionCommunityLabel = t(
        communityIntent === 'groups'
            ? 'completeCommunityGroups'
            : communityIntent === 'challenges'
                ? 'completeCommunityChallenges'
                : 'completeCommunityLater',
    );

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
                        }), completionCommunityLabel].map((item) => (
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
                        onClick={() => handleCompletionNavigation(
                            postSetupReturnPath ?? (provider ? '/' : '/settings'),
                        )}
                        className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-primary-solid)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                    >
                        {t(postSetupReturnPath
                            ? 'returnToRequestedPage'
                            : provider
                                ? 'startFirstQuest'
                                : 'reviewConnection')}
                    </button>
                    {postSetupReturnPath && provider && (
                        <button
                            type="button"
                            onClick={() => handleCompletionNavigation('/')}
                            className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                        >
                            {t('startFirstQuest')}
                        </button>
                    )}
                    {communityDestination && (
                        <button
                            type="button"
                            onClick={() => router.push(communityDestination)}
                            className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                        >
                            {t(communityIntent === 'groups' ? 'openGroups' : 'openChallenges')}
                        </button>
                    )}
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
                <div className="mt-5" aria-label={t('progressLabel')}>
                    <div
                        role="progressbar"
                        aria-label={t('progressValue', {
                            current: currentStep,
                            total: SETUP_TOTAL_STEPS,
                        })}
                        aria-valuemin={1}
                        aria-valuemax={SETUP_TOTAL_STEPS}
                        aria-valuenow={currentStep}
                        className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]"
                    >
                        <div
                            className="h-full rounded-full bg-[var(--color-primary-solid)] transition-[width] motion-reduce:transition-none"
                            style={{ width: `${getSetupProgressPercent(currentStep)}%` }}
                        />
                    </div>
                    <ol className="mt-2 grid grid-cols-3 gap-2">
                        {SETUP_STEPS.map((step, index) => (
                            <li
                                key={step}
                                aria-current={step === currentStep ? 'step' : undefined}
                                className={`min-w-0 text-center text-xs font-semibold ${step === currentStep
                                    ? 'text-[var(--color-primary-strong)]'
                                    : step < currentStep
                                        ? 'text-[var(--color-success-strong)]'
                                        : 'text-[var(--color-text-muted)]'
                                    }`}
                            >
                                <span className="block tabular-nums" aria-hidden="true">
                                    {step < currentStep ? '✓' : step}
                                </span>
                                <span className="block truncate">{setupStepLabels[index]}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>

            <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
                {currentStep === 1 && statusLoading && (
                    <div className="mb-3 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)]" role="status">
                        <Spinner size="xs" />
                        <span>{t('loadingSetupStatus')}</span>
                    </div>
                )}
                {currentStep === 1 && statusError === 'retryable' && (
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
                {currentStep === 1 && statusError === 'missing' && (
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
                {currentStep === 1 && !statusLoading && statusError === null && !provider && (
                    <div className="mb-4 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface-muted)] px-3 py-2.5">
                        <p className="text-sm font-bold text-[var(--color-text)]">{t('connectionMissingTitle')}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{t('connectionMissingDescription')}</p>
                    </div>
                )}
                {currentStep === 1 && provider && (
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

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6">
                    <form className="space-y-5" onSubmit={handleSubmit} aria-busy={loading || statusLoading}>
                        {error && (
                            <div className="rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-surface)] p-3" role="alert">
                                <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p>
                            </div>
                        )}

                        {currentStep === 1 && (
                            <>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-primary-strong)]">
                                        {t('stepCount', { current: 1, total: SETUP_TOTAL_STEPS })}
                                    </p>
                                    <h2
                                        ref={stepHeadingRef}
                                        tabIndex={-1}
                                        className="mt-1 text-xl font-black text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-primary)]"
                                    >
                                        {t('profileStepTitle')}
                                    </h2>
                                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                                        {t(provider ? 'profileStepDescriptionConnected' : 'profileStepDescription')}
                                    </p>
                                </div>

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
                                enterKeyHint="next"
                                aria-required="true"
                                aria-invalid={error ? 'true' : undefined}
                                aria-describedby="username-hint"
                                className="block min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-[var(--color-text)] shadow-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] sm:text-sm"
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
                                enterKeyHint={needsEmail ? 'next' : 'done'}
                                aria-required="true"
                                className="block min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-[var(--color-text)] shadow-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] sm:text-sm"
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
                                    enterKeyHint="done"
                                    aria-required="true"
                                    aria-describedby="email-hint"
                                    className="block min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-[var(--color-text)] shadow-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] sm:text-sm"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <p id="email-hint" className="mt-1 text-xs text-[var(--color-text-muted)]">
                                    {t('emailHint')}
                                </p>
                                    </div>
                                )}

                                <ProfileImageEditor
                                    initialImage={currentImage}
                                    isCustom={isCustomImage}
                                    onSuccess={handleProfileImageSuccess}
                                >
                                    <button
                                        type="button"
                                        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                                    >
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-primary-soft)] text-sm font-black text-[var(--color-primary-strong)]">
                                            {currentImage ? (
                                                <img src={currentImage} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                (session.user.name?.[0] || 'U')
                                            )}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-bold text-[var(--color-text)]">{t('changePhoto')}</span>
                                            <span className="block text-xs leading-5 text-[var(--color-text-muted)]">{t('photoOptional')}</span>
                                        </span>
                                    </button>
                                </ProfileImageEditor>
                            </>
                        )}

                        {currentStep === 2 && (
                            <>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-primary-strong)]">
                                        {t('stepCount', { current: 2, total: SETUP_TOTAL_STEPS })}
                                    </p>
                                    <h2
                                        ref={stepHeadingRef}
                                        tabIndex={-1}
                                        className="mt-1 text-xl font-black text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-primary)]"
                                    >
                                        {t('goalStepTitle')}
                                    </h2>
                                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{t('goalStepDescription')}</p>
                                </div>

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
                                min={MIN_STEP_GOAL}
                                max={MAX_STEP_GOAL}
                                step={1}
                                inputMode="numeric"
                                enterKeyHint="done"
                                aria-required="true"
                                aria-describedby="step-goal-hint"
                                className="block min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base font-semibold tabular-nums text-[var(--color-text)] shadow-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] sm:text-sm"
                                value={stepGoal}
                                onChange={(event) => setStepGoal(Number(event.target.value))}
                            />
                            <p id="step-goal-hint" className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                                {t('stepGoalHint')}
                            </p>
                                </div>
                            </>
                        )}

                        {currentStep === 3 && (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-primary-strong)]">
                                    {t('stepCount', { current: 3, total: SETUP_TOTAL_STEPS })}
                                </p>
                                <h2
                                    ref={stepHeadingRef}
                                    tabIndex={-1}
                                    className="mt-1 text-xl font-black text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-primary)]"
                                >
                                    {t('communityStepTitle')}
                                </h2>
                                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{t('communityStepDescription')}</p>
                                <div className="mt-4 space-y-3">
                                    <button
                                        type="submit"
                                        name="community-intent"
                                        value="groups"
                                        disabled={loading}
                                        className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-[var(--color-competition)]/30 bg-[var(--color-competition-soft)] px-3 py-2 text-left transition-colors hover:border-[var(--color-competition)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-competition)] text-xl text-white" aria-hidden="true">👥</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-black text-[var(--color-text)]">{t('groupsChoiceTitle')}</span>
                                            <span className="block text-xs leading-5 text-[var(--color-text-muted)]">{t('groupsChoiceDescription')}</span>
                                        </span>
                                        <span className="text-[var(--color-competition)]" aria-hidden="true">›</span>
                                    </button>
                                    <button
                                        type="submit"
                                        name="community-intent"
                                        value="challenges"
                                        disabled={loading}
                                        className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-3 py-2 text-left transition-colors hover:border-[var(--color-success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-success)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-success-strong)] text-xl text-white" aria-hidden="true">🎯</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-black text-[var(--color-text)]">{t('challengesChoiceTitle')}</span>
                                            <span className="block text-xs leading-5 text-[var(--color-text-muted)]">{t('challengesChoiceDescription')}</span>
                                        </span>
                                        <span className="text-[var(--color-success-strong)]" aria-hidden="true">›</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {currentStep === 1 && (
                            <div className="space-y-2">
                                <button
                                    type="submit"
                                    disabled={statusLoading || statusError !== null}
                                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-primary-solid)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {t('continue')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={statusLoading || statusError !== null}
                                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {t(provider ? 'skipPhoto' : 'skipConnection')}
                                </button>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-2">
                                <button
                                    type="submit"
                                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-primary-solid)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                                >
                                    {t('continue')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStepGoal(RECOMMENDED_STEP_GOAL);
                                        moveToStep(getNextSetupStep(currentStep));
                                    }}
                                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                                >
                                    {t('useRecommendedGoal', { goal: RECOMMENDED_STEP_GOAL.toLocaleString() })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveToStep(getPreviousSetupStep(currentStep))}
                                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                                >
                                    {t('back')}
                                </button>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-2">
                                <button
                                    type="submit"
                                    name="community-intent"
                                    value="later"
                                    disabled={loading}
                                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary-solid)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {loading && <Spinner size="xs" />}
                                    {loading ? t('saving') : t('skipCommunity')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveToStep(getPreviousSetupStep(currentStep))}
                                    disabled={loading}
                                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {t('back')}
                                </button>
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}
