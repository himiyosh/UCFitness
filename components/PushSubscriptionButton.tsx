'use client';

import { useState, useEffect } from 'react';

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

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            registerServiceWorker();
        }
    }, []);

    const registerServiceWorker = async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            const sub = await registration.pushManager.getSubscription();
            setSubscription(sub);
        } catch (error) {
            console.error('Service Worker creation failed', error);
        }
    };

    const subscribeToPush = async () => {
        setLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

            if (!vapidKey) {
                alert('VAPID Public Key is missing!');
                return;
            }

            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });

            setSubscription(sub);

            // Send subscription to backend
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sub)
            });

            alert('Notifications enabled!');
        } catch (error) {
            console.error('Failed to subscribe', error);
            alert('Failed to subscribe to notifications.');
        } finally {
            setLoading(false);
        }
    };

    const unsubscribeFromPush = async () => {
        setLoading(true);
        try {
            if (subscription) {
                await subscription.unsubscribe();
                // Optionally notify backend to delete, but local unsubscribe satisfies the "stop receiving" part.
                setSubscription(null);
            }
        } catch (error) {
            console.error('Error unsubscribing', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isSupported) {
        return <div className="text-sm text-gray-500">Push notifications are not supported in this browser.</div>;
    }

    return (
        <div className="flex flex-col items-start gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            <p className="text-sm text-gray-600 mb-2">Enable push notifications to get updates when you earn a badge!</p>

            {subscription ? (
                <div className="flex items-center gap-3">
                    <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Active
                    </span>
                    <button
                        onClick={unsubscribeFromPush}
                        disabled={loading}
                        className="text-xs text-red-500 hover:text-red-700 underline"
                    >
                        Disable
                    </button>
                </div>
            ) : (
                <button
                    onClick={subscribeToPush}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                    {loading ? 'Enabling...' : 'Enable Notifications'}
                </button>
            )}
        </div>
    );
}
