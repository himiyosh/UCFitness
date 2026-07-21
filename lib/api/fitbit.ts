/**
 * Fitbit API クライアント
 * セキュリティ: エラーメッセージから生APIレスポンスを除去し、クライアントへの情報漏洩を防止
 */

import { AppError } from '@/lib/errors';

/** Fitbit API レスポンスの日次歩数型 */
interface FitbitTimeSeries {
    dateTime: string;
    value: string;
}

/** Fitbit トークンリフレッシュのレスポンス型 */
interface FitbitTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    user_id: string;
    scope: string;
}

const FITBIT_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/**
 * 入力値バリデーション（共通）
 */
function validateAccessToken(accessToken: string): void {
    if (!accessToken || typeof accessToken !== 'string' || accessToken.trim().length === 0) {
        throw new Error('Invalid access token');
    }
}

function validateDateFormat(date: string): void {
    if (date !== 'today' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD or "today"');
    }
}

function isRetryableFitbitStatus(status: number): boolean {
    return status === 429 || status >= 500;
}

function waitForFitbitRetry(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchFitbitGet(url: string, accessToken: string): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
        const retryDelay = FITBIT_RETRY_DELAYS_MS[attempt];

        try {
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!isRetryableFitbitStatus(response.status)) {
                return response;
            }
            if (retryDelay === undefined) {
                throw new AppError(
                    `Fitbit API error: ${response.status}`,
                    'FITBIT_API_RETRY_EXHAUSTED',
                    { status: response.status, attempts: attempt + 1 },
                );
            }
        } catch (error: unknown) {
            if (retryDelay === undefined) {
                if (error instanceof AppError) {
                    throw error;
                }
                throw new AppError(
                    'Fitbit API network error after retries',
                    'FITBIT_API_RETRY_EXHAUSTED',
                    { attempts: attempt + 1 },
                    error,
                );
            }
        }

        await waitForFitbitRetry(retryDelay);
    }
}

export async function getFitbitSteps(accessToken: string, date: string = 'today'): Promise<number> {
    validateAccessToken(accessToken);
    validateDateFormat(date);

    const response = await fetchFitbitGet(
        `https://api.fitbit.com/1/user/-/activities/date/${date}.json`,
        accessToken,
    );

    if (!response.ok) {
        throw new Error(`Fitbit API error: ${response.status}`);
    }

    const data = (await response.json()) as { summary: { steps: number } };
    return data.summary.steps;
}

export async function getFitbitActivityTimeSeries(
    accessToken: string,
    range: '1w' | '1m' | '1y' = '1m'
): Promise<FitbitTimeSeries[]> {
    validateAccessToken(accessToken);

    const response = await fetchFitbitGet(
        `https://api.fitbit.com/1/user/-/activities/steps/date/today/${range}.json`,
        accessToken,
    );

    if (!response.ok) {
        throw new Error(`Fitbit API error: ${response.status}`);
    }

    const data = (await response.json()) as { 'activities-steps': FitbitTimeSeries[] };
    return data['activities-steps'];
}

/**
 * 日付範囲指定で歩数タイムシリーズを取得
 * Fitbit API の steps は最大1095日（約3年）まで取得可能
 * 全期間取得するには1095日ずつ分割して呼び出す
 */
export async function getFitbitActivityTimeSeriesByDateRange(
    accessToken: string,
    startDate: string,
    endDate: string
): Promise<FitbitTimeSeries[]> {
    validateAccessToken(accessToken);
    validateDateFormat(startDate);
    validateDateFormat(endDate);

    const response = await fetchFitbitGet(
        `https://api.fitbit.com/1/user/-/activities/steps/date/${startDate}/${endDate}.json`,
        accessToken,
    );

    if (!response.ok) {
        throw new Error(`Fitbit API error: ${response.status}`);
    }

    const data = (await response.json()) as { 'activities-steps': FitbitTimeSeries[] };
    return data['activities-steps'];
}

export async function refreshFitbitToken(refreshToken: string): Promise<FitbitTokenResponse> {
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
        throw new Error('Invalid refresh token');
    }

    const clientId = process.env.FITBIT_CLIENT_ID;
    const clientSecret = process.env.FITBIT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Fitbit client credentials are not configured');
    }

    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch('https://api.fitbit.com/oauth2/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to refresh Fitbit token: ${response.status}`);
    }

    return (await response.json()) as FitbitTokenResponse;
}

export async function getFitbitProfile(accessToken: string): Promise<Record<string, unknown>> {
    validateAccessToken(accessToken);

    const response = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Unauthorized");
        }
        throw new Error(`Fitbit API error: ${response.status}`);
    }

    const data = (await response.json()) as { user: Record<string, unknown> };
    return data.user;
}
