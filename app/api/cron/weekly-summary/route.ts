export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import {
    isAllowedPushEndpoint,
    isValidPushKey,
    sendWebPushNotifications,
} from '@/lib/api/web-push';
import { AppError, reportError } from '@/lib/errors';
import { getJSTDateString } from '@/lib/date-utils';
import {
    weeklySummaryTitle,
    formatWeeklySummaryBody,
} from '@/lib/services/push-messages';

import type { StoredPushSubscriptionData } from '@/lib/api/web-push';
import type { PushLocale } from '@/lib/services/push-messages';

export const dynamic = 'force-dynamic';

/** バッチサイズ: 一度に処理するユーザー数 */
const BATCH_SIZE = 20;
const SUBSCRIPTION_PAGE_SIZE = 900;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type FailureCategory = 'subscriptions-query' | 'subscriptions-data' | 'users-query' | 'users-data' | 'user-context' | 'steps-query' | 'steps-data' | 'coins-query' | 'coins-data' | 'push' | 'delivery-data' | 'metrics-overflow' | 'unexpected';
interface UserContext { locale: PushLocale; username: string }
interface DeliveryMetrics { sent: number; failed: number; deduplicated: number }
export interface PreviousJSTWeekRange { weekStart: string; weekEnd: string; startUtc: string; endUtcExclusive: string }
class WeeklySummaryFailure extends Error { constructor(readonly category: FailureCategory) {
    super('Weekly summary processing failed'); this.name = 'WeeklySummaryFailure'; } }
function fail(category: FailureCategory): never { throw new WeeklySummaryFailure(category); }
function failureCategory(error: unknown): FailureCategory { return error instanceof WeeklySummaryFailure ? error.category : 'unexpected'; }
function reportFailure(operation: string, category: FailureCategory, context: Record<string, number> = {}): void {
    reportError(operation, new AppError('Weekly summary processing failed', 'WEEKLY_SUMMARY_FAILURE', { category, ...context })); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isDateString(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
function isNonNegativeSafeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function addMetric(left: number, right: number): number {
    const total = left + right; if (!Number.isSafeInteger(total) || total < 0) fail('metrics-overflow'); return total;
}

function parseUserContexts(data: unknown, expectedIds: Set<string>): Map<string, UserContext | null> {
    if (!Array.isArray(data)) fail('users-data');
    const contexts = new Map<string, UserContext | null>();
    for (const row of data) {
        if (!isRecord(row) || typeof row.id !== 'string' || !UUID_PATTERN.test(row.id)
            || !expectedIds.has(row.id) || contexts.has(row.id)) fail('users-data');
        const locale = row.language; const username = row.username;
        contexts.set(row.id, (locale === 'ja' || locale === 'en') && typeof username === 'string'
            && username.length > 0 && username.length <= 64 ? { locale, username } : null);
    }
    return contexts;
}

function parseDelivery(data: unknown, subscriptionCount: number): DeliveryMetrics {
    if (!isRecord(data) || !isNonNegativeSafeInteger(data.sent) || !isNonNegativeSafeInteger(data.failed)
        || !isNonNegativeSafeInteger(data.expired) || !isNonNegativeSafeInteger(data.skippedDuplicates)
        || data.expired > data.failed || data.skippedDuplicates > subscriptionCount
        || addMetric(data.sent, data.failed) !== subscriptionCount - data.skippedDuplicates
    ) fail('delivery-data');
    return { sent: data.sent, failed: data.failed, deduplicated: data.skippedDuplicates };
}

/**
 * GET /api/cron/weekly-summary
 * 毎週月曜に実行され、各ユーザーに前週の歩数サマリーをプッシュ通知する。
 * CRON_SECRET による認証が必要。
 */
export async function GET(request: Request): Promise<NextResponse> {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    let stage: FailureCategory = 'unexpected';

    // 🛡️ セキュリティチェック: CRON_SECRET が未設定 or ヘッダー不一致なら拒否
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        // 前週の月曜日〜日曜日の日付範囲を計算（JST基準）
        const range = getPreviousWeekRange();
        stage = 'subscriptions-query';
        // プッシュ通知を購読しているユーザーの一覧を取得（ユニークなuser_idのみ）
        const subscriptionRows = await loadSubscriptionRows();
        if (subscriptionRows.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'プッシュ通知の購読者がいません',
                sent: 0,
                timestamp: new Date().toISOString(),
            });
        }

        // ユーザーごとにサブスクリプションをグループ化
        const userSubscriptions = new Map<string, StoredPushSubscriptionData[]>();
        const subscriptionIds = new Set<string>();
        for (const row of subscriptionRows) {
            if (!isRecord(row) || typeof row.id !== 'string' || !UUID_PATTERN.test(row.id)
                || subscriptionIds.has(row.id) || typeof row.user_id !== 'string'
                || !UUID_PATTERN.test(row.user_id) || !isAllowedPushEndpoint(row.endpoint)
                || !isValidPushKey(row.p256dh, 256, 65) || !isValidPushKey(row.auth, 128, 16)
                || (row.user_agent !== null && typeof row.user_agent !== 'string')
                || typeof row.created_at !== 'string'
                || !Number.isFinite(Date.parse(row.created_at))) fail('subscriptions-data');
            subscriptionIds.add(row.id);
            const existing = userSubscriptions.get(row.user_id) || [];
            existing.push({
                id: row.id,
                endpoint: row.endpoint,
                p256dh: row.p256dh,
                auth: row.auth,
                user_agent: row.user_agent,
                created_at: row.created_at,
            });
            userSubscriptions.set(row.user_id, existing);
        }

        const userIds = Array.from(userSubscriptions.keys());
        stage = 'users-query';
        const userContextMap = await loadUserContexts(userIds);
        let totalSent = 0;
        let totalFailed = 0;
        let totalDeduplicated = 0;
        stage = 'unexpected';

        // バッチ処理: BATCH_SIZE ユーザーずつ並列処理
        for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
            const batch = userIds.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(async (userId) => {
                    const summary = await getUserWeeklySummary(userId, range);
                    const subs = userSubscriptions.get(userId) || [];
                    const userContext = userContextMap.get(userId);
                    if (!userContext || subs.length === 0) fail('user-context');
                    const notificationBody = formatWeeklySummaryBody(
                        userContext.locale,
                        summary,
                    );
                    let rawDelivery: unknown;
                    try {
                        rawDelivery = await sendWebPushNotifications(userId, subs, {
                            title: weeklySummaryTitle(userContext.locale),
                            body: notificationBody,
                            url: `/user/${encodeURIComponent(userContext.username)}`,
                            locale: userContext.locale,
                            tag: 'weekly-summary',
                        });
                    } catch {
                        fail('push');
                    }
                    return { userId, delivery: parseDelivery(rawDelivery, subs.length) };
                }),
            );

            for (const [itemIndex, result] of results.entries()) {
                if (result.status === 'fulfilled') {
                    totalSent = addMetric(totalSent, result.value.delivery.sent);
                    totalFailed = addMetric(totalFailed, result.value.delivery.failed);
                    totalDeduplicated = addMetric(
                        totalDeduplicated, result.value.delivery.deduplicated,
                    );
                    if (result.value.delivery.failed > 0) {
                        reportFailure('cron/weekly-summary:user', 'push', {
                            batchIndex: i / BATCH_SIZE, itemIndex,
                        });
                    }
                } else {
                    totalFailed = addMetric(totalFailed, 1);
                    reportFailure(
                        'cron/weekly-summary:user',
                        failureCategory(result.reason),
                        { batchIndex: i / BATCH_SIZE, itemIndex },
                    );
                }
            }
        }

        const metrics = {
            weekRange: `${range.weekStart} ~ ${range.weekEnd}`,
            users: userIds.length,
            sent: totalSent,
            failed: totalFailed,
            deduplicated: totalDeduplicated,
            timestamp: new Date().toISOString(),
        };
        if (totalFailed > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Weekly summary delivery incomplete',
                    ...metrics,
                },
                { status: 503 },
            );
        }
        return NextResponse.json({
            success: true,
            message: 'ウィークリーサマリー通知の送信が完了しました',
            ...metrics,
        });
    } catch (error: unknown) {
        const category = failureCategory(error);
        reportFailure('cron/weekly-summary', category === 'unexpected' ? stage : category);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 },
        );
    }
}

// ============================================
// ヘルパー関数
// ============================================

async function loadSubscriptionRows(): Promise<unknown[]> {
    const rows: unknown[] = []; let cursor: string | null = null;
    while (true) {
        let query = supabaseAdmin.from('push_subscriptions')
            .select('id, user_id, endpoint, p256dh, auth, user_agent, created_at')
            .order('id', { ascending: true }).limit(SUBSCRIPTION_PAGE_SIZE);
        if (cursor) query = query.gt('id', cursor);
        const page = await query;
        if (page.error) fail('subscriptions-query');
        if (!Array.isArray(page.data)) fail('subscriptions-data');
        rows.push(...page.data);
        if (page.data.length < SUBSCRIPTION_PAGE_SIZE) return rows;
        const last = page.data.at(-1);
        if (!isRecord(last) || typeof last.id !== 'string'
            || (cursor !== null && last.id <= cursor)) fail('subscriptions-data');
        cursor = last.id;
    }
}

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

interface WeeklySummary {
    totalSteps: number;
    totalCoins: number;
    bestDay: { date: string; steps: number } | null;
}

async function loadUserContexts(userIds: string[]): Promise<Map<string, UserContext | null>> {
    const contexts = new Map<string, UserContext | null>();
    for (let index = 0; index < userIds.length; index += BATCH_SIZE) {
        const batch = userIds.slice(index, index + BATCH_SIZE);
        const result = await supabaseAdmin.from('users')
            .select('id, language, username').in('id', batch);
        if (result.error) fail('users-query');
        for (const [id, context] of parseUserContexts(result.data, new Set(batch))) {
            contexts.set(id, context);
        }
    }
    return contexts;
}

async function getUserWeeklySummary(
    userId: string,
    range: PreviousJSTWeekRange,
): Promise<WeeklySummary> {
    const [stepsResult, coinsResult] = await Promise.allSettled([
        supabaseAdmin
            .from('daily_steps')
            .select('date, steps')
            .eq('user_id', userId)
            .gte('date', range.weekStart)
            .lte('date', range.weekEnd)
            .order('date', { ascending: true }),
        supabaseAdmin
            .from('coin_transactions')
            .select('id, amount')
            .eq('user_id', userId)
            .gte('created_at', range.startUtc)
            .lt('created_at', range.endUtcExclusive)
            .gt('amount', 0),
    ]);
    if (stepsResult.status === 'rejected' || stepsResult.value.error) fail('steps-query');
    if (coinsResult.status === 'rejected' || coinsResult.value.error) fail('coins-query');
    const stepsData = stepsResult.value.data;
    if (!Array.isArray(stepsData)) fail('steps-data');
    const dates = new Set<string>();
    const totalSteps = stepsData.reduce((sum, row) => {
        if (!isRecord(row) || !isDateString(row.date) || dates.has(row.date)
            || row.date < range.weekStart || row.date > range.weekEnd
            || !isNonNegativeSafeInteger(row.steps)) fail('steps-data');
        dates.add(row.date);
        return addMetric(sum, row.steps);
    }, 0);

    let bestDay: WeeklySummary['bestDay'] = null;
    for (const row of stepsData) {
        if (!bestDay || row.steps > bestDay.steps) {
            bestDay = { date: row.date, steps: row.steps };
        }
    }

    const coinsData = coinsResult.value.data;
    if (!Array.isArray(coinsData)) fail('coins-data');
    const transactionIds = new Set<string>();
    const totalCoins = coinsData.reduce((sum, row) => {
        if (!isRecord(row) || typeof row.id !== 'string' || !UUID_PATTERN.test(row.id)
            || transactionIds.has(row.id) || !isNonNegativeSafeInteger(row.amount)
            || row.amount === 0) fail('coins-data');
        transactionIds.add(row.id);
        return addMetric(sum, row.amount);
    }, 0);

    return { totalSteps, totalCoins, bestDay };
}
