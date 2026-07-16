import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import {
    findSupersededSubscriptionIds,
    isAllowedPushEndpoint,
    isValidPushKey,
} from '@/lib/api/web-push';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';

interface PushSubscriptionRequest {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isPushSubscriptionRequest(value: unknown): value is PushSubscriptionRequest {
    if (!isRecord(value) || !isRecord(value.keys)) return false;
    return isAllowedPushEndpoint(value.endpoint)
        && isValidPushKey(value.keys.p256dh, 256)
        && isValidPushKey(value.keys.auth, 128);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const subscription: unknown = await request.json();
        if (!isPushSubscriptionRequest(subscription)) {
            return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
        }

        const userId = session.user.id;
        const userAgent = request.headers.get('user-agent');
        const { data: currentSubscription, error: upsertError } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                user_id: userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_agent: userAgent,
                created_at: new Date().toISOString(),
            }, { onConflict: 'user_id, endpoint' })
            .select('id, endpoint, p256dh, auth, user_agent, created_at')
            .single();

        if (upsertError || !currentSubscription) {
            reportError('push/subscribe:save', upsertError, { userId });
            return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
        }

        const { data: existingSubscriptions, error: listError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth, user_agent, created_at')
            .eq('user_id', userId);
        if (listError) {
            reportError('push/subscribe:listExisting', listError, { userId });
            return NextResponse.json({ success: true, pruned: 0 });
        }

        const staleIds = findSupersededSubscriptionIds(
            existingSubscriptions ?? [],
            currentSubscription,
            userAgent,
        );
        if (staleIds.length > 0) {
            const { error: pruneError } = await supabaseAdmin
                .from('push_subscriptions')
                .delete()
                .eq('user_id', userId)
                .in('id', staleIds);
            if (pruneError) {
                reportError('push/subscribe:pruneSuperseded', pruneError, {
                    userId,
                    count: staleIds.length,
                });
                return NextResponse.json({ success: true, pruned: 0 });
            }
        }

        return NextResponse.json({ success: true, pruned: staleIds.length });
    } catch (err: unknown) {
        reportError('push/subscribe', err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}


export async function DELETE(request: NextRequest): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body: unknown = await request.json();
        const endpoint = isRecord(body) ? body.endpoint : undefined;

        if (!isAllowedPushEndpoint(endpoint)) {
            return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .match({ user_id: session.user.id, endpoint });

        if (error) {
            reportError('push/subscribe:delete', error, { userId: session.user.id });
            return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        reportError('push/subscribe:delete', err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
