import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWebPushNotification } from "@/lib/web-push";

export const runtime = 'edge';

export async function GET(request: Request) {
    try {
        const session = await auth();

        if (!session || !session.user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userId = (session.user as any).id;

        // Fetch subscriptions
        const { data: subs, error } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', userId);

        if (error || !subs || subs.length === 0) {
            return NextResponse.json({ error: 'No subscriptions found for user' }, { status: 404 });
        }

        const results = [];
        for (const sub of subs) {
            try {
                const result = await sendWebPushNotification(sub, {
                    title: 'Test Notification',
                    body: 'This is a test notification from the UCFitness API.',
                    url: '/profile'
                });

                // Cleanup stale subscriptions
                // 410: Gone (Unsubscribed / Expired)
                // 403: Forbidden (Key mismatch / Invalid)
                if (result.statusCode === 410 || result.statusCode === 403) {
                    console.log(`Cleaning up stale subscription ${sub.id} (Status: ${result.statusCode})`);
                    await supabaseAdmin
                        .from('push_subscriptions')
                        .delete()
                        .eq('id', sub.id);

                    result.cleanedUp = true;
                }

                results.push(result);
            } catch (e: any) {
                results.push({ success: false, error: e.message });
            }
        }

        return NextResponse.json({
            message: 'Test notifications sent',
            count: subs.length,
            results
        });

    } catch (error: any) {
        console.error("Test Push Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
