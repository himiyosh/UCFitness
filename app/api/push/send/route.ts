import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushNotification } from '@/lib/web-push';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
    const session = await auth();
    const user = session?.user;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { message } = await request.json();

        // Fetch user's subscriptions
        const { data: subscriptions } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', (user as any).id);

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ message: 'No subscriptions found for user' });
        }

        let sentCount = 0;
        for (const sub of subscriptions) {
            // Construct push subscription object expected by web-push
            const pushSub = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };

            const result = await sendWebPushNotification(pushSub as any, {
                title: 'Test Notification',
                body: message || 'This is a test notification from UCFitness!',
                url: '/profile'
            });

            if (result.success) {
                sentCount++;
            }
        }

        return NextResponse.json({ success: true, sentCount });
    } catch (err: any) {
        console.error('Error sending test push:', err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
