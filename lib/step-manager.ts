import { supabaseAdmin } from './supabase';
import { getFitbitSteps, refreshFitbitToken, getFitbitActivityTimeSeriesByDateRange } from './fitbit';
import { checkAndAwardBadges } from './badge-allocator';
import { processCoins } from './coin-service';
import { checkAndAwardTitleAchievements } from './title-achievement-service';
import { reportError } from './errors';
import { getJSTDateString } from './date-utils';

export const dynamic = 'force-dynamic';

interface User {
    id: string;
    email: string;
    provider: string | null;
    refresh_token: string | null;
    access_token: string | null;
    token_expires_at: number | null;
}

/** Fitbit activity time series entry */
interface FitbitTimeSeriesEntry {
    dateTime: string;
    value: string;
}

/**
 * Helper to ensure we have a valid access token.
 * If the current one is expired (or near expiry) or if a request fails, we refresh it.
 */
async function ensureFitbitAccessToken(user: User) {
    // Simple check: if we have a refresh token but no access token, or if we want to be proactive
    // For now, we'll return the current tokens and let the caller handle 401s by retrying,
    // OR we can wrap the logic here.
    //
    // Better approach: Return a function that makes the request and handles 401 refresh internally?
    // Or just invalidating the token if a request fails.

    // Let's implement a "get valid token" approach.
    // If we tracked expiration time reliably, we could check it here.
    // user.token_expires_at is in seconds.

    const nowSeconds = Math.floor(Date.now() / 1000);
    // Refresh if expired or expiring in next 5 minutes
    if (user.refresh_token && user.token_expires_at && (user.token_expires_at - nowSeconds < 300)) {
        return await performTokenRefresh(user);
    }

    return user.access_token;
}

async function performTokenRefresh(user: User) {
    try {
        if (!user.refresh_token) {
            reportError('performTokenRefresh', new Error('No refresh token available'), { userId: user.id });
            return null;
        }

        const newTokens = await refreshFitbitToken(user.refresh_token);

        // Update tokens in DB
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token,
                token_expires_at: Math.floor(Date.now() / 1000) + newTokens.expires_in,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

        if (updateError) {
            reportError('performTokenRefresh:updateDB', updateError, { userId: user.id });
            return null;
        } else {
            return newTokens.access_token;
        }
    } catch (refreshError) {
        reportError('performTokenRefresh', refreshError, { userId: user.id });
        return null; // Can't refresh
    }
}

/**
 * Core logic to update steps for a user object.
 * This avoids re-fetching the user if we already have the data.
 */
async function processUserSteps(user: User) {
    // Use JST (UTC+9) for date calculation
    const today = getJSTDateString();

    let steps: number | null = null;
    let accessToken = await ensureFitbitAccessToken(user);

    if (user.provider === 'fitbit') {
        if (!accessToken) {
            reportError('processUserSteps', new Error('Could not obtain access token'), { userId: user.id });
            return null;
        }

        try {
            steps = await getFitbitSteps(accessToken, today);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('Unauthorized') || message.includes('401')) {
                // Force refresh on 401
                accessToken = await performTokenRefresh(user);
                if (accessToken) {
                    try {
                        steps = await getFitbitSteps(accessToken, today);
                    } catch (retryError) {
                        reportError('processUserSteps:retrySteps', retryError, { userId: user.id });
                    }
                }
            } else {
                reportError('processUserSteps:fetchSteps', error, { userId: user.id });
            }
        }
    }

    // Only update if steps were fetched successfully (steps >= 0)
    if (steps !== null && steps >= 0) {
        const { error: upsertError } = await supabaseAdmin
            .from('daily_steps')
            .upsert(
                {
                    user_id: user.id,
                    date: today,
                    steps: steps,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,date' }
            );

        if (upsertError) {
            reportError('processUserSteps:upsert', upsertError, { userId: user.id, steps, date: today });
        } else {
            // バッジ・称号・コインは独立処理なので並列実行
            const results = await Promise.allSettled([
                checkAndAwardBadges(user.id),
                checkAndAwardTitleAchievements(user.id),
                processCoins(user.id, steps, today),
            ]);
            const labels = ['badges', 'titles', 'coins'] as const;
            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'rejected') {
                    reportError(`processUserSteps:${labels[i]}`, (results[i] as PromiseRejectedResult).reason, {
                        userId: user.id,
                        ...(labels[i] === 'coins' ? { steps, date: today } : {}),
                    });
                }
            }
        }
    }

    return steps;
}

export async function updateUserSteps(userId: string) {
    // Fetch user details (⚡ 必要カラムのみ取得)
    const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, email, provider, access_token, refresh_token, token_expires_at')
        .eq('id', userId)
        .single();

    if (error || !user) {
        reportError('updateUserSteps:fetchUser', error, { userId });
        return null;
    }

    return processUserSteps(user);
}

export async function backfillUserSteps(userId: string) {
    // ⚡ 必要カラムのみ取得
    const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, email, provider, access_token, refresh_token, token_expires_at')
        .eq('id', userId)
        .single();

    if (error || !user) {
        reportError('backfillUserSteps:fetchUser', error, { userId });
        return;
    }

    if (user.provider !== 'fitbit') {
        return;
    }

    let accessToken = await ensureFitbitAccessToken(user);
    if (!accessToken) {
        reportError('backfillUserSteps', new Error('Could not obtain access token'), { userId: user.id });
        return;
    }

    try {
        // 全期間の歩数を取得（1095日ずつ分割リクエスト）
        // Fitbit API: steps の Date Range は最大1095日、Rate Limit は 150リクエスト/時/ユーザー
        // 例: 5年分でも 2リクエストで完了するため Rate Limit の心配なし
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const MAX_RANGE_DAYS = 1095; // Fitbit API steps の最大取得日数
        const MAX_HISTORY_YEARS = 10; // 最大10年前まで遡る（十分な範囲）
        const oldestDate = new Date(today);
        oldestDate.setFullYear(oldestDate.getFullYear() - MAX_HISTORY_YEARS);

        let allStepsData: { user_id: string; date: string; steps: number; updated_at: string }[] = [];
        let currentEnd = new Date(today);

        while (currentEnd > oldestDate) {
            const currentStart = new Date(currentEnd);
            currentStart.setDate(currentStart.getDate() - MAX_RANGE_DAYS + 1);
            if (currentStart < oldestDate) {
                currentStart.setTime(oldestDate.getTime());
            }

            const startStr = currentStart.toISOString().slice(0, 10);
            const endStr = currentEnd.toISOString().slice(0, 10);

            let timeSeries;
            try {
                timeSeries = await getFitbitActivityTimeSeriesByDateRange(accessToken, startStr, endStr);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                if (message.includes('Unauthorized') || message.includes('401')) {
                    accessToken = await performTokenRefresh(user);
                    if (accessToken) {
                        timeSeries = await getFitbitActivityTimeSeriesByDateRange(accessToken, startStr, endStr);
                    } else {
                        break;
                    }
                } else {
                    // 404 等はこの期間にデータなし → ループ終了
                    break;
                }
            }

            if (timeSeries && Array.isArray(timeSeries) && timeSeries.length > 0) {
                const chunkData = (timeSeries as FitbitTimeSeriesEntry[])
                    .map((entry) => ({
                        user_id: user.id,
                        date: entry.dateTime,
                        steps: parseInt(entry.value, 10),
                        updated_at: new Date().toISOString(),
                    }))
                    .filter((d) => !isNaN(d.steps));

                allStepsData = allStepsData.concat(chunkData);
            } else {
                // データが返らない → これ以上遡っても無駄
                break;
            }

            // 次のチャンクへ（1日重複を避ける）
            currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() - 1);
        }

        // 一括 upsert（Supabase は大量レコードでも OK）
        if (allStepsData.length > 0) {
            // 1000件ずつバッチ処理（Supabase の安全な上限）
            const BATCH_SIZE = 1000;
            for (let i = 0; i < allStepsData.length; i += BATCH_SIZE) {
                const batch = allStepsData.slice(i, i + BATCH_SIZE);
                const { error: upsertError } = await supabaseAdmin
                    .from('daily_steps')
                    .upsert(batch, { onConflict: 'user_id,date' });

                if (upsertError) {
                    reportError('backfillUserSteps:upsert', upsertError, {
                        userId: user.id,
                        batchIndex: i,
                        batchSize: batch.length,
                        totalRecords: allStepsData.length,
                    });
                }
            }
        }

    } catch (error) {
        reportError('backfillUserSteps', error, { userId: user.id });
    }
}

export async function updateAllUserSteps() {
    // 1. Fetch all users with necessary fields
    // Optimization: Select only needed fields, not just ID, to avoid N+1 queries
    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, email, provider, access_token, refresh_token, token_expires_at');

    if (error || !users) {
        reportError('updateAllUserSteps:fetchUsers', error, {});
        return;
    }

    // Optimization: Run updates in parallel
    // We can map over users and call processUserSteps
    // Promise.all ensures we wait for all to complete
    await Promise.all(users.map(user => processUserSteps(user as User)));
}
