import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushNotifications } from '@/lib/api/web-push';
import { reportError } from '@/lib/errors';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
    normalizePushLocale,
    testNotificationBody,
    testNotificationTitle,
} from '@/lib/services/push-messages';

export const runtime = 'edge';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const rateLimit = checkRateLimit(`push-send:${userId}`, 5, 60_000);
    if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit.retryAfterSeconds);
    }

    try {
        const body: unknown = await request.json();
        const message = isRecord(body) ? body.message : undefined;

        // Validate message input
        if (message !== undefined && (typeof message !== 'string' || message.length > 500)) {
            return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
        }

        const [userResult, subscriptionsResult] = await Promise.all([
            supabaseAdmin
                .from('users')
                .select('language, username')
                .eq('id', userId)
                .single(),
            supabaseAdmin
                .from('push_subscriptions')
                .select('id, endpoint, p256dh, auth, user_agent, created_at')
                .eq('user_id', userId),
        ]);
        if (userResult.error) {
            reportError('push/send:user', userResult.error, { userId });
            return NextResponse.json({ error: 'Failed to load notification language' }, {
                status: 500,
            });
        }
        if (subscriptionsResult.error) {
            reportError('push/send:subscriptions', subscriptionsResult.error, { userId });
            return NextResponse.json({ error: 'Failed to load subscriptions' }, { status: 500 });
        }

        const subscriptions = subscriptionsResult.data;
        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({
                success: false,
                code: 'NO_SUBSCRIPTIONS',
                sentCount: 0,
            });
        }

        const locale = normalizePushLocale(userResult.data?.language);
        const username = userResult.data?.username;
        const delivery = await sendWebPushNotifications(userId, subscriptions, {
            title: testNotificationTitle(locale),
            body: typeof message === 'string' && message.trim().length > 0
                ? message.trim()
                : testNotificationBody(locale),
            url: username ? `/user/${encodeURIComponent(username)}` : '/',
            locale,
            tag: 'test-notification',
        });
        const success = delivery.sent > 0;

        return NextResponse.json(
            {
                success,
                sentCount: delivery.sent,
                failedCount: delivery.failed,
                deduplicated: delivery.skippedDuplicates,
            },
            { status: success ? 200 : 502 },
        );
    } catch (error: unknown) {
        reportError('push/send', error, { userId });
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
