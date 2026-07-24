export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { sendWebPushNotifications } from '@/lib/api/web-push';
import { AppError, reportError } from '@/lib/errors';
import { getJSTDateString } from '@/lib/date-utils';
import {
    weeklySummaryTitle,
    formatWeeklySummaryBody,
} from '@/lib/services/push-messages';
import {
    addWeeklyMetric,
    failWeekly,
    loadUserWeeklySummary,
    loadWeeklySubscriptionRows,
    loadWeeklyUserContexts,
    parseWeeklyDelivery,
    prepareWeeklySubscriptions,
    weeklyFailureCategory,
} from '@/lib/services/weekly-summary';

import type { PreviousJSTWeekRange, WeeklyFailure } from '@/lib/services/weekly-summary';

export type { PreviousJSTWeekRange } from '@/lib/services/weekly-summary';

export const dynamic = 'force-dynamic';

/** バッチサイズ: 一度に処理するユーザー数 */
const BATCH_SIZE = 20;

function reportFailure(operation: string, category: WeeklyFailure, context: Record<string, number> = {}): void {
    reportError(operation, new AppError('Weekly summary processing failed', 'WEEKLY_SUMMARY_FAILURE', { category, ...context })); }

/**
 * GET /api/cron/weekly-summary
 * 毎週月曜に実行され、各ユーザーに前週の歩数サマリーをプッシュ通知する。
 * CRON_SECRET による認証が必要。
 */
export async function GET(request: Request): Promise<NextResponse> {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    let stage: WeeklyFailure = 'unexpected';

    // 🛡️ セキュリティチェック: CRON_SECRET が未設定 or ヘッダー不一致なら拒否
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        // 前週の月曜日〜日曜日の日付範囲を計算（JST基準）
        const snapshotAt = new Date().toISOString();
        const range = getPreviousWeekRange(new Date(snapshotAt));
        stage = 'subscriptions-query';
        // プッシュ通知を購読しているユーザーの一覧を取得（ユニークなuser_idのみ）
        const subscriptionRows = await loadWeeklySubscriptionRows(snapshotAt);
        if (subscriptionRows.length === 0) return NextResponse.json({ success: true, message: 'プッシュ通知の購読者がいません', sent: 0, timestamp: snapshotAt });
        const prepared = await prepareWeeklySubscriptions(subscriptionRows, snapshotAt);
        const sendUserIds = Array.from(prepared.byUser.keys());
        stage = 'users-query'; const userContextMap = await loadWeeklyUserContexts(sendUserIds);
        let totalSent = 0; let totalFailed = prepared.failures.size; let totalDeduplicated = 0; let failureIndex = 0;
        for (const category of prepared.failures.values()) reportFailure('cron/weekly-summary:user', category, { itemIndex: failureIndex++ });
        stage = 'unexpected';

        // バッチ処理: BATCH_SIZE ユーザーずつ並列処理
        for (let i = 0; i < sendUserIds.length; i += BATCH_SIZE) {
            const batch = sendUserIds.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(async (userId) => {
                    const summary = await loadUserWeeklySummary(userId, range, snapshotAt);
                    const subs = prepared.byUser.get(userId) || [];
                    const userContext = userContextMap.get(userId);
                    if (!userContext || subs.length === 0) failWeekly('user-context');
                    let rawDelivery: unknown;
                    try {
                        rawDelivery = await sendWebPushNotifications(userId, subs, {
                            title: weeklySummaryTitle(userContext.locale),
                            body: formatWeeklySummaryBody(userContext.locale, summary),
                            url: `/user/${encodeURIComponent(userContext.username)}`, locale: userContext.locale, tag: 'weekly-summary',
                        });
                    } catch { failWeekly('push'); }
                    return parseWeeklyDelivery(rawDelivery, subs.length);
                }),
            );

            for (const [itemIndex, result] of results.entries()) {
                if (result.status === 'fulfilled') {
                    totalSent = addWeeklyMetric(totalSent, result.value.sent); totalFailed = addWeeklyMetric(totalFailed, result.value.failed);
                    totalDeduplicated = addWeeklyMetric(totalDeduplicated, result.value.deduplicated);
                    if (result.value.failed > 0) reportFailure('cron/weekly-summary:user', 'push', { batchIndex: i / BATCH_SIZE, itemIndex });
                } else {
                    totalFailed = addWeeklyMetric(totalFailed, 1);
                    reportFailure('cron/weekly-summary:user', weeklyFailureCategory(result.reason), { batchIndex: i / BATCH_SIZE, itemIndex });
                }
            }
        }

        const metrics = { weekRange: `${range.weekStart} ~ ${range.weekEnd}`, users: prepared.userIds.length,
            sent: totalSent, failed: totalFailed, deduplicated: totalDeduplicated, timestamp: snapshotAt };
        if (totalFailed > 0) return NextResponse.json({ success: false, error: 'Weekly summary delivery incomplete', ...metrics }, { status: 503 });
        return NextResponse.json({ success: true, message: 'ウィークリーサマリー通知の送信が完了しました', ...metrics });
    } catch (error: unknown) {
        const category = weeklyFailureCategory(error);
        reportFailure('cron/weekly-summary', category === 'unexpected' ? stage : category);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

// ============================================
// ヘルパー関数
// ============================================

export function getPreviousWeekRange(date: Date = new Date()): PreviousJSTWeekRange {
    const today = getJSTDateString(date);
    const todayDate = new Date(`${today}T00:00:00Z`);
    const utcDay = todayDate.getUTCDay();
    const daysSinceMonday = (utcDay + 6) % 7;
    const prevMonday = new Date(todayDate);
    prevMonday.setUTCDate(todayDate.getUTCDate() - daysSinceMonday - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
    const nextMonday = new Date(prevMonday);
    nextMonday.setUTCDate(prevMonday.getUTCDate() + 7);
    const weekStart = prevMonday.toISOString().split('T')[0];
    const weekEnd = prevSunday.toISOString().split('T')[0];
    const nextWeekStart = nextMonday.toISOString().split('T')[0];
    return { weekStart, weekEnd,
        startUtc: new Date(`${weekStart}T00:00:00+09:00`).toISOString(),
        endUtcExclusive: new Date(`${nextWeekStart}T00:00:00+09:00`).toISOString(),
    };
}
