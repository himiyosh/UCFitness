import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushNotification } from '@/lib/api/web-push';
import { reportError } from '@/lib/errors';
import { getJSTDateString } from '@/lib/date-utils';
import {
    normalizePushLocale,
    weeklySummaryTitle,
    formatWeeklySummaryBody,
} from '@/lib/services/push-messages';

import type { PushLocale } from '@/lib/services/push-messages';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/** バッチサイズ: 一度に処理するユーザー数 */
const BATCH_SIZE = 20;

/**
 * GET /api/cron/weekly-summary
 * 毎週月曜に実行され、各ユーザーに前週の歩数サマリーをプッシュ通知する。
 * CRON_SECRET による認証が必要。
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 🛡️ セキュリティチェック: CRON_SECRET が未設定 or ヘッダー不一致なら拒否
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        // 前週の月曜日〜日曜日の日付範囲を計算（JST基準）
        const { weekStart, weekEnd } = getPreviousWeekRange();

        // プッシュ通知を購読しているユーザーの一覧を取得（ユニークなuser_idのみ）
        const { data: subscriptionRows, error: subError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('user_id, endpoint, p256dh, auth');

        if (subError) {
            throw new Error(`Failed to fetch subscriptions: ${subError.message}`);
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

        // ユーザーの言語設定を一括取得
        const { data: usersLangData } = await supabaseAdmin
            .from('users')
            .select('id, language')
            .in('id', userIds);

        const userLangMap = new Map<string, PushLocale>();
        for (const u of usersLangData || []) {
            userLangMap.set(u.id, normalizePushLocale(u.language));
        }

        let totalSent = 0;
        let totalFailed = 0;

        // バッチ処理: BATCH_SIZE ユーザーずつ並列処理
        for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
            const batch = userIds.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(async (userId) => {
                    const summary = await getUserWeeklySummary(userId, weekStart, weekEnd);
                    const subs = userSubscriptions.get(userId) || [];
                    const locale = userLangMap.get(userId) || 'ja';

                    const notificationBody = formatWeeklySummaryBody(locale, summary);

                    // 全デバイスに通知を送信
                    const sendResults = await Promise.allSettled(
                        subs.map((sub) =>
                            sendWebPushNotification(
                                {
                                    endpoint: sub.endpoint,
                                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                                },
                                {
                                    title: weeklySummaryTitle(locale),
                                    body: notificationBody,
                                    url: '/profile',
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
                    reportError('cron/weekly-summary:batch', result.reason);
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'ウィークリーサマリー通知の送信が完了しました',
            weekRange: `${weekStart} ~ ${weekEnd}`,
            users: userIds.length,
            sent: totalSent,
            failed: totalFailed,
            timestamp: new Date().toISOString(),
        });
    } catch (error: unknown) {
        reportError('cron/weekly-summary', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// ============================================
// ヘルパー関数
// ============================================

interface WeeklySummary {
    totalSteps: number;
    totalCoins: number;
    bestDay: { date: string; steps: number } | null;
}

/**
 * 前週（月曜〜日曜）の日付範囲を返す（JST基準）
 */
function getPreviousWeekRange(): { weekStart: string; weekEnd: string } {
    const today = getJSTDateString();
    const todayDate = new Date(`${today}T00:00:00Z`);

    // 今日のUTC曜日を取得し、先週の月曜日を計算
    const utcDay = todayDate.getUTCDay(); // 0(Sun)〜6(Sat)
    // 月曜起算: Mon(1)->0, Tue(2)->1, ... Sun(0)->6
    const daysSinceMonday = (utcDay + 6) % 7;
    // 先週月曜 = 今日 - daysSinceMonday - 7
    const prevMonday = new Date(todayDate);
    prevMonday.setUTCDate(todayDate.getUTCDate() - daysSinceMonday - 7);

    // 先週日曜 = 先週月曜 + 6
    const prevSunday = new Date(prevMonday);
    prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);

    const weekStart = prevMonday.toISOString().split('T')[0];
    const weekEnd = prevSunday.toISOString().split('T')[0];

    return { weekStart, weekEnd };
}

/**
 * ユーザーの前週サマリーを取得
 */
async function getUserWeeklySummary(
    userId: string,
    weekStart: string,
    weekEnd: string
): Promise<WeeklySummary> {
    // 歩数データとコインデータを並列取得
    const [stepsResult, coinsResult] = await Promise.all([
        // daily_steps から前週の歩数を取得
        supabaseAdmin
            .from('daily_steps')
            .select('date, steps')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd)
            .order('date', { ascending: true }),

        // coin_transactions から前週のコイン獲得を取得（earned のみ）
        supabaseAdmin
            .from('coin_transactions')
            .select('amount')
            .eq('user_id', userId)
            .gte('created_at', `${weekStart}T00:00:00Z`)
            .lte('created_at', `${weekEnd}T23:59:59Z`)
            .gt('amount', 0),
    ]);

    // 歩数集計
    const stepsData = stepsResult.data || [];
    const totalSteps = stepsData.reduce((sum, row) => sum + (row.steps || 0), 0);

    // ベストデイの計算
    let bestDay: WeeklySummary['bestDay'] = null;
    for (const row of stepsData) {
        if (!bestDay || row.steps > bestDay.steps) {
            bestDay = { date: row.date, steps: row.steps };
        }
    }

    // コイン集計
    const coinsData = coinsResult.data || [];
    const totalCoins = coinsData.reduce((sum, row) => sum + (row.amount || 0), 0);

    return { totalSteps, totalCoins, bestDay };
}
