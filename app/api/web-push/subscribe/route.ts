import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = 'edge';

export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const subscription = await request.json();

        // 🛡️ セキュリティ: サブスクリプションオブジェクトとキーの検証
        if (!subscription || !subscription.endpoint
            || !subscription.keys?.p256dh || !subscription.keys?.auth) {
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
            reportError('web-push/subscribe:save', error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        reportError('web-push/subscribe', error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
