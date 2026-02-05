import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = 'edge';

export async function POST(request: Request) {
    const session = await auth();

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const subscription = await request.json();

        if (!subscription || !subscription.endpoint) {
            return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
        }

        // Save to Database
        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                user_id: session.user.id,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                created_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, endpoint'
            });

        if (error) {
            console.error('Failed to save subscription:', error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Subscription error:', error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
