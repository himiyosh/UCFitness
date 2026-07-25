export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { sendWebPushNotifications } from '@/lib/api/web-push';
import { AppError, reportError } from '@/lib/errors';
import {
    buildWeeklySummaryOccurrenceKey, claimNotificationDeliveries,
    completeNotificationDelivery, releaseNotificationDelivery,
} from '@/lib/services/notification-delivery-outbox';
import { formatWeeklySummaryBody, weeklySummaryTitle } from '@/lib/services/push-messages';
import {
    addWeeklyMetric, getPreviousWeekRange, loadUserWeeklySummary,
    loadWeeklySubscriptionRows, loadWeeklyUserContexts, parseWeeklyDelivery,
    prepareWeeklySubscriptions, weeklyFailureCategory,
} from '@/lib/services/weekly-summary';

import type {
    NotificationDeliveryClaim, NotificationDeliveryFailureCode,
} from '@/lib/services/notification-delivery-outbox';
import type { UserContext, WeeklyFailure } from '@/lib/services/weekly-summary';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 20;
const NOTIFICATION_TYPE = 'weekly-summary' as const;
type RouteFailure = WeeklyFailure | 'outbox-claim' | 'outbox-complete'
    | 'outbox-release' | 'payload-build';
type FailureContext = Partial<Record<'batchIndex' | 'itemIndex' | 'count', number>>;
interface ProcessingContext {
    occurrenceKey: string; leaseOwner: string;
    range: ReturnType<typeof getPreviousWeekRange>; snapshotAt: string;
    userContexts: Map<string, UserContext | null>;
    subscriptions: Map<string, Parameters<typeof sendWebPushNotifications>[1]>;
}
interface ProcessingResult {
    sent: number; failed: number; deduplicated: number;
    completed: number; released: number;
}
interface DeliveryMetrics extends ProcessingResult { claimed: number; skipped: number }

function reportFailure(operation: string, category: RouteFailure, context: FailureContext = {}): void {
    reportError(operation, new AppError(
        'Weekly summary processing failed', 'WEEKLY_SUMMARY_FAILURE', { category, ...context },
    ));
}
function emptyProcessingResult(): ProcessingResult {
    return { sent: 0, failed: 0, deduplicated: 0, completed: 0, released: 0 };
}
function addProcessingResult(metrics: DeliveryMetrics, result: ProcessingResult): void {
    metrics.sent = addWeeklyMetric(metrics.sent, result.sent);
    metrics.failed = addWeeklyMetric(metrics.failed, result.failed);
    metrics.deduplicated = addWeeklyMetric(metrics.deduplicated, result.deduplicated);
    metrics.completed = addWeeklyMetric(metrics.completed, result.completed);
    metrics.released = addWeeklyMetric(metrics.released, result.released);
}
async function releaseClaim(
    claim: NotificationDeliveryClaim, failureCode: NotificationDeliveryFailureCode,
    context: ProcessingContext, failureContext: FailureContext,
): Promise<boolean> {
    let released = false;
    try {
        released = await releaseNotificationDelivery({
            notificationType: NOTIFICATION_TYPE, occurrenceKey: context.occurrenceKey,
            userId: claim.user_id, leaseOwner: context.leaseOwner,
            claimToken: claim.claim_token, failureCode,
        });
    } catch {
        // The wrapper already converted the backend error to a fixed AppError.
    }
    if (!released) reportFailure('cron/weekly-summary:outbox', 'outbox-release', failureContext);
    return released;
}
async function releaseFailedClaim(
    claim: NotificationDeliveryClaim, category: RouteFailure,
    failureCode: NotificationDeliveryFailureCode, context: ProcessingContext,
    failureContext: FailureContext,
    result: Pick<ProcessingResult, 'sent' | 'failed' | 'deduplicated'> = {
        sent: 0, failed: 1, deduplicated: 0,
    },
): Promise<ProcessingResult> {
    reportFailure('cron/weekly-summary:user', category, failureContext);
    const released = await releaseClaim(claim, failureCode, context, failureContext);
    return {
        ...result, failed: released ? result.failed : addWeeklyMetric(result.failed, 1),
        completed: 0, released: released ? 1 : 0,
    };
}
async function completeSentClaim(
    claim: NotificationDeliveryClaim, context: ProcessingContext,
    failureContext: FailureContext,
    delivery: Pick<ProcessingResult, 'sent' | 'failed' | 'deduplicated'>,
): Promise<ProcessingResult> {
    if (delivery.failed > 0) reportFailure('cron/weekly-summary:user', 'push', failureContext);
    let completed = false;
    try {
        completed = await completeNotificationDelivery({
            notificationType: NOTIFICATION_TYPE, occurrenceKey: context.occurrenceKey,
            userId: claim.user_id, leaseOwner: context.leaseOwner,
            claimToken: claim.claim_token,
        });
    } catch {
        // The route reports one fixed completion failure for both RPC errors and stale fences.
    }
    if (!completed) {
        reportFailure('cron/weekly-summary:outbox', 'outbox-complete', failureContext);
        return {
            ...delivery, failed: addWeeklyMetric(delivery.failed, 1),
            completed: 0, released: 0,
        };
    }
    return { ...delivery, completed: 1, released: 0 };
}
async function processClaim(
    claim: NotificationDeliveryClaim, context: ProcessingContext,
    failureContext: FailureContext,
): Promise<ProcessingResult> {
    const subscriptions = context.subscriptions.get(claim.user_id) ?? [];
    const userContext = context.userContexts.get(claim.user_id);
    if (!userContext || subscriptions.length === 0) {
        return releaseFailedClaim(
            claim, 'user-context', 'SOURCE_DATA_UNAVAILABLE', context, failureContext,
        );
    }

    let summary: Awaited<ReturnType<typeof loadUserWeeklySummary>>;
    try {
        summary = await loadUserWeeklySummary(claim.user_id, context.range, context.snapshotAt);
    } catch (error: unknown) {
        return releaseFailedClaim(
            claim, weeklyFailureCategory(error), 'SOURCE_DATA_UNAVAILABLE',
            context, failureContext,
        );
    }

    let payload: Parameters<typeof sendWebPushNotifications>[2];
    try {
        payload = {
            title: weeklySummaryTitle(userContext.locale),
            body: formatWeeklySummaryBody(userContext.locale, summary),
            url: `/user/${encodeURIComponent(userContext.username)}`,
            locale: userContext.locale, tag: NOTIFICATION_TYPE,
        };
    } catch {
        return releaseFailedClaim(
            claim, 'payload-build', 'PAYLOAD_BUILD_FAILED', context, failureContext,
        );
    }

    let rawDelivery: unknown;
    try {
        rawDelivery = await sendWebPushNotifications(claim.user_id, subscriptions, payload);
    } catch {
        return releaseFailedClaim(
            claim, 'push', 'PUSH_DELIVERY_FAILED', context, failureContext,
        );
    }

    let delivery: Pick<ProcessingResult, 'sent' | 'failed' | 'deduplicated'>;
    try {
        delivery = parseWeeklyDelivery(rawDelivery, subscriptions.length);
    } catch (error: unknown) {
        return releaseFailedClaim(
            claim, weeklyFailureCategory(error), 'PUSH_DELIVERY_FAILED',
            context, failureContext,
        );
    }
    if (delivery.sent === 0) {
        return releaseFailedClaim(
            claim, 'push',
            delivery.failed > 0 ? 'PUSH_DELIVERY_FAILED' : 'PUSH_DELIVERY_INCOMPLETE',
            context, failureContext, { ...delivery, failed: Math.max(1, delivery.failed) },
        );
    }
    return completeSentClaim(claim, context, failureContext, delivery);
}

/**
 * 前週のJST歩数サマリーを、ユーザー単位のoutbox fence下で配信する。
 */
export async function GET(request: Request): Promise<NextResponse> {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    let stage: RouteFailure = 'unexpected';
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const snapshotAt = new Date().toISOString();
        const range = getPreviousWeekRange(new Date(snapshotAt));
        const occurrenceKey = buildWeeklySummaryOccurrenceKey(range.weekStart);
        const leaseOwner = crypto.randomUUID();
        stage = 'subscriptions-query';
        const subscriptionRows = await loadWeeklySubscriptionRows();
        if (subscriptionRows.length === 0) {
            return NextResponse.json({
                success: true, message: 'プッシュ通知の購読者がいません',
                weekRange: `${range.weekStart} ~ ${range.weekEnd}`, occurrenceKey,
                users: 0, checked: 0, claimed: 0, skipped: 0, completed: 0,
                released: 0, sent: 0, failed: 0, deduplicated: 0, timestamp: snapshotAt,
            });
        }

        const prepared = await prepareWeeklySubscriptions(subscriptionRows);
        const sendUserIds = Array.from(prepared.byUser.keys()).sort();
        const metrics: DeliveryMetrics = {
            ...emptyProcessingResult(), failed: prepared.failures.size, claimed: 0, skipped: 0,
        };
        let failureIndex = 0;
        for (const category of prepared.failures.values()) {
            reportFailure('cron/weekly-summary:user', category, { itemIndex: failureIndex++ });
        }

        for (let i = 0; i < sendUserIds.length; i += BATCH_SIZE) {
            const batch = sendUserIds.slice(i, i + BATCH_SIZE);
            const batchIndex = i / BATCH_SIZE;
            let claims: NotificationDeliveryClaim[];
            try {
                claims = await claimNotificationDeliveries({
                    notificationType: NOTIFICATION_TYPE, occurrenceKey,
                    userIds: batch, leaseOwner,
                });
            } catch {
                metrics.failed = addWeeklyMetric(metrics.failed, batch.length);
                reportFailure(
                    'cron/weekly-summary:outbox', 'outbox-claim',
                    { batchIndex, count: batch.length },
                );
                continue;
            }
            metrics.claimed = addWeeklyMetric(metrics.claimed, claims.length);
            metrics.skipped = addWeeklyMetric(metrics.skipped, batch.length - claims.length);
            if (claims.length === 0) continue;

            const baseContext = {
                occurrenceKey, leaseOwner, range, snapshotAt, subscriptions: prepared.byUser,
            };
            let userContexts: Map<string, UserContext | null>;
            try {
                userContexts = await loadWeeklyUserContexts(claims.map((claim) => claim.user_id));
            } catch (error: unknown) {
                const category = weeklyFailureCategory(error);
                reportFailure(
                    'cron/weekly-summary:batch',
                    category === 'unexpected' ? 'users-query' : category,
                    { batchIndex, count: claims.length },
                );
                const context: ProcessingContext = {
                    ...baseContext, userContexts: new Map<string, UserContext | null>(),
                };
                const releases = await Promise.all(claims.map((claim, itemIndex) =>
                    releaseClaim(
                        claim, 'SOURCE_DATA_UNAVAILABLE', context, { batchIndex, itemIndex },
                    )));
                for (const released of releases) {
                    metrics.failed = addWeeklyMetric(metrics.failed, released ? 1 : 2);
                    if (released) metrics.released = addWeeklyMetric(metrics.released, 1);
                }
                continue;
            }

            const context: ProcessingContext = { ...baseContext, userContexts };
            const results = await Promise.allSettled(claims.map((claim, itemIndex) =>
                processClaim(claim, context, { batchIndex, itemIndex })));
            for (const [itemIndex, result] of results.entries()) {
                if (result.status === 'fulfilled') addProcessingResult(metrics, result.value);
                else {
                    metrics.failed = addWeeklyMetric(metrics.failed, 1);
                    reportFailure(
                        'cron/weekly-summary:user', 'unexpected', { batchIndex, itemIndex },
                    );
                }
            }
        }

        const responseMetrics = {
            weekRange: `${range.weekStart} ~ ${range.weekEnd}`, occurrenceKey,
            users: prepared.userIds.length, checked: prepared.userIds.length,
            ...metrics, timestamp: snapshotAt,
        };
        if (metrics.failed > 0) {
            return NextResponse.json(
                { success: false, error: 'Weekly summary delivery incomplete', ...responseMetrics },
                { status: 503 },
            );
        }
        return NextResponse.json({
            success: true, message: 'ウィークリーサマリー通知の送信が完了しました',
            ...responseMetrics,
        });
    } catch (error: unknown) {
        const category = weeklyFailureCategory(error);
        reportFailure('cron/weekly-summary', category === 'unexpected' ? stage : category);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' }, { status: 500 },
        );
    }
}
