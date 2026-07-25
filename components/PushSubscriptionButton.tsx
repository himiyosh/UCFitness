'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

import {
    releasePushSubscriptionForCurrentRecipient,
    savePushSubscriptionForCurrentRecipient,
    synchronizePushRecipientForSession,
} from '@/lib/push-recipient-state';

import { useToast } from '@/components/ui/Toast';

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function PushSubscriptionButton() {
    const [isSupported, setIsSupported] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [loading, setLoading] = useState(false);
    const t = useTranslations('Notifications');
    const toast = useToast();

    const registerServiceWorker = useCallback(async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            await registration.update();
            setSubscription(await synchronizePushRecipientForSession());
        } catch (error: unknown) {
            void error;
        }
    }, []);

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            registerServiceWorker();
        }
    }, [registerServiceWorker]);

    const subscribeToPush = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

            if (!vapidKey) {
                toast.error(t('missingKey'));
                setLoading(false);
                return;
            }

            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });

            await savePushSubscriptionForCurrentRecipient(sub);

            setSubscription(sub);
            toast.success(t('success'));
        } catch (error: unknown) {
            void error;
            toast.error(t('error'));
        } finally {
            setLoading(false);
        }
    }, [loading, toast, t]);

    const unsubscribeFromPush = useCallback(async () => {
        if (loading || !subscription) return;
        setLoading(true);
        try {
            await releasePushSubscriptionForCurrentRecipient(subscription);

            setSubscription(null);
            toast.success(t('disabled') ?? 'Notifications disabled');
        } catch (error: unknown) {
            void error;
            toast.error(t('error'));
        } finally {
            setLoading(false);
        }
    }, [loading, subscription, toast, t]);

    if (!isSupported) {
        return <div className="text-sm text-gray-500" role="status">{t('notSupported')}</div>;
    }

    return (
        <div className="flex flex-col items-start gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <h3 className="font-semibold text-gray-900">{t('title')}</h3>
            <p className="text-sm text-gray-600 mb-2">{t('description')}</p>

            {subscription ? (
                <div className="flex items-center gap-3">
                    <span className="text-sm text-green-600 font-medium flex items-center gap-1" role="status">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        {t('active')}
                    </span>
                    <button
                        onClick={unsubscribeFromPush}
                        disabled={loading}
                        aria-label={t('disable')}
                        className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-xs text-red-500 underline hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
                    >
                        {loading && (
                            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        )}
                        {t('disable')}
                    </button>
                </div>
            ) : (
                <button
                    onClick={subscribeToPush}
                    disabled={loading}
                    aria-label={t('enable')}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:opacity-50"
                >
                    {loading && (
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    )}
                    {loading ? t('enabling') : t('enable')}
                </button>
            )}
        </div>
    );
}
