'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import {
    releasePushSubscriptionForCurrentRecipient,
    savePushSubscriptionForCurrentRecipient,
    synchronizePushRecipientForSession,
} from '@/lib/push-recipient-state';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export default function PushNotificationManager() {
    const t = useTranslations('Notifications');
    const [isSupported, setIsSupported] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            registerServiceWorker();
        }
    }, []);

    async function registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            await registration.update();
            setSubscription(await synchronizePushRecipientForSession());
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    async function subscribeToPush() {
        setLoading(true);
        setMessage('');
        try {
            const registration = await navigator.serviceWorker.ready;

            if (!vapidPublicKey) {
                throw new Error('VAPID Public Key is missing');
            }

            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });

            await savePushSubscriptionForCurrentRecipient(sub);

            setSubscription(sub);
            setMessage(t('success'));
            setMessageType('success');
        } catch (error) {
            console.error('Subscription failed:', error);
            setMessage(t('error'));
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    }

    async function unsubscribeFromPush() {
        setLoading(true);
        try {
            if (subscription) {
                await releasePushSubscriptionForCurrentRecipient(subscription);
                setSubscription(null);
                setMessage(t('disabled'));
                setMessageType('success');
            }
        } catch (error) {
            console.error('Unsubscribe failed:', error);
            setMessage(t('disableError'));
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    }

    if (!isSupported) {
        return <div className="text-gray-500 text-sm">{t('notSupported')}</div>;
    }

    return (
        <div className="w-full">
            <p className="text-xs text-slate-500 font-medium mb-4 whitespace-pre-line">
                {t('description')}
            </p>

            {!subscription ? (
                <button
                    onClick={subscribeToPush}
                    disabled={loading}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary-solid)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-strong)] disabled:opacity-50"
                >
                    {loading ? (
                        <>
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('enabling')}
                        </>
                    ) : t('enable')}
                </button>
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="w-full px-4 py-2.5 bg-green-50 border border-green-100 text-green-700 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        {t('active')}
                    </div>
                    <button
                        onClick={unsubscribeFromPush}
                        disabled={loading}
                        className="min-h-[44px] px-3 text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                        {t('disable')}
                    </button>
                </div>
            )}

            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{messageType === 'success' ? message : ''}</span>
            <span className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{messageType === 'error' ? message : ''}</span>
            {message && (
                <p className={`mt-3 text-center text-xs font-bold ${messageType === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--theme-primary)]'}`}>
                    {message} {messageType === 'success' && message === t('success') ? '🎉' : ''}
                </p>
            )}
        </div>
    );
}

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
