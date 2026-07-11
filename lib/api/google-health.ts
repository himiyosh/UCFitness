const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKEN_REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_HEALTH_API_ROOT = 'https://health.googleapis.com/v4';
const GOOGLE_HEALTH_STEPS_ENDPOINT =
    `${GOOGLE_HEALTH_API_ROOT}/users/me/dataTypes/steps/dataPoints:dailyRollUp`;
const GOOGLE_HEALTH_IDENTITY_ENDPOINT = `${GOOGLE_HEALTH_API_ROOT}/users/me/identity`;
const MAX_ROLLUP_RANGE_DAYS = 90;

export const GOOGLE_HEALTH_ACTIVITY_SCOPE =
    'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';

interface GoogleHealthConfiguration {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

interface GoogleTokenApiResponse {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type: string;
}

export interface GoogleHealthTokenSet {
    accessToken: string;
    expiresIn: number;
    refreshToken: string | null;
    scopes: string[];
    tokenType: string;
}

export interface GoogleHealthIdentity {
    healthUserId: string;
    legacyUserId: string | null;
}

interface CivilDate {
    year: number;
    month: number;
    day: number;
}

interface CivilDateTime {
    date: CivilDate;
}

export interface GoogleHealthDailySteps {
    date: string;
    steps: number;
}

export type GoogleHealthApiErrorReason =
    | 'invalid_grant'
    | 'missing_required_scope';

export class GoogleHealthApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly reason: GoogleHealthApiErrorReason | null = null,
    ) {
        super(message);
        this.name = 'GoogleHealthApiError';
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidRedirectUri(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
    } catch {
        return false;
    }
}

function getGoogleHealthConfiguration(): GoogleHealthConfiguration {
    const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri || !isValidRedirectUri(redirectUri)) {
        throw new Error('Google Health OAuth is not configured correctly');
    }

    return { clientId, clientSecret, redirectUri };
}

export function isGoogleHealthEnabled(): boolean {
    const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
    return process.env.GOOGLE_HEALTH_ENABLED === 'true'
        && Boolean(process.env.GOOGLE_HEALTH_CLIENT_ID)
        && Boolean(process.env.GOOGLE_HEALTH_CLIENT_SECRET)
        && Boolean(redirectUri)
        && isValidRedirectUri(redirectUri ?? '')
        && Boolean(process.env.FITNESS_TOKEN_ENCRYPTION_KEY);
}

function parseTokenResponse(value: unknown): GoogleTokenApiResponse {
    if (
        !isRecord(value)
        || typeof value.access_token !== 'string'
        || !value.access_token.trim()
        || value.access_token !== value.access_token.trim()
        || typeof value.expires_in !== 'number'
        || !Number.isSafeInteger(value.expires_in)
        || value.expires_in <= 0
        || typeof value.token_type !== 'string'
        || value.token_type.trim().toLowerCase() !== 'bearer'
        || (
            value.refresh_token !== undefined
            && (
                typeof value.refresh_token !== 'string'
                || !value.refresh_token.trim()
                || value.refresh_token !== value.refresh_token.trim()
            )
        )
        || (value.scope !== undefined && typeof value.scope !== 'string')
    ) {
        throw new Error('Google OAuth returned an invalid token response');
    }

    return {
        access_token: value.access_token,
        expires_in: value.expires_in,
        refresh_token: value.refresh_token,
        scope: value.scope,
        token_type: value.token_type,
    };
}

function toTokenSet(response: GoogleTokenApiResponse): GoogleHealthTokenSet {
    const scopes = response.scope === undefined
        ? [GOOGLE_HEALTH_ACTIVITY_SCOPE]
        : response.scope.split(' ').filter(Boolean);
    if (!scopes.includes(GOOGLE_HEALTH_ACTIVITY_SCOPE)) {
        throw new GoogleHealthApiError(
            'Google OAuth did not grant the required Health scope',
            403,
            'missing_required_scope',
        );
    }

    return {
        accessToken: response.access_token,
        expiresIn: response.expires_in,
        refreshToken: response.refresh_token ?? null,
        scopes,
        tokenType: response.token_type,
    };
}

async function requestGoogleToken(body: URLSearchParams): Promise<GoogleHealthTokenSet> {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        cache: 'no-store',
    });

    if (!response.ok) {
        let reason: GoogleHealthApiErrorReason | null = null;
        try {
            const errorBody: unknown = await response.json();
            if (isRecord(errorBody) && errorBody.error === 'invalid_grant') {
                reason = 'invalid_grant';
            }
        } catch {
            // Provider response bodies are intentionally excluded from application errors.
        }
        throw new GoogleHealthApiError(
            'Google OAuth token request failed',
            response.status,
            reason,
        );
    }

    return toTokenSet(parseTokenResponse(await response.json()));
}

export function createGoogleHealthAuthorizationUrl(state: string): string {
    if (!state || state.length > 256) {
        throw new Error('Invalid Google Health OAuth state');
    }

    const configuration = getGoogleHealthConfiguration();
    const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({
        client_id: configuration.clientId,
        redirect_uri: configuration.redirectUri,
        response_type: 'code',
        scope: GOOGLE_HEALTH_ACTIVITY_SCOPE,
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        state,
    }).toString();
    return url.toString();
}

export async function exchangeGoogleHealthAuthorizationCode(
    code: string,
): Promise<GoogleHealthTokenSet> {
    if (!code || code.length > 4096) {
        throw new Error('Invalid Google Health authorization code');
    }

    const configuration = getGoogleHealthConfiguration();
    return requestGoogleToken(new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: configuration.redirectUri,
    }));
}

export async function refreshGoogleHealthAccessToken(
    refreshToken: string,
): Promise<GoogleHealthTokenSet> {
    if (!refreshToken || refreshToken.length > 4096) {
        throw new Error('Invalid Google Health refresh token');
    }

    const configuration = getGoogleHealthConfiguration();
    return requestGoogleToken(new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
    }));
}

export async function revokeGoogleHealthToken(token: string): Promise<void> {
    if (!token || token.length > 4096) {
        throw new Error('Invalid Google Health token for revocation');
    }

    const response = await fetch(GOOGLE_TOKEN_REVOCATION_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token }),
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new GoogleHealthApiError(
            'Google OAuth token revocation failed',
            response.status,
        );
    }
}

export async function getGoogleHealthIdentity(accessToken: string): Promise<GoogleHealthIdentity> {
    if (!accessToken) {
        throw new Error('Google Health access token is required');
    }

    const response = await fetch(GOOGLE_HEALTH_IDENTITY_ENDPOINT, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new GoogleHealthApiError('Google Health identity request failed', response.status);
    }

    const value: unknown = await response.json();
    if (
        !isRecord(value)
        || typeof value.healthUserId !== 'string'
        || !value.healthUserId.trim()
        || value.healthUserId !== value.healthUserId.trim()
        || (
            value.legacyUserId !== undefined
            && (
                typeof value.legacyUserId !== 'string'
                || !value.legacyUserId.trim()
                || value.legacyUserId !== value.legacyUserId.trim()
            )
        )
    ) {
        throw new Error('Google Health returned an invalid identity response');
    }

    return {
        healthUserId: value.healthUserId,
        legacyUserId: typeof value.legacyUserId === 'string' ? value.legacyUserId : null,
    };
}

function parseIsoDate(value: string): CivilDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new Error('Date must use YYYY-MM-DD format');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        throw new Error('Date is not a valid calendar date');
    }

    return { year, month, day };
}

function formatIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function addDaysToIsoDate(value: string, days: number): string {
    const date = parseIsoDate(value);
    const result = new Date(Date.UTC(date.year, date.month - 1, date.day));
    result.setUTCDate(result.getUTCDate() + days);
    return formatIsoDate(result);
}

function dateDifferenceInDays(startDate: CivilDate, endDate: CivilDate): number {
    const start = Date.UTC(startDate.year, startDate.month - 1, startDate.day);
    const end = Date.UTC(endDate.year, endDate.month - 1, endDate.day);
    return Math.floor((end - start) / 86_400_000);
}

function toCivilDateTime(value: CivilDate): CivilDateTime {
    return { date: value };
}

function parseCivilDateTime(value: unknown): string | null {
    if (!isRecord(value) || !isRecord(value.date)) {
        return null;
    }

    const { year, month, day } = value.date;
    if (
        typeof year !== 'number'
        || typeof month !== 'number'
        || typeof day !== 'number'
    ) {
        return null;
    }

    try {
        const isoDate = [
            String(year).padStart(4, '0'),
            String(month).padStart(2, '0'),
            String(day).padStart(2, '0'),
        ].join('-');
        parseIsoDate(isoDate);
        return isoDate;
    } catch {
        return null;
    }
}

function parseDailyStepsResponse(value: unknown): GoogleHealthDailySteps[] {
    if (!isRecord(value) || !Array.isArray(value.rollupDataPoints)) {
        throw new Error('Google Health returned an invalid steps response');
    }

    const stepsByDate = new Map<string, number>();
    for (const dataPoint of value.rollupDataPoints) {
        if (!isRecord(dataPoint) || !isRecord(dataPoint.steps)) {
            throw new Error('Google Health returned an invalid steps data point');
        }

        const date = parseCivilDateTime(dataPoint.civilStartTime);
        const countSum = dataPoint.steps.countSum;
        if (!date || typeof countSum !== 'string' || !/^\d+$/.test(countSum)) {
            throw new Error('Google Health returned an invalid steps data point');
        }

        const steps = Number(countSum);
        if (!Number.isSafeInteger(steps)) {
            throw new Error('Google Health returned an invalid steps data point');
        }
        stepsByDate.set(date, Math.max(stepsByDate.get(date) ?? 0, steps));
    }

    return [...stepsByDate]
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
        .map(([date, steps]) => ({ date, steps }));
}

export async function getGoogleHealthDailySteps(
    accessToken: string,
    startDateInclusive: string,
    endDateInclusive: string,
): Promise<GoogleHealthDailySteps[]> {
    if (!accessToken) {
        throw new Error('Google Health access token is required');
    }

    const startDate = parseIsoDate(startDateInclusive);
    const endDate = parseIsoDate(endDateInclusive);
    const rangeDays = dateDifferenceInDays(startDate, endDate) + 1;
    if (rangeDays < 1 || rangeDays > MAX_ROLLUP_RANGE_DAYS) {
        throw new Error(`Google Health rollup range must be between 1 and ${MAX_ROLLUP_RANGE_DAYS} days`);
    }

    const response = await fetch(GOOGLE_HEALTH_STEPS_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            range: {
                start: toCivilDateTime(startDate),
                end: toCivilDateTime(parseIsoDate(addDaysToIsoDate(endDateInclusive, 1))),
            },
            windowSizeDays: 1,
            pageSize: rangeDays,
        }),
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new GoogleHealthApiError('Google Health steps request failed', response.status);
    }

    const dailySteps = parseDailyStepsResponse(await response.json());
    if (
        dailySteps.some(
            ({ date }) => date < startDateInclusive || date > endDateInclusive,
        )
    ) {
        throw new Error('Google Health returned steps outside the requested range');
    }
    return dailySteps;
}
