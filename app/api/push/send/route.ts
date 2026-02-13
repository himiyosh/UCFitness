import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushNotification } from '@/lib/web-push';
import { reportError } from '@/lib/errors';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        const { message } = await request.json();

        // Validate message input
        if (message !== undefined && (typeof message !== 'string' || message.length > 500)) {
            return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
        }

        // Fetch user's subscriptions (select only needed columns)
        const { data: subscriptions } = await supabaseAdmin
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', userId);

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ message: 'No subscriptions found for user' });
        }

        // Send notifications in parallel
        const results = await Promise.allSettled(
            subscriptions.map(sub => {
                const pushSub = {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth }
                };
                return sendWebPushNotification(pushSub as any, {
                    title: 'Test Notification',
                    body: message || 'This is a test notification from UCFitness!',
                    url: '/profile'
                });
            })
        );

        const sentCount = results.filter(
            r => r.status === 'fulfilled' && r.value.success
        ).length;

        return NextResponse.json({ success: true, sentCount });
    } catch (error: unknown) {
        reportError('push/send', error, { userId });
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
