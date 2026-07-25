export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getPushEndpointOwnershipKey, isValidPushSubscriptionKeys } from '@/lib/api/web-push';
import { AppError, reportError } from '@/lib/errors';
import { pruneSupersededPushSubscriptions, releaseCurrentPushSubscription, savePushSubscription } from '@/lib/services/push-subscription-ownership';
import { isRecord } from '@/lib/validation';

interface PushSubscriptionRequest {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    recipientProtocolVersion: number;
}

function isPushSubscriptionRequest(value: unknown): value is PushSubscriptionRequest {
    if (!isRecord(value) || !isRecord(value.keys)) return false;
    return typeof value.endpoint === 'string'
        && typeof value.keys.p256dh === 'string'
        && typeof value.keys.auth === 'string'
        && value.recipientProtocolVersion === 1;
}

function failure(operation: string, error: unknown, message: string, code: string): NextResponse {
    if (error instanceof AppError && (error.code === 'PUSH_SUBSCRIPTION_LIMIT_REACHED'
        || error.code === 'PUSH_SUBSCRIPTION_OWNERSHIP_CONFLICT')) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    reportError(operation, error instanceof AppError ? error : new AppError(message, code));
    return NextResponse.json({ error: message }, { status: 500 });
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
        const saved = await savePushSubscription({
            userId: session.user.id, endpoint: subscription.endpoint, ownershipKey,
            p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent,
            recipientProtocolVersion: subscription.recipientProtocolVersion,
        });
        let pruned = saved.pruned;
        try {
            pruned += await pruneSupersededPushSubscriptions(session.user.id, saved);
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
