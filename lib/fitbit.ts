/**
 * Fitbit API クライアント
 * セキュリティ: エラーメッセージから生APIレスポンスを除去し、クライアントへの情報漏洩を防止
 */

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

export async function getFitbitSteps(accessToken: string, date: string = 'today'): Promise<number> {
    validateAccessToken(accessToken);
    validateDateFormat(date);

    const response = await fetch(
        `https://api.fitbit.com/1/user/-/activities/date/${date}.json`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
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

    const response = await fetch(
        `https://api.fitbit.com/1/user/-/activities/steps/date/today/${range}.json`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
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

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

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
