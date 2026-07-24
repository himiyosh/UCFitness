import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import {
    findSupersededSubscriptionIds,
    isAllowedPushEndpoint,
    isValidPushSubscriptionKeys,
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

function isStoredPushSubscription(value: unknown): value is { id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; created_at: string } {
    return isRecord(value) && typeof value.id === 'string' && typeof value.endpoint === 'string' && typeof value.p256dh === 'string' && typeof value.auth === 'string' && (value.user_agent === null || typeof value.user_agent === 'string') && typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at));
}

function isPushSubscriptionRequest(value: unknown): value is PushSubscriptionRequest {
    if (!isRecord(value) || !isRecord(value.keys)) return false;
    return isAllowedPushEndpoint(value.endpoint)
        && typeof value.keys.p256dh === 'string'
        && typeof value.keys.auth === 'string';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const subscription: unknown = await request.json();
        if (!isPushSubscriptionRequest(subscription)
            || !await isValidPushSubscriptionKeys(subscription.keys.p256dh, subscription.keys.auth)) {
            return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
        }

        const userId = session.user.id;
        const userAgent = request.headers.get('user-agent');
        const { data: claimedSubscriptions, error: claimError } = await supabaseAdmin.rpc(
            'claim_push_subscription_endpoint',
            { p_user_id: userId, p_endpoint: subscription.endpoint, p_p256dh: subscription.keys.p256dh, p_auth: subscription.keys.auth, p_user_agent: userAgent },
        );
        const currentSubscription = Array.isArray(claimedSubscriptions) && claimedSubscriptions.length === 1 && isStoredPushSubscription(claimedSubscriptions[0]) ? claimedSubscriptions[0] : null;
        if (claimError || !currentSubscription) {
            const limitReached = isRecord(claimError) && claimError.code === 'P0001';
            if (!limitReached) reportError('push/subscribe:claim', claimError ?? new Error('Push subscription claim returned invalid data'), { userId });
            return NextResponse.json({ error: limitReached ? 'Push subscription limit reached' : 'Failed to save subscription' }, { status: limitReached ? 409 : 500 });
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
