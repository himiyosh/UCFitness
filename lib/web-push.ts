import { SignJWT, importPKCS8, importJWK } from 'jose';

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    url?: string;
}

// Helper to handle Base64URL encoding/decoding for Key conversion
function base64UrlToUint8Array(base64Url: string) {
    const padding = '='.repeat((4 - base64Url.length % 4) % 4);
    const base64 = (base64Url + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('binary');

    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function uint8ArrayToBase64Url(uint8Array: Uint8Array) {
    const base64 = typeof btoa === 'function'
        ? btoa(String.fromCharCode(...uint8Array))
        : Buffer.from(uint8Array).toString('base64');

    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export const sendWebPushNotification = async (subscription: any, payload: PushPayload) => {
    try {
        if (!subscription || !subscription.endpoint) {
            throw new Error('Invalid subscription object');
        }

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
        const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

        if (!vapidPublicKey || !vapidPrivateKey) {
            console.error('Missing VAPID keys');
            return { success: false, error: { message: 'Server configuration error: Missing VAPID keys' } };
        }

        // 1. Generate JWT for VAPID
        // We use the 'jose' library which is Edge compatible
        const currentUrl = new URL(subscription.endpoint);
        const origin = `${currentUrl.protocol}//${currentUrl.host}`;

        let privateKey;

        // Smart Key Import: Handle both PEM and simple Base64URL (web-push standard)
        try {
            if (vapidPrivateKey.trim().startsWith('-----')) {
                // Handle PEM format
                const formattedKey = vapidPrivateKey.replace(/\\n/g, '\n');
                privateKey = await importPKCS8(formattedKey, 'ES256');
            } else {
                // Handle Base64URL format (standard web-push generate-vapid-keys output)
                // We need to construct a valid JWK for P-256
                const publicBytes = base64UrlToUint8Array(vapidPublicKey);

                // Validation: Uncompressed P-256 point is 65 bytes (0x04 + 32bytes X + 32bytes Y)
                if (publicBytes.length === 65 && publicBytes[0] === 0x04) {
                    const x = uint8ArrayToBase64Url(publicBytes.slice(1, 33));
                    const y = uint8ArrayToBase64Url(publicBytes.slice(33, 65));
                    const d = vapidPrivateKey; // Assumed correct Base64URL scalar

                    privateKey = await importJWK({
                        kty: 'EC',
                        crv: 'P-256',
                        x, y, d,
                        ext: true
                    }, 'ES256');
                } else {
                    throw new Error('Invalid VAPID Public Key length. Expected uncompressed P-256 point (65 bytes).');
                }
            }
        } catch (keyError: any) {
            console.error("VAPID Key Import Error:", keyError);
            return {
                success: false, error: {
                    message: `Failed to import VAPID Key: ${keyError.message}`,
                    stack: keyError.stack
                }
            };
        }

        const token = await new SignJWT({
            aud: origin,
            sub: vapidSubject,
            exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60) // 12 hours
        })
            .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
            .sign(privateKey);

        // 2. Prepare Headers
        const headers: Record<string, string> = {
            'Authorization': `vapid t=${token}, k=${vapidPublicKey}`,
            'TTL': '60',
        };

        // 3. Send Notification (Tickle - No Payload)
        // Since payload encryption (ECE) is complex on Edge without 'web-push' or 'crypto',
        // we send an empty body. The Service Worker will handle this by showing a default message.
        const response = await fetch(subscription.endpoint, {
            method: 'POST',
            headers: headers,
            body: null // Tickle
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('Web Push Service Error:', response.status, text);
            return {
                success: false,
                statusCode: response.status,
                error: { message: `Push Service responded with ${response.status}: ${text}` }
            };
        }

        return { success: true, statusCode: 201 };

    } catch (error: any) {
        console.error('Error sending web push notification:', error);
        return {
            success: false,
            statusCode: 500,
            error: {
                message: error.message || 'Unknown error',
                name: error.name,
                stack: error.stack
            }
        };
    }
};
