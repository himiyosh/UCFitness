'use client';

import { useState, useEffect, useCallback } from 'react';

import {
    releasePushSubscriptionForCurrentRecipient,
    savePushSubscriptionForCurrentRecipient,
    synchronizePushRecipientForSession,
} from '@/lib/push-recipient-state';

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

export function useWebPush() {
    const [isSupported, setIsSupported] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [loading, setLoading] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
            setIsSupported(true);
            setPermission(Notification.permission);
            registerServiceWorker();
        }
    }, []);

    const registerServiceWorker = async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            await registration.update();
            setSubscription(await synchronizePushRecipientForSession());
        } catch (error: unknown) {
            console.error('Service Worker registration failed');
        }
    };

    const subscribeToPush = useCallback(async () => {
        setLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

            if (!vapidKey) {
                console.error('VAPID Public Key is missing!');
                return false;
            }

            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });

            setSubscription(sub);
            setPermission(Notification.permission);

            await savePushSubscriptionForCurrentRecipient(sub);

            return true;
        } catch (error: unknown) {
            console.error('Failed to subscribe to push notifications');
            // Permissions might have been denied during the process
            setPermission(Notification.permission);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    const unsubscribeFromPush = useCallback(async () => {
        setLoading(true);
        try {
            if (subscription) {
                await releasePushSubscriptionForCurrentRecipient(subscription);
                setSubscription(null);
            }
            return true;
        } catch (error: unknown) {
            console.error('Failed to unsubscribe from push notifications');
            return false;
        } finally {
            setLoading(false);
        }
    }, [subscription]);

    return {
        isSupported,
        subscription,
        loading,
        permission,
        subscribeToPush,
        unsubscribeFromPush
    };
}
