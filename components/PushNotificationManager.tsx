'use client';

import { useState, useEffect } from 'react';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export default function PushNotificationManager() {
    const [isSupported, setIsSupported] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            registerServiceWorker();
        }
    }, []);

    async function registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            const sub = await registration.pushManager.getSubscription();
            setSubscription(sub);
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

            setSubscription(sub);

            // Send to server
            await fetch('/api/web-push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sub)
            });

            setMessage('Notifications enabled!');
        } catch (error) {
            console.error('Subscription failed:', error);
            setMessage('Failed to enable notifications.');
        } finally {
            setLoading(false);
        }
    }

    async function unsubscribeFromPush() {
        setLoading(true);
        try {
            if (subscription) {
                await subscription.unsubscribe();
                setSubscription(null);
                // Optional: Notify server to delete subscription
                // await fetch('/api/web-push/unsubscribe', ...); 
                setMessage('Notifications disabled.');
            }
        } catch (error) {
            console.error('Unsubscribe failed:', error);
        } finally {
            setLoading(false);
        }
    }

    if (!isSupported) {
        return <div className="text-gray-500 text-sm">Push notifications are not supported on this browser.</div>;
    }

    return (
        <div className="w-full">
            <p className="text-xs text-slate-500 font-medium mb-4">
                ✨ Don't miss out on your victories! <br />Get notified when you unlock new badges! 🏆
            </p>

            {!subscription ? (
                <button
                    onClick={subscribeToPush}
                    disabled={loading}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
                >
                    {loading ? (
                        <>
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Setting up... 🚀
                        </>
                    ) : '🔔 Enable Notifications'}
                </button>
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="w-full px-4 py-2.5 bg-green-50 border border-green-100 text-green-700 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Notifications Active
                    </div>
                    <button
                        onClick={unsubscribeFromPush}
                        disabled={loading}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                        Disable Notifications (Reset)
                    </button>
                </div>
            )}

            {message && (
                <p className={`mt-3 text-xs font-bold text-center animate-in fade-in slide-in-from-bottom-1 ${message.includes('Failed') ? 'text-red-500' : 'text-[var(--theme-primary)]'}`}>
                    {message} {message.includes('enabled') ? '🎉' : ''}
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
