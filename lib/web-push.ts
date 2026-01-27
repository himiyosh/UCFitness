import webpush from 'web-push';

if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn("VAPID Keys are missing. Web Push notifications will not work.");
} else {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    url?: string;
}

export const sendWebPushNotification = async (subscription: webpush.PushSubscription, payload: PushPayload) => {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return { success: true };
    } catch (error) {
        console.error('Error sending web push notification:', error);
        return { success: false, error };
    }
};
