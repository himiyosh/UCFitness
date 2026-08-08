export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import {
    findSupersededSubscriptionIds,
    getPushEndpointOwnershipKey,
    isValidPushSubscriptionKeys,
} from '@/lib/api/web-push';
import { AppError, reportError } from '@/lib/errors';
import {
    REQUIRED_RECIPIENT_PROTOCOL_VERSION,
    readPushSubscriptionGenerations,
    releasePushSubscription,
    savePushSubscription,
} from '@/lib/services/push-subscription-ownership';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidUUID } from '@/lib/validation';

interface PushSubscriptionRequest {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    recipientProtocolVersion: number;
}

interface StoredPushSubscription {
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent: string | null;
    created_at: string | null;
}

function isPushSubscriptionRequest(value: unknown): value is PushSubscriptionRequest {
    if (!isRecord(value) || !isRecord(value.keys)) return false;
    return typeof value.endpoint === 'string'
        && typeof value.keys.p256dh === 'string'
        && typeof value.keys.auth === 'string'
        && value.recipientProtocolVersion === REQUIRED_RECIPIENT_PROTOCOL_VERSION;
}

function failure(operation: string, error: unknown, message: string, code: string): NextResponse {
    if (error instanceof AppError && (error.code === 'PUSH_SUBSCRIPTION_LIMIT_REACHED'
        || error.code === 'PUSH_SUBSCRIPTION_OWNERSHIP_CONFLICT')) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    reportError(operation, error instanceof AppError ? error : new AppError(message, code));
    return NextResponse.json({ error: message }, { status: 500 });
}

function isStoredPushSubscription(value: unknown, userId: string): value is StoredPushSubscription {
    return isRecord(value)
        && isValidUUID(value.id)
        && typeof value.user_id === 'string'
        && value.user_id.toLowerCase() === userId.toLowerCase()
        && typeof value.endpoint === 'string'
        && typeof value.p256dh === 'string'
        && typeof value.auth === 'string'
        && (value.user_agent === null || typeof value.user_agent === 'string')
        && (value.created_at === null || typeof value.created_at === 'string');
}

async function getStoredPushSubscriptions(userId: string): Promise<StoredPushSubscription[]> {
    const { data, error } = await supabaseAdmin
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth, user_agent, created_at')
        .eq('user_id', userId);

    if (error !== null) {
        throw new AppError('Push subscription lookup failed', 'PUSH_SUBSCRIPTION_LOOKUP_FAILED');
    }
    if (!Array.isArray(data) || !data.every((row) => isStoredPushSubscription(row, userId))) {
        throw new AppError('Push subscription lookup returned an invalid result', 'PUSH_SUBSCRIPTION_LOOKUP_RESULT_INVALID');
    }
    return data;
}

async function deleteIfUnchanged(row: StoredPushSubscription): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('delete_push_subscription_if_unchanged', {
        p_id: row.id,
        p_user_id: row.user_id,
        p_endpoint: row.endpoint,
        p_p256dh: row.p256dh,
        p_auth: row.auth,
        p_user_agent: row.user_agent,
        p_created_at: row.created_at,
    });
    if (error !== null) {
        throw new AppError('Push subscription cleanup failed', 'PUSH_SUBSCRIPTION_CLEANUP_FAILED');
    }
    if (typeof data !== 'boolean') {
        throw new AppError('Push subscription cleanup returned an invalid result', 'PUSH_SUBSCRIPTION_CLEANUP_RESULT_INVALID');
    }
    return data;
}

async function pruneSupersededPushSubscriptions(
    userId: string,
    current: Pick<StoredPushSubscription, 'id' | 'endpoint' | 'p256dh' | 'auth' | 'user_agent' | 'created_at'>,
): Promise<number> {
    const subscriptions = await getStoredPushSubscriptions(userId);
    const currentSubscription = subscriptions.find((subscription) => subscription.id === current.id)
        ?? current;
    const staleIds = new Set(findSupersededSubscriptionIds(
        subscriptions,
        currentSubscription,
        currentSubscription.user_agent,
    ));
    const results = await Promise.all(subscriptions
        .filter((subscription) => staleIds.has(subscription.id))
        .map(deleteIfUnchanged));
    return results.filter(Boolean).length;
}

async function releaseCurrentPushSubscription(
    userId: string,
    endpoint: string,
    ownershipKey: string,
): Promise<'missing' | 'stale' | 'released'> {
    const subscriptions = await getStoredPushSubscriptions(userId);
    const subscription = subscriptions.find((item) => item.endpoint === endpoint);
    if (!subscription) return 'missing';

    const subscriptionId = subscription.id.toLowerCase();
    const authority = (await readPushSubscriptionGenerations({
        userId,
        observations: [{ subscriptionId, ownershipKey }],
    })).get(subscriptionId);
    if (!authority) return await deleteIfUnchanged(subscription) ? 'released' : 'stale';

    return await releasePushSubscription({
        userId,
        endpoint,
        ownershipKey,
        recipientGeneration: authority.recipientGeneration,
        ownershipVersion: authority.ownershipVersion,
    }) ? 'released' : 'stale';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const subscription: unknown = await request.json().catch(() => null);
        const userAgent = request.headers.get('user-agent');
        if (!isPushSubscriptionRequest(subscription)
            || (userAgent !== null && userAgent.length > 2048)) {
            return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
        }
        const ownershipKey = getPushEndpointOwnershipKey(subscription.endpoint);
        if (ownershipKey === null
            || !await isValidPushSubscriptionKeys(subscription.keys.p256dh, subscription.keys.auth)) {
            return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
        }
        let saved;
        let pruned = 0;
        try {
            saved = await savePushSubscription({
                userId: session.user.id, endpoint: subscription.endpoint, ownershipKey,
                p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent,
            });
        } catch (error: unknown) {
            if (!(error instanceof AppError) || error.code !== 'PUSH_SUBSCRIPTION_LIMIT_REACHED') {
                throw error;
            }
            pruned = await pruneSupersededPushSubscriptions(session.user.id, {
                id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_agent: userAgent,
                created_at: new Date().toISOString(),
            });
            if (pruned === 0) throw error;
            saved = await savePushSubscription({
                userId: session.user.id, endpoint: subscription.endpoint, ownershipKey,
                p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent,
            });
        }
        try {
            pruned += await pruneSupersededPushSubscriptions(session.user.id, {
                id: saved.subscriptionId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_agent: userAgent,
                created_at: null,
            });
        } catch (error: unknown) {
            reportError('push/subscribe:pruneSuperseded', error instanceof AppError
                ? error : new AppError('Push subscription cleanup failed', 'PUSH_SUBSCRIPTION_CLEANUP_FAILED'));
        }
        return NextResponse.json({
            success: true, pruned, recipientGeneration: saved.recipientGeneration,
            recipientVersion: saved.ownershipVersion,
            recipientProtocolVersion: saved.recipientProtocolVersion,
        });
    } catch (error: unknown) {
        return failure('push/subscribe:save', error, 'Failed to save subscription', 'PUSH_SUBSCRIPTION_SAVE_FAILED');
    }
}


export async function DELETE(request: NextRequest): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body: unknown = await request.json().catch(() => null);
        const endpoint = isRecord(body) ? body.endpoint : undefined;
        const ownershipKey = getPushEndpointOwnershipKey(endpoint);
        if (typeof endpoint !== 'string' || ownershipKey === null) {
            return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
        }
        const release = await releaseCurrentPushSubscription(session.user.id, endpoint, ownershipKey);
        if (release === 'missing') return NextResponse.json({ success: true });
        if (release === 'stale') {
            return NextResponse.json({
                error: 'Push subscription ownership changed',
                code: 'PUSH_SUBSCRIPTION_OWNERSHIP_CONFLICT',
            }, { status: 409 });
        }
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return failure('push/subscribe:delete', error, 'Failed to delete subscription', 'PUSH_SUBSCRIPTION_DELETE_FAILED');
    }
}
