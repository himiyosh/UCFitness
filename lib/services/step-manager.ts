import { getFitbitActivityTimeSeriesByDateRange, getFitbitSteps, refreshFitbitToken } from '@/lib/api/fitbit';
import { addDaysToIsoDate } from '@/lib/api/google-health';
import { getJSTDateString } from '@/lib/date-utils';
import { AppError, reportError } from '@/lib/errors';
import {
    claimGoogleHealthSync,
    getAllGoogleHealthSyncSelections,
    getGoogleHealthSyncSelection,
    markGoogleHealthHistorySynced,
    markGoogleHealthSynced,
    releaseGoogleHealthSync,
} from '@/lib/services/fitness-connection-service';
import { createGoogleHealthStepReader } from '@/lib/services/google-health-step-source';
import { supabaseAdmin } from '@/lib/supabase';

import type {
    GoogleHealthConnection,
    GoogleHealthSyncClaim,
    GoogleHealthSyncSelection,
} from '@/lib/services/fitness-connection-service';
import type { GoogleHealthDailySteps } from '@/lib/api/google-health';

import { checkAndAwardBadges } from './badge-allocator';
import { processCoins } from './coin-service';
import { checkAndAwardTitleAchievements } from './title-achievement-service';

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

interface FitbitDailySteps {
    date: string;
    steps: number;
}

const USER_SYNC_BATCH_SIZE = 5;

export type StepSyncCode =
    | 'updated'
    | 'no_data'
    | 'reauthorization_required'
    | 'sync_in_progress'
    | 'unavailable';

export interface StepSyncResult {
    code: StepSyncCode;
    source: 'fitbit' | 'google_health' | null;
    steps: number | null;
}

type GoogleHealthLeaseResult<T> =
    | { status: 'acquired'; value: T }
    | { status: 'sync_in_progress' }
    | { status: 'unavailable' };

async function replaceGoogleHealthStepRange(
    userId: string,
    startDate: string,
    endDate: string,
    dailySteps: GoogleHealthDailySteps[],
    claimId: string,
): Promise<void> {
    const { error } = await supabaseAdmin.rpc('replace_daily_steps_range', {
        p_user_id: userId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_rows: dailySteps,
        p_claim_id: claimId,
    });
    if (error) {
        throw error;
    }
}

async function upsertGoogleHealthCurrentSteps(
    userId: string,
    date: string,
    steps: number,
    claimId: string,
): Promise<number> {
    const { data, error } = await supabaseAdmin.rpc('upsert_daily_steps_max', {
        p_user_id: userId,
        p_date: date,
        p_steps: steps,
        p_claim_id: claimId,
    });
    if (error) {
        throw error;
    }
    if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
        throw new Error('Google Health daily step upsert returned an invalid value');
    }
    return data;
}

async function upsertFitbitCurrentSteps(
    userId: string,
    date: string,
    steps: number,
): Promise<number> {
    const { data, error } = await supabaseAdmin.rpc('upsert_fitbit_daily_steps_max', {
        p_user_id: userId,
        p_date: date,
        p_steps: steps,
    });
    if (error) {
        throw error;
    }
    if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
        throw new Error('Fitbit daily step upsert returned an invalid value');
    }
    return data;
}

async function upsertFitbitHistoryBatch(
    userId: string,
    rows: FitbitDailySteps[],
): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc(
        'upsert_fitbit_daily_steps_batch',
        {
            p_user_id: userId,
            p_rows: rows,
        },
    );
    if (error) {
        throw error;
    }
    if (
        typeof data !== 'number'
        || !Number.isSafeInteger(data)
        || data < 0
        || data > rows.length
    ) {
        throw new Error('Fitbit history batch upsert returned an invalid value');
    }
}

async function markGoogleHealthSyncedSafely(
    userId: string,
    claimId: string,
): Promise<void> {
    try {
        await markGoogleHealthSynced(userId, claimId);
    } catch (error: unknown) {
        reportError('stepManager:markGoogleHealthSynced', error, { userId });
    }
}

async function runWithGoogleHealthSyncLease<T>(
    userId: string,
    operation: (claim: GoogleHealthSyncClaim) => Promise<T>,
): Promise<GoogleHealthLeaseResult<T>> {
    let claim: GoogleHealthSyncClaim | null;
    try {
        claim = await claimGoogleHealthSync(userId);
    } catch (error: unknown) {
        reportError('stepManager:claimGoogleHealthSync', error, { userId });
        return { status: 'unavailable' };
    }
    if (!claim) {
        return { status: 'sync_in_progress' };
    }

    try {
        return {
            status: 'acquired',
            value: await operation(claim),
        };
    } finally {
        try {
            await releaseGoogleHealthSync(userId, claim.claimId);
        } catch (error: unknown) {
            reportError('stepManager:releaseGoogleHealthSync', error, { userId });
        }
    }
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
async function processUserSteps(
    user: User,
    googleHealthSelection: GoogleHealthSyncSelection | null = null,
    googleHealthClaimId: string | null = null,
): Promise<StepSyncResult> {
    const googleHealthConnection = googleHealthSelection?.connection ?? null;
    if (googleHealthSelection && googleHealthConnection && !googleHealthClaimId) {
        const leaseResult = await runWithGoogleHealthSyncLease(user.id, (claim) => processUserSteps(
            user,
            {
                userId: googleHealthSelection.userId,
                status: googleHealthSelection.status,
                historySyncedAt: claim.historySyncedAt,
                connection: {
                    ...googleHealthConnection,
                    historySyncedAt: claim.historySyncedAt,
                },
            },
            claim.claimId,
        ));
        if (leaseResult.status === 'acquired') {
            return leaseResult.value;
        }
        return {
            code: leaseResult.status,
            source: 'google_health',
            steps: null,
        };
    }

    // Use JST (UTC+9) for date calculation
    const today = getJSTDateString();

    let steps: number | null = null;
    let usedGoogleHealth = false;
    if (googleHealthConnection && googleHealthClaimId) {
        try {
            if (!googleHealthConnection.historySyncedAt) {
                await backfillGoogleHealthSteps(
                    user.id,
                    googleHealthConnection,
                    today,
                    googleHealthClaimId,
                );
            }
            const reader = createGoogleHealthStepReader(
                googleHealthConnection,
                googleHealthClaimId,
            );
            const dailySteps = await reader.read(today, today);
            const currentDay = dailySteps.find((entry) => entry.date === today);
            steps = currentDay
                ? await upsertGoogleHealthCurrentSteps(
                    user.id,
                    today,
                    currentDay.steps,
                    googleHealthClaimId,
                )
                : null;
            usedGoogleHealth = true;
        } catch (error: unknown) {
            if (
                error instanceof AppError
                && error.code === 'GOOGLE_HEALTH_REAUTHORIZATION_REQUIRED'
            ) {
                return {
                    code: 'reauthorization_required',
                    source: 'google_health',
                    steps: null,
                };
            }
            reportError('processUserSteps:googleHealth', error, { userId: user.id });
            return {
                code: 'unavailable',
                source: 'google_health',
                steps: null,
            };
        }
    } else if (
        googleHealthSelection
        && googleHealthSelection.status !== 'disconnected'
    ) {
        return {
            code: 'reauthorization_required',
            source: 'google_health',
            steps: null,
        };
    } else if (user.provider === 'fitbit') {
        let accessToken = await ensureFitbitAccessToken(user);
        if (!accessToken) {
            reportError('processUserSteps', new Error('Could not obtain access token'), { userId: user.id });
            return {
                code: 'unavailable',
                source: 'fitbit',
                steps: null,
            };
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
                        return {
                            code: 'unavailable',
                            source: 'fitbit',
                            steps: null,
                        };
                    }
                } else {
                    return {
                        code: 'unavailable',
                        source: 'fitbit',
                        steps: null,
                    };
                }
            } else {
                reportError('processUserSteps:fetchSteps', error, { userId: user.id });
                return {
                    code: 'unavailable',
                    source: 'fitbit',
                    steps: null,
                };
            }
        }
    } else {
        return {
            code: 'unavailable',
            source: null,
            steps: null,
        };
    }

    if (usedGoogleHealth && googleHealthClaimId && steps === null) {
        await markGoogleHealthSyncedSafely(user.id, googleHealthClaimId);
        return {
            code: 'no_data',
            source: 'google_health',
            steps: null,
        };
    }

    // Only update if steps were fetched successfully (steps >= 0)
    if (steps !== null && steps >= 0) {
        let persisted = usedGoogleHealth;
        if (!usedGoogleHealth) {
            try {
                steps = await upsertFitbitCurrentSteps(user.id, today, steps);
                persisted = true;
            } catch (upsertError: unknown) {
                reportError('processUserSteps:upsert', upsertError, {
                    userId: user.id,
                    steps,
                    date: today,
                });
                return {
                    code: 'unavailable',
                    source: 'fitbit',
                    steps: null,
                };
            }
        }

        if (persisted) {
            if (usedGoogleHealth && googleHealthClaimId) {
                await markGoogleHealthSyncedSafely(user.id, googleHealthClaimId);
            }
            // 履歴移行は歩数だけを置換し、獲得済みUCは資産として再計算・減額しない。
            // UCの再計算は、単調増加で保存した当日値にだけ適用する。
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
            return {
                code: 'updated',
                source: usedGoogleHealth ? 'google_health' : 'fitbit',
                steps,
            };
        }
    }

    return {
        code: 'unavailable',
        source: usedGoogleHealth ? 'google_health' : user.provider === 'fitbit' ? 'fitbit' : null,
        steps: null,
    };
}

export async function syncUserSteps(userId: string): Promise<StepSyncResult> {
    // Fetch user details (⚡ 必要カラムのみ取得)
    const [userResult, googleHealthSelection] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('id, email, provider, access_token, refresh_token, token_expires_at')
            .eq('id', userId)
            .single(),
        getGoogleHealthSyncSelection(userId),
    ]);
    const { data: user, error } = userResult;

    if (error || !user) {
        reportError('updateUserSteps:fetchUser', error, { userId });
        return {
            code: 'unavailable',
            source: null,
            steps: null,
        };
    }

    return processUserSteps(user, googleHealthSelection);
}

export async function updateUserSteps(userId: string): Promise<number | null> {
    const result = await syncUserSteps(userId);
    return result.steps;
}

async function backfillGoogleHealthSteps(
    userId: string,
    connection: GoogleHealthConnection,
    today: string,
    claimId: string,
): Promise<void> {
    const oldestDate = addDaysToIsoDate(today, -365);
    const historyEndDate = addDaysToIsoDate(today, -1);
    const reader = createGoogleHealthStepReader(connection, claimId);
    const historicalSteps: GoogleHealthDailySteps[] = [];
    let currentStart = oldestDate;

    while (currentStart <= historyEndDate) {
        const candidateEnd = addDaysToIsoDate(currentStart, 89);
        const currentEnd = candidateEnd < historyEndDate
            ? candidateEnd
            : historyEndDate;
        const dailySteps = await reader.read(currentStart, currentEnd);
        historicalSteps.push(...dailySteps);
        currentStart = addDaysToIsoDate(currentEnd, 1);
    }

    await replaceGoogleHealthStepRange(
        userId,
        oldestDate,
        historyEndDate,
        historicalSteps,
        claimId,
    );
    await markGoogleHealthHistorySynced(userId, claimId);
}

export async function backfillUserSteps(userId: string): Promise<void> {
    // ⚡ 必要カラムのみ取得
    const [userResult, googleHealthSelection] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('id, email, provider, access_token, refresh_token, token_expires_at')
            .eq('id', userId)
            .single(),
        getGoogleHealthSyncSelection(userId),
    ]);
    const { data: user, error } = userResult;

    if (error || !user) {
        reportError('backfillUserSteps:fetchUser', error, { userId });
        return;
    }

    if (googleHealthSelection?.connection) {
        if (googleHealthSelection.connection.historySyncedAt) {
            return;
        }
        const googleHealthConnection = googleHealthSelection.connection;
        try {
            await runWithGoogleHealthSyncLease(userId, (claim) => {
                if (claim.historySyncedAt) {
                    return Promise.resolve();
                }
                return backfillGoogleHealthSteps(
                    userId,
                    googleHealthConnection,
                    getJSTDateString(),
                    claim.claimId,
                );
            });
        } catch (googleHealthError: unknown) {
            reportError('backfillUserSteps:googleHealth', googleHealthError, { userId });
        }
        return;
    }

    if (
        googleHealthSelection
        && googleHealthSelection.status !== 'disconnected'
    ) {
        return;
    }
    if (
        googleHealthSelection?.status === 'disconnected'
        && googleHealthSelection.historySyncedAt
    ) {
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

        let allStepsData: FitbitDailySteps[] = [];
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
                        date: entry.dateTime,
                        steps: parseInt(entry.value, 10),
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
                await upsertFitbitHistoryBatch(user.id, batch);
            }
        }

    } catch (error) {
        reportError('backfillUserSteps', error, { userId: user.id });
    }
}

export async function updateAllUserSteps(): Promise<void> {
    // 1. Fetch all users with necessary fields
    // Optimization: Select only needed fields, not just ID, to avoid N+1 queries
    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, email, provider, access_token, refresh_token, token_expires_at');

    if (error || !users) {
        reportError('updateAllUserSteps:fetchUsers', error, {});
        return;
    }

    const googleHealthSelections = await getAllGoogleHealthSyncSelections();
    const googleHealthByUserId = new Map(
        googleHealthSelections.map((selection) => [selection.userId, selection]),
    );

    // 初回履歴移行はユーザーごとに複数API要求を行うため、外部APIへの集中を避ける。
    for (let index = 0; index < users.length; index += USER_SYNC_BATCH_SIZE) {
        const batch = users.slice(index, index + USER_SYNC_BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map((user) => processUserSteps(
                user as User,
                googleHealthByUserId.get(user.id) ?? null,
            )),
        );
        for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
            const result = results[resultIndex];
            if (result.status === 'rejected') {
                reportError('updateAllUserSteps:processUser', result.reason, {
                    userId: batch[resultIndex].id,
                });
            }
        }
    }
}
