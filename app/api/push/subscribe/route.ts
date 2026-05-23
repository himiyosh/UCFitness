import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';

const PUSH_ENDPOINT_HOSTS = [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com',
    'notify.windows.com',
];

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
    if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;

    try {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:') return false;
        return PUSH_ENDPOINT_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch {
        return false;
    }
}

function isValidPushKey(value: unknown, maxLength: number): value is string {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= maxLength
        && BASE64URL_PATTERN.test(value);
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const user = session?.user;

    if (!user || !(user as any).id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const subscription = await request.json();

        // 🛡️ セキュリティ: サブスクリプションオブジェクトとキーの検証
        if (!subscription || !subscription.endpoint || !subscription.keys
            || !subscription.keys.p256dh || !subscription.keys.auth) {
            return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
        }

        if (!isAllowedPushEndpoint(subscription.endpoint)
            || !isValidPushKey(subscription.keys.p256dh, 256)
            || !isValidPushKey(subscription.keys.auth, 128)) {
            return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                user_id: (user as any).id,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_agent: request.headers.get('user-agent'),
            }, { onConflict: 'user_id, endpoint' });

        if (error) {
            reportError('push/subscribe:save', error);
            return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        reportError('push/subscribe', err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}


export async function DELETE(request: NextRequest) {
    const session = await auth();
    const user = session?.user;

    if (!user || !(user as any).id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { endpoint } = await request.json();

        if (!isAllowedPushEndpoint(endpoint)) {
            return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .match({ user_id: (user as any).id, endpoint });

        if (error) {
            reportError('push/subscribe:delete', error);
            return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        reportError('push/subscribe:delete', err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
