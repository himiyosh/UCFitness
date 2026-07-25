export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { loadPushSubscriptionSnapshot, preparePushSubscriptionSnapshot, PushSubscriptionBoundaryError, sendWebPushNotifications } from '@/lib/api/web-push';
import { AppError, reportError } from '@/lib/errors';
import { isValidStepGoal } from '@/lib/step-goal';
import { supabaseAdmin } from '@/lib/supabase';
import { isRecord, isValidUUID } from '@/lib/validation';
import { buildStepReminderOccurrenceKey, claimNotificationDeliveries, completeNotificationDelivery, releaseNotificationDelivery } from '@/lib/services/notification-delivery-outbox';
import { stepReminderBody, stepReminderTitle } from '@/lib/services/push-messages';
import { extractStepReminderRows, isStepReminderDeliverySummary, parseStepReminderProfiles, parseStepReminderSteps } from '@/lib/services/step-reminder';

import type { NotificationDeliveryClaim, NotificationDeliveryFailureCode } from '@/lib/services/notification-delivery-outbox';
import type { ParsedStepReminderRows } from '@/lib/services/step-reminder';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 20, GOAL_THRESHOLD = 0.7, NOTIFICATION_TYPE = 'step-reminder' as const;
interface FailureContext { batchIndex?: number; itemIndex?: number; count?: number }
interface Metrics { checked: number; eligible: number; claimed: number; skipped: number; completed: number; released: number; sent: number; failed: number; expired: number; deduplicated: number }
type Result = Pick<Metrics, 'completed' | 'released' | 'sent' | 'failed' | 'expired' | 'deduplicated'>;
interface Fence { occurrenceKey: string; leaseOwner: string }
interface DeliveryContext extends Fence { profiles: NonNullable<ReturnType<typeof parseStepReminderProfiles>>['rows']; steps: NonNullable<ReturnType<typeof parseStepReminderSteps>>['rows']; subscriptions: Awaited<ReturnType<typeof preparePushSubscriptionSnapshot>>['byUser'] }
function reportFailure(category: string, context: FailureContext = {}): void {
    reportError('cron/step-reminder', new AppError('Step reminder processing failed', 'STEP_REMINDER_FAILURE', { category, ...context }));
}
function emptyResult(): Result { return { completed: 0, released: 0, sent: 0, failed: 0, expired: 0, deduplicated: 0 }; }
function addResult(metrics: Metrics, result: Result): void {
    metrics.completed += result.completed; metrics.released += result.released;
    metrics.sent += result.sent; metrics.failed += result.failed;
    metrics.expired += result.expired; metrics.deduplicated += result.deduplicated;
}
function parseGoals(data: unknown, expectedIds: Set<string>): ParsedStepReminderRows<number> | null {
    if (!Array.isArray(data)) return null;
    const rows = new Map<string, number>(), seen = new Set<string>();
    const invalidUserIds = new Set<string>(), foreignUserIds = new Set<string>();
    for (const row of data) {
        if (!isRecord(row) || !isValidUUID(row.id)) return null;
        if (!expectedIds.has(row.id)) { foreignUserIds.add(row.id); continue; }
        if (seen.has(row.id)) { invalidUserIds.add(row.id); continue; }
        seen.add(row.id);
        if (!isValidStepGoal(row.step_goal)) invalidUserIds.add(row.id);
        else rows.set(row.id, row.step_goal);
    }
    expectedIds.forEach((userId) => { if (!seen.has(userId)) invalidUserIds.add(userId); });
    invalidUserIds.forEach((userId) => rows.delete(userId));
    return { rows, invalidUserIds, foreignUserIds };
}
async function releaseClaim(claim: NotificationDeliveryClaim, code: NotificationDeliveryFailureCode,
    fence: Fence, failureContext: FailureContext): Promise<boolean> {
    let released = false;
    try {
        released = await releaseNotificationDelivery({
            notificationType: NOTIFICATION_TYPE, occurrenceKey: fence.occurrenceKey,
            userId: claim.user_id, leaseOwner: fence.leaseOwner,
            claimToken: claim.claim_token, failureCode: code,
        });
    } catch {
        // The canonical wrapper already converted the backend failure to a fixed AppError.
    }
    if (!released) reportFailure('outbox-release', failureContext);
    return released;
}
async function failClaim(claim: NotificationDeliveryClaim, category: string,
    code: NotificationDeliveryFailureCode, context: DeliveryContext,
    failureContext: FailureContext, result: Result = { ...emptyResult(), failed: 1 },
): Promise<Result> {
    reportFailure(category, failureContext);
    const released = await releaseClaim(claim, code, context, failureContext);
    return { ...result, failed: result.failed + (released ? 0 : 1), released: released ? 1 : 0 };
}
async function completeSent(claim: NotificationDeliveryClaim, context: DeliveryContext,
    failureContext: FailureContext, delivery: Omit<Result, 'completed' | 'released'>,
): Promise<Result> {
    if (delivery.failed > 0) reportFailure('push-result', failureContext);
    let completed = false;
    try {
        completed = await completeNotificationDelivery({
            notificationType: NOTIFICATION_TYPE, occurrenceKey: context.occurrenceKey,
            userId: claim.user_id, leaseOwner: context.leaseOwner, claimToken: claim.claim_token,
        });
    } catch {
        // A send already happened, so a failed completion must not release for immediate retry.
    }
    if (!completed) reportFailure('outbox-complete', failureContext);
    return { ...delivery, completed: completed ? 1 : 0, released: 0,
        failed: delivery.failed + (completed ? 0 : 1) };
}
async function processClaim(claim: NotificationDeliveryClaim, context: DeliveryContext,
    failureContext: FailureContext): Promise<Result> {
    const profile = context.profiles.get(claim.user_id);
    const subscriptions = context.subscriptions.get(claim.user_id);
    if (!profile || !subscriptions?.length)
        return failClaim(claim, 'profiles-validation', 'SOURCE_DATA_UNAVAILABLE',
            context, failureContext);
    const currentSteps = context.steps.get(claim.user_id) ?? 0;
    let payload: Parameters<typeof sendWebPushNotifications>[2];
    try {
        const remaining = profile.stepGoal - currentSteps;
        payload = {
            title: stepReminderTitle(profile.locale),
            body: stepReminderBody(profile.locale, currentSteps, profile.stepGoal,
                Math.round((currentSteps / profile.stepGoal) * 100), remaining),
            url: '/', locale: profile.locale, tag: NOTIFICATION_TYPE,
        };
    } catch {
        return failClaim(claim, 'payload-build', 'PAYLOAD_BUILD_FAILED', context, failureContext);
    }
    let rawDelivery: unknown;
    try {
        rawDelivery = await sendWebPushNotifications(claim.user_id, subscriptions, payload);
    } catch {
        return failClaim(claim, 'push', 'PUSH_DELIVERY_FAILED', context, failureContext);
    }
    if (!isStepReminderDeliverySummary(rawDelivery, subscriptions.length))
        return failClaim(claim, 'push-result', 'PUSH_DELIVERY_FAILED', context, failureContext);
    const delivery = { sent: rawDelivery.sent, failed: rawDelivery.failed,
        expired: rawDelivery.expired, deduplicated: rawDelivery.skippedDuplicates };
    if (delivery.sent === 0)
        return failClaim(claim, 'push-result',
            delivery.failed > 0 ? 'PUSH_DELIVERY_FAILED' : 'PUSH_DELIVERY_INCOMPLETE',
            context, failureContext,
            { ...emptyResult(), ...delivery, failed: Math.max(1, delivery.failed) });
    return completeSent(claim, context, failureContext, delivery);
}
async function releaseBatch(claims: NotificationDeliveryClaim[], category: string,
    context: DeliveryContext, batchIndex: number): Promise<Result[]> {
    reportFailure(category, { batchIndex, count: claims.length });
    return Promise.all(claims.map(async (claim, itemIndex) => {
        const released = await releaseClaim(claim, 'SOURCE_DATA_UNAVAILABLE',
            context, { batchIndex, itemIndex });
        return { ...emptyResult(), failed: released ? 1 : 2, released: released ? 1 : 0 };
    }));
}

/**
 * 現在のJST日をoccurrenceとし、送信成功後のcompleteまでをat-least-onceで管理する。
 */
export async function GET(request: Request): Promise<NextResponse> {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== ['Bearer', cronSecret].join(' ')) {
        return new NextResponse('Unauthorized', { status: 401 });
    }
    try {
        const snapshotAt = new Date().toISOString();
        const occurrenceKey = buildStepReminderOccurrenceKey(new Date(snapshotAt));
        const leaseOwner = crypto.randomUUID();
        const prepared = await preparePushSubscriptionSnapshot(
            await loadPushSubscriptionSnapshot());
        const candidateIds = Array.from(prepared.byUser.keys()).sort();
        const metrics: Metrics = {
            ...emptyResult(), checked: prepared.userIds.length, eligible: 0,
            claimed: 0, skipped: 0,
            failed: new Set([...prepared.invalidUserIds, ...prepared.cappedUserIds]).size,
        };
        if (prepared.invalidUserIds.length > 0)
            reportFailure('subscriptions-validation', { count: prepared.invalidUserIds.length });
        if (prepared.cappedUserIds.length > 0)
            reportFailure('subscriptions-user-limit', { count: prepared.cappedUserIds.length });

        for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
            const batchIndex = i / BATCH_SIZE, batch = candidateIds.slice(i, i + BATCH_SIZE);
            const expectedIds = new Set(batch);
            // Eligibility uses only IDs, goals and steps; language and payload reads stay fenced.
            const [goalOutcome, eligibilityStepsOutcome] = await Promise.allSettled([
                supabaseAdmin.from('users').select('id, step_goal').in('id', batch),
                supabaseAdmin.from('daily_steps').select('user_id, steps')
                    .eq('date', occurrenceKey).in('user_id', batch),
            ]);
            const goalData = extractStepReminderRows(goalOutcome);
            const eligibilityStepsData = extractStepReminderRows(eligibilityStepsOutcome);
            const goals = goalData ? parseGoals(goalData, expectedIds) : null;
            const eligibilitySteps = eligibilityStepsData
                ? parseStepReminderSteps(eligibilityStepsData, expectedIds) : null;
            if (!goals || !eligibilitySteps) {
                reportFailure(!goalData ? 'eligibility-profiles-query'
                    : !eligibilityStepsData ? 'eligibility-steps-query'
                        : !goals ? 'eligibility-profiles-shape' : 'eligibility-steps-shape',
                { batchIndex, count: batch.length });
                metrics.failed += batch.length; continue;
            }
            if (goals.foreignUserIds.size > 0 || eligibilitySteps.foreignUserIds.size > 0) {
                reportFailure(goals.foreignUserIds.size > 0
                    ? 'eligibility-profiles-foreign-row' : 'eligibility-steps-foreign-row',
                { batchIndex, count: batch.length });
                metrics.failed += batch.length; continue;
            }
            if (goals.invalidUserIds.size > 0)
                reportFailure('eligibility-profiles-validation',
                    { batchIndex, count: goals.invalidUserIds.size });
            if (eligibilitySteps.invalidUserIds.size > 0)
                reportFailure('eligibility-steps-validation',
                    { batchIndex, count: eligibilitySteps.invalidUserIds.size });
            const invalidIds = new Set([
                ...goals.invalidUserIds, ...eligibilitySteps.invalidUserIds]);
            metrics.failed += invalidIds.size;
            const eligibleIds = batch.filter((userId) => {
                const goal = goals.rows.get(userId), steps = eligibilitySteps.rows.get(userId) ?? 0;
                return !invalidIds.has(userId) && goal !== undefined
                    && steps < goal * GOAL_THRESHOLD;
            });
            metrics.eligible += eligibleIds.length;
            if (eligibleIds.length === 0) continue;

            let claims: NotificationDeliveryClaim[];
            try {
                claims = await claimNotificationDeliveries({
                    notificationType: NOTIFICATION_TYPE, occurrenceKey,
                    userIds: eligibleIds, leaseOwner,
                });
            } catch {
                reportFailure('outbox-claim', { batchIndex, count: eligibleIds.length });
                metrics.failed += eligibleIds.length; continue;
            }
            metrics.claimed += claims.length; metrics.skipped += eligibleIds.length - claims.length;
            if (claims.length === 0) continue;

            const claimedIds = claims.map((claim) => claim.user_id);
            const claimedSet = new Set(claimedIds);
            const [profileOutcome, stepsOutcome] = await Promise.allSettled([
                supabaseAdmin.from('users').select('id, step_goal, language').in('id', claimedIds),
                supabaseAdmin.from('daily_steps').select('user_id, steps')
                    .eq('date', occurrenceKey).in('user_id', claimedIds),
            ]);
            const profileData = extractStepReminderRows(profileOutcome);
            const stepsData = extractStepReminderRows(stepsOutcome);
            const profiles = profileData ? parseStepReminderProfiles(profileData, claimedSet) : null;
            const steps = stepsData ? parseStepReminderSteps(stepsData, claimedSet) : null;
            const context: DeliveryContext = {
                occurrenceKey, leaseOwner, profiles: profiles?.rows ?? new Map(),
                steps: steps?.rows ?? new Map(), subscriptions: prepared.byUser,
            };
            if (!profiles || !steps) {
                const results = await releaseBatch(claims,
                    !profileData ? 'profiles-query' : !stepsData ? 'steps-query'
                        : !profiles ? 'profiles-shape' : 'steps-shape',
                    context, batchIndex);
                results.forEach((result) => addResult(metrics, result)); continue;
            }
            if (profiles.foreignUserIds.size > 0 || steps.foreignUserIds.size > 0) {
                const results = await releaseBatch(claims,
                    profiles.foreignUserIds.size > 0 ? 'profiles-foreign-row' : 'steps-foreign-row',
                    context, batchIndex);
                results.forEach((result) => addResult(metrics, result)); continue;
            }
            if (profiles.invalidUserIds.size > 0)
                reportFailure('profiles-validation',
                    { batchIndex, count: profiles.invalidUserIds.size });
            if (steps.invalidUserIds.size > 0)
                reportFailure('steps-validation', { batchIndex, count: steps.invalidUserIds.size });
            const invalidClaimIds = new Set([
                ...profiles.invalidUserIds, ...steps.invalidUserIds]);
            const results = await Promise.allSettled(claims.map(async (claim, itemIndex) => {
                if (!invalidClaimIds.has(claim.user_id))
                    return processClaim(claim, context, { batchIndex, itemIndex });
                const released = await releaseClaim(claim, 'SOURCE_DATA_UNAVAILABLE',
                    context, { batchIndex, itemIndex });
                return { ...emptyResult(), failed: released ? 1 : 2,
                    released: released ? 1 : 0 };
            }));
            results.forEach((result, itemIndex) => {
                if (result.status === 'fulfilled') addResult(metrics, result.value);
                else { metrics.failed++; reportFailure('unexpected', { batchIndex, itemIndex }); }
            });
        }

        const responseMetrics = { ...metrics, underGoal: metrics.eligible, timestamp: snapshotAt };
        if (metrics.failed > 0)
            return NextResponse.json({ success: false,
                error: 'Step reminder delivery incomplete', ...responseMetrics }, { status: 503 });
        return NextResponse.json({
            success: true, message: candidateIds.length === 0
                ? 'プッシュ通知の購読者がいません' : 'ステップリマインダー通知送信完了',
            ...responseMetrics,
        });
    } catch (error: unknown) {
        reportFailure(error instanceof PushSubscriptionBoundaryError
            ? `subscriptions-${error.reason}` : 'unexpected');
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
