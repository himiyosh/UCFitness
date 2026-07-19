export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { sendWebPushNotifications } from '@/lib/api/web-push';
import { reportError } from '@/lib/errors';
import { getGroupChallengeRewardPushMessage } from '@/lib/services/push-messages';
import { supabaseAdmin } from '@/lib/supabase';

import type { StoredPushSubscriptionData } from '@/lib/api/web-push';
import type { PushLocale } from '@/lib/services/push-messages';
import type { GroupChallengeRewardClaimRpcRow } from '@/types/database';

export const dynamic = 'force-dynamic';

const MAX_CLAIMED_USERS = 20;
const MIN_LEASE_REMAINING_MS = 30_000;
const MAX_PUSH_DURATION_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ClaimedReward = GroupChallengeRewardClaimRpcRow;
interface DeliveryMetrics {
    claimedUsers: number; deliveredUsers: number; failedUsers: number;
    releasedUsers: number; releaseFailures: number;
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
function isPositiveSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function parseClaims(data: unknown): ClaimedReward[] | null {
    if (!Array.isArray(data) || data.length > MAX_CLAIMED_USERS) return null;
    const userIds = new Set<string>();
    const claims: ClaimedReward[] = [];
    for (const row of data) {
        if (
            !isRecord(row)
            || typeof row.user_id !== 'string'
            || !UUID_PATTERN.test(row.user_id)
            || userIds.has(row.user_id)
            || !isPositiveSafeInteger(row.challenge_count)
            || !isPositiveSafeInteger(row.total_reward)
            || typeof row.lease_id !== 'string'
            || !UUID_PATTERN.test(row.lease_id)
            || typeof row.lease_expires_at !== 'string'
            || !Number.isFinite(Date.parse(row.lease_expires_at))
        ) {
            return null;
        }
        userIds.add(row.user_id);
        claims.push({
            user_id: row.user_id, challenge_count: row.challenge_count,
            total_reward: row.total_reward, lease_id: row.lease_id,
            lease_expires_at: row.lease_expires_at,
        });
    }
    return claims;
}
function groupRows(data: unknown, idKey: 'id' | 'user_id'): Map<string, unknown[]> | null {
    if (!Array.isArray(data)) return null;
    const grouped = new Map<string, unknown[]>();
    for (const row of data) {
        if (!isRecord(row) || typeof row[idKey] !== 'string') continue;
        const id = row[idKey];
        grouped.set(id, [...(grouped.get(id) ?? []), row]);
    }
    return grouped;
}
function resolveLocale(rows: unknown[] | undefined): PushLocale | null {
    if (rows?.length !== 1 || !isRecord(rows[0])) return null;
    return rows[0].language === 'ja' || rows[0].language === 'en'
        ? rows[0].language : null;
}
function resolveSubscriptions(rows: unknown[] | undefined): StoredPushSubscriptionData[] | null {
    if (!rows?.length) return null;
    const subscriptions: StoredPushSubscriptionData[] = [];
    for (const row of rows) {
        if (
            !isRecord(row)
            || typeof row.id !== 'string'
            || typeof row.endpoint !== 'string'
            || typeof row.p256dh !== 'string'
            || typeof row.auth !== 'string'
            || (row.user_agent !== null && typeof row.user_agent !== 'string')
            || (row.created_at !== null && typeof row.created_at !== 'string')
        ) {
            return null;
        }
        subscriptions.push({
            id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth,
            user_agent: row.user_agent, created_at: row.created_at,
        });
    }
    return subscriptions;
}
function matchesMutation(
    data: unknown, countKey: 'delivered_count' | 'released_count', claim: ClaimedReward,
): boolean {
    if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) return false;
    return data[0][countKey] === claim.challenge_count
        && data[0].total_reward === claim.total_reward;
}
function reportStage(stage: string, userIndex?: number): void {
    const context = userIndex === undefined ? undefined : { userIndex };
    reportError(`cron/group-challenge-reward:${stage}`,
        new Error('Group challenge reward delivery failed'), context);
}
async function releaseClaim(claim: ClaimedReward, userIndex: number): Promise<boolean> {
    try {
        const result = await supabaseAdmin.rpc('release_group_challenge_reward_outbox', {
            p_user_id: claim.user_id, p_lease_id: claim.lease_id,
        });
        if (result.error || !matchesMutation(result.data, 'released_count', claim)) {
            reportStage('release', userIndex);
            return false;
        }
        return true;
    } catch {
        reportStage('release', userIndex);
        return false;
    }
}
function response(metrics: DeliveryMetrics): NextResponse {
    const success = metrics.failedUsers === 0;
    return NextResponse.json({ success, ...metrics }, { status: success ? 200 : 500 });
}
function internalError(): NextResponse {
    return NextResponse.json(
        { success: false, error: 'Internal Server Error' }, { status: 500 },
    );
}
export async function GET(request: Request): Promise<NextResponse> {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== 'Bearer ' + cronSecret) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    let claimResult;
    try {
        claimResult = await supabaseAdmin.rpc('claim_group_challenge_reward_outbox');
    } catch {
        reportStage('claim');
        return internalError();
    }
    const claims = claimResult.error ? null : parseClaims(claimResult.data);
    if (!claims) {
        reportStage('claim');
        return internalError();
    }
    const metrics: DeliveryMetrics = {
        claimedUsers: claims.length, deliveredUsers: 0, failedUsers: 0,
        releasedUsers: 0, releaseFailures: 0,
    };
    if (claims.length === 0) return response(metrics);
    const claimedUserIds = claims.map((claim) => claim.user_id);
    let localeResult;
    let subscriptionResult;
    try {
        localeResult = await supabaseAdmin.from('users')
            .select('id, language').in('id', claimedUserIds);
    } catch {
        localeResult = { data: null, error: true };
    }
    try {
        subscriptionResult = await supabaseAdmin.from('push_subscriptions')
            .select('id, user_id, endpoint, p256dh, auth, user_agent, created_at')
            .in('user_id', claimedUserIds);
    } catch {
        subscriptionResult = { data: null, error: true };
    }
    const localeRows = localeResult.error ? null : groupRows(localeResult.data, 'id');
    const subscriptionRows = subscriptionResult.error
        ? null : groupRows(subscriptionResult.data, 'user_id');
    if (!localeRows) reportStage('languages');
    if (!subscriptionRows) reportStage('subscriptions');
    for (const [userIndex, claim] of claims.entries()) {
        const locale = resolveLocale(localeRows?.get(claim.user_id));
        const subscriptions = resolveSubscriptions(subscriptionRows?.get(claim.user_id));
        const leaseRemaining = Date.parse(claim.lease_expires_at) - Date.now();
        let delivered = false;
        if (!locale) {
            reportStage('language', userIndex);
        } else if (!subscriptions) {
            reportStage('subscription', userIndex);
        } else if (leaseRemaining < MIN_LEASE_REMAINING_MS) {
            reportStage('lease', userIndex);
        } else {
            let pushSucceeded = false;
            try {
                const message = getGroupChallengeRewardPushMessage(
                    locale, claim.challenge_count, claim.total_reward,
                );
                const delivery = await sendWebPushNotifications(
                    claim.user_id,
                    subscriptions,
                    { ...message, locale, tag: 'group-challenge-reward' },
                    AbortSignal.timeout(Math.min(
                        MAX_PUSH_DURATION_MS, leaseRemaining - MAX_PUSH_DURATION_MS)),
                );
                pushSucceeded = delivery.sent > 0 && delivery.failed === 0;
                if (!pushSucceeded) reportStage('push', userIndex);
            } catch {
                reportStage('push', userIndex);
            }
            if (pushSucceeded) {
                try {
                    const complete = await supabaseAdmin.rpc(
                        'complete_group_challenge_reward_outbox',
                        { p_user_id: claim.user_id, p_lease_id: claim.lease_id },
                    );
                    delivered = !complete.error
                        && matchesMutation(complete.data, 'delivered_count', claim);
                    if (!delivered) reportStage('complete', userIndex);
                } catch {
                    reportStage('complete', userIndex);
                }
            }
        }
        if (delivered) {
            metrics.deliveredUsers++;
            continue;
        }
        metrics.failedUsers++;
        if (await releaseClaim(claim, userIndex)) {
            metrics.releasedUsers++;
        } else {
            metrics.releaseFailures++;
        }
    }
    return response(metrics);
}
