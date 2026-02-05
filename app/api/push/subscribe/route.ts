import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
    const session = await auth();
    const user = session?.user;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const subscription = await request.json();

        // Basic Validation
        if (!subscription || !subscription.endpoint || !subscription.keys) {
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
            console.error('Database error saving subscription:', error);
            return NextResponse.json({ error: `Failed to save subscription: ${error.message || error.details || JSON.stringify(error)}` }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('Error processing subscription:', err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}


export async function DELETE(request: NextRequest) {
    const session = await auth();
    const user = session?.user;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { endpoint } = await request.json();

        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .match({ user_id: (user as any).id, endpoint });

        if (error) {
            console.error('Database error deleting subscription:', error);
            return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('Error processing unsubscribe:', err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
