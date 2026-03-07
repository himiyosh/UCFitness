export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushNotification } from '@/lib/api/web-push';
import { reportError } from '@/lib/errors';
import { getJSTDateString, getJSTHour } from '@/lib/date-utils';
import {
    normalizePushLocale,
    stepReminderTitle,
    stepReminderBody,
} from '@/lib/services/push-messages';

import type { PushLocale } from '@/lib/services/push-messages';

export const dynamic = 'force-dynamic';

/** バッチサイズ: 一度に処理するユーザー数 */
const BATCH_SIZE = 20;

/** 目標達成率の閾値（70%未満でリマインダー送信） */
const GOAL_THRESHOLD = 0.7;

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
        const currentHour = getJSTHour();

        console.log(`[Cron] Step reminder: date=${today}, hour=${currentHour} JST`);

        // プッシュ通知を購読しているユーザー一覧を取得
        const { data: subscriptionRows, error: subError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('user_id, endpoint, p256dh, auth');

        if (subError) {
            throw new Error(`サブスクリプション取得失敗: ${subError.message}`);
        }

        if (!subscriptionRows || subscriptionRows.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'プッシュ通知の購読者がいません',
                sent: 0,
                timestamp: new Date().toISOString(),
            });
        }

        // ユーザーごとにサブスクリプションをグループ化
        const userSubscriptions = new Map<string, typeof subscriptionRows>();
        for (const row of subscriptionRows) {
            const existing = userSubscriptions.get(row.user_id) || [];
            existing.push(row);
            userSubscriptions.set(row.user_id, existing);
        }

        const userIds = Array.from(userSubscriptions.keys());

        // ユーザーの step_goal と言語設定を取得
        const { data: usersData, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, step_goal, name, language')
            .in('id', userIds);

        if (usersError) {
            throw new Error(`ユーザー情報取得失敗: ${usersError.message}`);
        }

        const userGoalMap = new Map<string, { stepGoal: number; name: string | null; locale: PushLocale }>();
        for (const u of usersData || []) {
            userGoalMap.set(u.id, {
                stepGoal: u.step_goal || 10000,
                name: u.name,
                locale: normalizePushLocale(u.language),
            });
        }

        // 本日の歩数を取得
        const { data: stepsData, error: stepsError } = await supabaseAdmin
            .from('daily_steps')
            .select('user_id, steps')
            .eq('date', today)
            .in('user_id', userIds);

        if (stepsError) {
            throw new Error(`歩数データ取得失敗: ${stepsError.message}`);
        }

        const stepsMap = new Map<string, number>();
        for (const row of stepsData || []) {
            stepsMap.set(row.user_id, row.steps || 0);
        }

        // 目標未達のユーザーをフィルタリング
        const underGoalUserIds = userIds.filter((uid) => {
            const info = userGoalMap.get(uid);
            if (!info) return false;
            const currentSteps = stepsMap.get(uid) || 0;
            const threshold = info.stepGoal * GOAL_THRESHOLD;
            // 目標の70%未満で、かつ目標が0でないユーザー
            return info.stepGoal > 0 && currentSteps < threshold;
        });

        if (underGoalUserIds.length === 0) {
            return NextResponse.json({
                success: true,
                message: '全ユーザーが目標圏内です',
                checked: userIds.length,
                sent: 0,
                timestamp: new Date().toISOString(),
            });
        }

        let totalSent = 0;
        let totalFailed = 0;

        // バッチ処理: リマインダー通知を送信
        for (let i = 0; i < underGoalUserIds.length; i += BATCH_SIZE) {
            const batch = underGoalUserIds.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(async (userId) => {
                    const subs = userSubscriptions.get(userId) || [];
                    const info = userGoalMap.get(userId);
                    const currentSteps = stepsMap.get(userId) || 0;
                    const goal = info?.stepGoal || 10000;
                    const remaining = goal - currentSteps;
                    const progressPercent = Math.round((currentSteps / goal) * 100);
                    const locale = info?.locale || 'ja';

                    const body = stepReminderBody(locale, currentSteps, goal, progressPercent, remaining);

                    // 全デバイスに通知を送信
                    const sendResults = await Promise.allSettled(
                        subs.map((sub) =>
                            sendWebPushNotification(
                                {
                                    endpoint: sub.endpoint,
                                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                                },
                                {
                                    title: stepReminderTitle(locale),
                                    body,
                                    url: '/',
                                }
                            )
                        )
                    );

                    const successCount = sendResults.filter(
                        (r) => r.status === 'fulfilled' && r.value.success
                    ).length;

                    return { userId, successCount, totalDevices: subs.length };
                })
            );

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    totalSent += result.value.successCount;
                    totalFailed += result.value.totalDevices - result.value.successCount;
                } else {
                    totalFailed++;
                    reportError('cron/step-reminder:batch', result.reason);
                }
            }
        }

        console.log(
            `[Cron] Step reminder completed: checked=${userIds.length}, under_goal=${underGoalUserIds.length}, sent=${totalSent}, failed=${totalFailed}`
        );

        return NextResponse.json({
            success: true,
            message: 'ステップリマインダー通知送信完了',
            checked: userIds.length,
            underGoal: underGoalUserIds.length,
            sent: totalSent,
            failed: totalFailed,
            timestamp: new Date().toISOString(),
        });
    } catch (error: unknown) {
        reportError('cron/step-reminder', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
