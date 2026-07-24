export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushNotifications } from '@/lib/api/web-push';
import { reportError } from '@/lib/errors';
import { getJSTDateString } from '@/lib/date-utils';
import {
    stepReminderTitle,
    stepReminderBody,
} from '@/lib/services/push-messages';
import { extractStepReminderRows, isStepReminderDeliverySummary, parseStepReminderProfiles, parseStepReminderSteps, parseStepReminderSubscriptions } from '@/lib/services/step-reminder';
import { fetchAllWithPagination } from '@/lib/supabase-utils';

export const dynamic = 'force-dynamic';

/** バッチサイズ: 一度に処理するユーザー数 */
const BATCH_SIZE = 20;
const SUBSCRIPTION_PAGE_SIZE = 900;
const MAX_SUBSCRIPTIONS = 10_000;

/** 目標達成率の閾値（70%未満でリマインダー送信） */
const GOAL_THRESHOLD = 0.7;

function reportFailure(category: string, batchIndex?: number): void {
    reportError('cron/step-reminder', new Error('Step reminder processing failed'), batchIndex === undefined ? { category } : { category, batchIndex });
}
function internalError(): NextResponse { return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 }); }

/**
 * GET /api/cron/step-reminder
 * 夕方（JST 18-21時頃）に実行し、日次歩数目標の70%未満のユーザーにリマインダー通知を送信。
 * CRON_SECRET による認証が必要。
 */
export async function GET(request: Request): Promise<NextResponse> {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 🛡️ セキュリティチェック
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const today = getJSTDateString();

        // プッシュ通知を購読しているユーザー一覧を取得
        const subscriptionResult = await fetchAllWithPagination<unknown>(
            async (from, to) => {
                const result = await supabaseAdmin
                    .from('push_subscriptions')
                    .select('id, user_id, endpoint, p256dh, auth, user_agent, created_at')
                    .order('id', { ascending: true })
                    .range(from, to);
                return { data: result.data, error: result.error ?? (result.data === null ? true : null) };
            },
            SUBSCRIPTION_PAGE_SIZE, MAX_SUBSCRIPTIONS,
        );
        if (subscriptionResult.error) {
            reportFailure('subscriptions-query');
            return internalError();
        }

        // ユーザーごとにサブスクリプションをグループ化
        const parsedSubscriptions = parseStepReminderSubscriptions(subscriptionResult.data);
        if (!parsedSubscriptions) {
            reportFailure('subscriptions-shape');
            return internalError();
        }
        if (parsedSubscriptions.allUserIds.size === 0) {
            return NextResponse.json({
                success: true, message: 'プッシュ通知の購読者がいません',
                checked: 0, underGoal: 0, sent: 0, failed: 0,
                expired: 0, deduplicated: 0, failedUsers: 0, timestamp: new Date().toISOString(),
            });
        }

        const userSubscriptions = parsedSubscriptions.rows;
        const userIds = Array.from(userSubscriptions.keys());
        userIds.sort();
        let totalSent = 0, totalFailed = 0, totalExpired = 0;
        let totalDeduplicated = 0, totalUnderGoal = 0;
        const failedUserIds = new Set(parsedSubscriptions.invalidUserIds);
        if (failedUserIds.size > 0) reportFailure('subscriptions-validation');

        // バッチ処理: リマインダー通知を送信
        for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
            const batchIndex = i / BATCH_SIZE;
            const batch = userIds.slice(i, i + BATCH_SIZE);
            const expectedIds = new Set(batch);
            const [profileOutcome, stepsOutcome] = await Promise.allSettled([
                supabaseAdmin.from('users').select('id, step_goal, language').in('id', batch),
                supabaseAdmin.from('daily_steps').select('user_id, steps').eq('date', today).in('user_id', batch),
            ]);
            const profileData = extractStepReminderRows(profileOutcome);
            const stepsData = extractStepReminderRows(stepsOutcome);
            const parsedProfiles = profileData ? parseStepReminderProfiles(profileData, expectedIds) : null;
            const parsedSteps = stepsData ? parseStepReminderSteps(stepsData, expectedIds) : null;
            if (!parsedProfiles || !parsedSteps) {
                reportFailure(!profileData ? 'profiles-query'
                    : !stepsData ? 'steps-query'
                        : !parsedProfiles ? 'profiles-shape' : 'steps-shape', batchIndex);
                batch.forEach((userId) => failedUserIds.add(userId));
                continue;
            }

            const invalidUserIds = new Set([...parsedProfiles.invalidUserIds, ...parsedSteps.invalidUserIds,
                ...parsedProfiles.foreignUserIds, ...parsedSteps.foreignUserIds]);
            invalidUserIds.forEach((userId) => failedUserIds.add(userId));
            if (parsedProfiles.invalidUserIds.size > 0) reportFailure('profiles-validation', batchIndex);
            if (parsedSteps.invalidUserIds.size > 0) reportFailure('steps-validation', batchIndex);
            if (parsedProfiles.foreignUserIds.size > 0) reportFailure('profiles-foreign-row', batchIndex);
            if (parsedSteps.foreignUserIds.size > 0) reportFailure('steps-foreign-row', batchIndex);
            const underGoalUserIds = batch.filter((userId) => {
                if (invalidUserIds.has(userId) || failedUserIds.has(userId)) return false;
                const info = parsedProfiles.rows.get(userId);
                const currentSteps = parsedSteps.rows.get(userId) ?? 0;
                return Boolean(info && currentSteps < info.stepGoal * GOAL_THRESHOLD);
            });
            totalUnderGoal += underGoalUserIds.length;
            const results = await Promise.allSettled(
                underGoalUserIds.map(async (userId) => {
                    const subs = userSubscriptions.get(userId);
                    const info = parsedProfiles.rows.get(userId);
                    if (!subs?.length || !info) throw new Error('Invalid reminder batch');
                    const currentSteps = parsedSteps.rows.get(userId) ?? 0;
                    const goal = info.stepGoal;
                    const remaining = goal - currentSteps;
                    const progressPercent = Math.round((currentSteps / goal) * 100);
                    const locale = info.locale;
                    const body = stepReminderBody(locale, currentSteps, goal, progressPercent, remaining);
                    return {
                        subscriptionCount: subs.length,
                        delivery: await sendWebPushNotifications(userId, subs, {
                            title: stepReminderTitle(locale), body, url: '/', locale,
                            tag: 'step-reminder',
                        }),
                    };
                }),
            );
            for (const [resultIndex, result] of results.entries()) {
                if (result.status === 'fulfilled'
                    && isStepReminderDeliverySummary(result.value.delivery, result.value.subscriptionCount)) {
                    const { delivery } = result.value;
                    totalSent += delivery.sent;
                    totalFailed += delivery.failed;
                    totalExpired += delivery.expired;
                    totalDeduplicated += delivery.skippedDuplicates;
                    if (delivery.sent > 0 && delivery.failed === 0) continue;
                }
                failedUserIds.add(underGoalUserIds[resultIndex]);
                reportFailure(result.status === 'fulfilled' ? 'push-result' : 'push', batchIndex);
            }
        }

        const success = failedUserIds.size === 0;
        return NextResponse.json({
            success, message: 'ステップリマインダー通知送信完了',
            checked: parsedSubscriptions.allUserIds.size, underGoal: totalUnderGoal,
            sent: totalSent, failed: totalFailed, expired: totalExpired,
            deduplicated: totalDeduplicated, failedUsers: failedUserIds.size, timestamp: new Date().toISOString(),
        }, { status: success ? 200 : 500 });
    } catch {
        reportFailure('unexpected');
        return internalError();
    }
}
