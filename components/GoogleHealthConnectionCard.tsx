'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { useLocale, useTranslations } from 'next-intl';

import type {
    FitnessConnectionStatus,
    FitnessConnectionSummary,
} from '@/lib/services/fitness-connection-service';
import type { GoogleHealthNotice } from '@/lib/google-health-oauth';

interface GoogleHealthConnectionCardProps {
    available: boolean;
    connection: FitnessConnectionSummary | null;
    fitbitFallbackAvailable: boolean;
    loadError: boolean;
    notice: GoogleHealthNotice | null;
}

interface StatusMessage {
    type: 'error' | 'success';
    text: string;
}

function getNoticeMessage(
    notice: GoogleHealthNotice | null,
    translate: ReturnType<typeof useTranslations<'Settings.googleHealth'>>,
): StatusMessage | null {
    if (!notice) {
        return null;
    }
    if (notice === 'connected') {
        return { type: 'success', text: translate('noticeConnected') };
    }
    if (notice === 'disconnected') {
        return { type: 'success', text: translate('notice_disconnected') };
    }

    return {
        type: 'error',
        text: translate(`notice_${notice}`),
    };
}

export default function GoogleHealthConnectionCard({
    available,
    connection: initialConnection,
    fitbitFallbackAvailable,
    loadError,
    notice,
}: GoogleHealthConnectionCardProps): React.ReactNode {
    const t = useTranslations('Settings.googleHealth');
    const locale = useLocale();
    const router = useRouter();
    const [connection, setConnection] = useState(initialConnection);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [message, setMessage] = useState<StatusMessage | null>(
        () => getNoticeMessage(notice, t),
    );
    const [isRetryPending, startRetryTransition] = useTransition();
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const triggerButtonRef = useRef<HTMLButtonElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const isDisconnectingRef = useRef(false);
    const wasDisconnectingRef = useRef(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        setConnection(initialConnection);
    }, [initialConnection]);

    useEffect(() => {
        if (!notice) {
            return;
        }
        setMessage(getNoticeMessage(notice, t));
        const url = new URL(window.location.href);
        url.searchParams.delete('health');
        window.history.replaceState(window.history.state, '', url);
    }, [notice, t]);

    useEffect(() => {
        if (!isDisconnectDialogOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        const triggerElement = triggerButtonRef.current;
        const fallbackElement = headingRef.current;
        const overlayElement = dialogRef.current?.parentElement ?? null;
        const inertSiblings = overlayElement
            ? Array.from(document.body.children)
                .filter((element): element is HTMLElement => (
                    element instanceof HTMLElement
                    && element !== overlayElement
                    && !element.contains(overlayElement)
                ))
                .map((element) => ({ element, wasInert: element.inert }))
            : [];
        document.body.style.overflow = 'hidden';
        inertSiblings.forEach(({ element }) => {
            element.inert = true;
        });
        cancelButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !isDisconnectingRef.current) {
                setIsDisconnectDialogOpen(false);
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) {
                return;
            }

            const focusableElements = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
            );
            if (focusableElements.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement;
            if (
                activeElement === dialogRef.current
                || !dialogRef.current.contains(activeElement)
            ) {
                event.preventDefault();
                (event.shiftKey ? lastElement : firstElement).focus();
            } else if (event.shiftKey && activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            inertSiblings.forEach(({ element, wasInert }) => {
                element.inert = wasInert;
            });
            document.removeEventListener('keydown', handleKeyDown);
            const focusTarget = triggerElement?.isConnected
                ? triggerElement
                : fallbackElement;
            if (focusTarget?.isConnected) {
                focusTarget.focus();
            }
        };
    }, [isDisconnectDialogOpen]);

    useEffect(() => {
        if (!isDisconnectDialogOpen) {
            wasDisconnectingRef.current = false;
            return;
        }
        if (isDisconnecting) {
            wasDisconnectingRef.current = true;
            dialogRef.current?.focus();
            return;
        }
        if (wasDisconnectingRef.current) {
            wasDisconnectingRef.current = false;
            cancelButtonRef.current?.focus();
        }
    }, [isDisconnectDialogOpen, isDisconnecting]);

    const status: FitnessConnectionStatus = connection?.status ?? 'disconnected';
    const needsReconnect = status === 'reauthorization_required' || status === 'error';
    const isConnected = status === 'active';
    const displayStatus = loadError ? 'unknown' : status;
    const lastSyncedAt = connection?.lastSyncedAt
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Tokyo',
        }).format(new Date(connection.lastSyncedAt))
        : null;

    const handleConnect = (): void => {
        setIsConnecting(true);
        window.location.assign(
            `/api/health-connections/google/authorize?returnTo=/${locale}/settings`,
        );
    };

    const handleDisconnect = async (): Promise<void> => {
        isDisconnectingRef.current = true;
        setIsDisconnecting(true);
        setMessage(null);
        try {
            const response = await fetch('/api/health-connections/google', {
                method: 'DELETE',
                signal: AbortSignal.timeout(15_000),
            });
            if (!response.ok) {
                throw new Error('Google Health disconnect request failed');
            }
            setConnection(null);
            setMessage({ type: 'success', text: t('disconnectSuccess') });
            setIsDisconnectDialogOpen(false);
        } catch {
            setMessage({ type: 'error', text: t('disconnectError') });
        } finally {
            isDisconnectingRef.current = false;
            setIsDisconnecting(false);
        }
    };

    const handleRetry = (): void => {
        startRetryTransition(() => {
            router.refresh();
        });
    };

    if (!available && !connection && !loadError && !notice) {
        return null;
    }

    return (
        <>
            <section
                aria-labelledby="google-health-heading"
                className="mb-3 overflow-hidden rounded-xl bg-white p-3 shadow-sm md:p-5"
            >
                {message && !isDisconnectDialogOpen && (
                    <p
                        role={message.type === 'error' ? 'alert' : 'status'}
                        className={`mb-3 text-sm ${
                            message.type === 'error' ? 'text-red-700' : 'text-green-700'
                        }`}
                    >
                        {message.text}
                    </p>
                )}
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-primary-light)] text-lg"
                            >
                                G
                            </span>
                            <div className="min-w-0">
                                <h2
                                    ref={headingRef}
                                    id="google-health-heading"
                                    tabIndex={-1}
                                    className="text-base font-bold text-gray-900 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-solid)] focus-visible:ring-offset-2 md:text-lg"
                                >
                                    {t('title')}
                                </h2>
                                <p className="text-xs text-gray-500">{t('providerLabel')}</p>
                            </div>
                        </div>

                        <p className="mt-3 max-w-prose text-sm leading-6 text-gray-600">
                            {t('description')}
                        </p>
                        <ul className="mt-2 grid gap-1 text-xs leading-5 text-gray-600 md:grid-cols-2">
                            <li className="flex gap-2">
                                <span aria-hidden="true" className="text-[var(--theme-primary)]">✓</span>
                                <span>{t('scopeSteps')}</span>
                            </li>
                            <li className="flex gap-2">
                                <span aria-hidden="true" className="text-[var(--theme-primary)]">✓</span>
                                <span>{t('readOnly')}</span>
                            </li>
                            <li className="flex gap-2">
                                <span aria-hidden="true" className="text-[var(--theme-primary)]">✓</span>
                                <span>{t('storagePurpose')}</span>
                            </li>
                            <li className="flex gap-2">
                                <span aria-hidden="true" className="text-[var(--theme-primary)]">✓</span>
                                <span>{t('disconnectAnytime')}</span>
                            </li>
                        </ul>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 md:items-end">
                        <span
                            className={`inline-flex min-h-7 w-fit items-center rounded-full px-3 text-xs font-medium ${
                                loadError
                                    ? 'bg-red-50 text-red-700'
                                    : isConnected
                                    ? 'bg-green-50 text-green-700'
                                    : needsReconnect
                                        ? 'bg-amber-50 text-amber-800'
                                        : 'bg-gray-100 text-gray-600'
                            }`}
                        >
                            <span className="sr-only">{t('title')}: </span>
                            {t(`status_${displayStatus}`)}
                        </span>

                        {isConnected && lastSyncedAt && (
                            <p className="text-xs text-gray-500">
                                {t('lastSynced', { date: lastSyncedAt })}
                            </p>
                        )}

                        {available && !loadError && !isConnected && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleConnect}
                                    disabled={isConnecting}
                                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-semibold text-[var(--color-inverse-text)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-solid)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isConnecting && (
                                        <span
                                            aria-hidden="true"
                                            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                                        />
                                    )}
                                    {isConnecting
                                        ? t('connecting')
                                        : needsReconnect
                                            ? t('reconnect')
                                            : t('connect')}
                                </button>
                                <p className="max-w-xs text-xs leading-5 text-gray-500 md:text-right">
                                    {t('oauthRedirectHint')}
                                </p>
                            </>
                        )}

                        {needsReconnect && (
                            <p className="max-w-xs text-xs leading-5 text-amber-700 md:text-right">
                                {t('syncPausedDescription')}
                            </p>
                        )}

                        {!available && (
                            <p className="max-w-xs text-xs leading-5 text-amber-700 md:text-right">
                                {t('temporarilyUnavailable')}
                            </p>
                        )}

                        {(isConnected || needsReconnect) && (
                            <button
                                ref={triggerButtonRef}
                                type="button"
                                onClick={() => setIsDisconnectDialogOpen(true)}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                            >
                                {t('disconnect')}
                            </button>
                        )}
                    </div>
                </div>

                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                    <span className="font-semibold">{t('migrationTitle')}</span>{' '}
                    {t(
                        fitbitFallbackAvailable
                            ? 'migrationDescriptionFitbit'
                            : 'migrationDescriptionNoFitbit',
                    )}
                </div>

                {loadError && (
                    <div
                        role="alert"
                        className="mt-3 flex flex-col gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <p>{t('loadError')}</p>
                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={isRetryPending}
                            aria-busy={isRetryPending}
                            aria-live="polite"
                            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRetryPending && (
                                <span
                                    aria-hidden="true"
                                    className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-red-700"
                                />
                            )}
                            {isRetryPending ? t('retrying') : t('retry')}
                        </button>
                    </div>
                )}
            </section>

            {isMounted && isDisconnectDialogOpen && createPortal(
                <div
                    className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
                    onMouseDown={(event) => {
                        if (event.currentTarget === event.target && !isDisconnecting) {
                            setIsDisconnectDialogOpen(false);
                        }
                    }}
                >
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-busy={isDisconnecting}
                        aria-labelledby="google-health-disconnect-title"
                        aria-describedby="google-health-disconnect-description"
                        tabIndex={-1}
                        className="mb-[env(safe-area-inset-bottom)] max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-gray-200 bg-white p-4 shadow-xl sm:mb-0 sm:max-w-md sm:rounded-2xl sm:p-5"
                    >
                        <h2
                            id="google-health-disconnect-title"
                            className="text-lg font-bold text-gray-900"
                        >
                            {t('disconnectTitle')}
                        </h2>
                        <p
                            id="google-health-disconnect-description"
                            className="mt-2 text-sm leading-6 text-gray-600"
                        >
                            {t(
                                fitbitFallbackAvailable
                                    ? 'disconnectDescriptionFitbit'
                                    : 'disconnectDescriptionNoFallback',
                            )}
                        </p>
                        {message?.type === 'error' && (
                            <p role="alert" className="mt-3 text-sm text-red-700">
                                {message.text}
                            </p>
                        )}
                        <p className="sr-only" role="status" aria-atomic="true">
                            {isDisconnecting ? t('disconnecting') : ''}
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                                ref={cancelButtonRef}
                                type="button"
                                onClick={() => setIsDisconnectDialogOpen(false)}
                                disabled={isDisconnecting}
                                className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-solid)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleDisconnect}
                                disabled={isDisconnecting}
                                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isDisconnecting && (
                                    <span
                                        aria-hidden="true"
                                        className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                                    />
                                )}
                                {isDisconnecting ? t('disconnecting') : t('confirmDisconnect')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
