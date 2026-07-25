import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { AppError, reportError } from '@/lib/errors';
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

const SUBSCRIBE_FAILURES = { save: ['push/subscribe:save', 'Push subscription save failed', 'PUSH_SUBSCRIPTION_SAVE_FAILED'], list: ['push/subscribe:listExisting', 'Push subscription lookup failed', 'PUSH_SUBSCRIPTION_LIST_FAILED'], prune: ['push/subscribe:pruneSuperseded', 'Push subscription prune failed', 'PUSH_SUBSCRIPTION_PRUNE_FAILED'], request: ['push/subscribe', 'Push subscription request failed', 'PUSH_SUBSCRIPTION_REQUEST_FAILED'], delete: ['push/subscribe:delete', 'Push subscription deletion failed', 'PUSH_SUBSCRIPTION_DELETE_FAILED'], deleteRequest: ['push/subscribe:delete', 'Push subscription delete request failed', 'PUSH_SUBSCRIPTION_DELETE_REQUEST_FAILED'] } as const;
function reportSubscribeFailure(failure: keyof typeof SUBSCRIBE_FAILURES): void { const [operation, message, code] = SUBSCRIBE_FAILURES[failure]; reportError(operation, new AppError(message, code)); }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
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
            reportSubscribeFailure('save');
            return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
        }

        const { data: existingSubscriptions, error: listError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth, user_agent, created_at')
            .eq('user_id', userId);
        if (listError) {
            reportSubscribeFailure('list');
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
                reportSubscribeFailure('prune');
                return NextResponse.json({ success: true, pruned: 0 });
            }
        }

        return NextResponse.json({ success: true, pruned: staleIds.length });
    } catch {
        reportSubscribeFailure('request');
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
            reportSubscribeFailure('delete');
            return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        reportSubscribeFailure('deleteRequest');
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
