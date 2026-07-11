import {
    getGoogleHealthDailySteps,
    GoogleHealthApiError,
    refreshGoogleHealthAccessToken,
} from '@/lib/api/google-health';
import { AppError, reportError } from '@/lib/errors';
import {
    markGoogleHealthReauthorizationRequired,
    updateGoogleHealthTokens,
} from '@/lib/services/fitness-connection-service';

import type {
    GoogleHealthConnection,
} from '@/lib/services/fitness-connection-service';
import type {
    GoogleHealthDailySteps,
    GoogleHealthTokenSet,
} from '@/lib/api/google-health';

export interface GoogleHealthStepReader {
    read(startDateInclusive: string, endDateInclusive: string): Promise<GoogleHealthDailySteps[]>;
}

export function createGoogleHealthStepReader(
    connection: GoogleHealthConnection,
    claimId: string,
): GoogleHealthStepReader {
    let accessToken = connection.accessToken;
    let refreshToken = connection.refreshToken;
    let accessTokenExpiresAt = connection.accessTokenExpiresAt;
    let scopes = connection.scopes;

    async function requireReauthorization(
        reason: string,
        cause?: unknown,
    ): Promise<never> {
        await markGoogleHealthReauthorizationRequired(
            connection.userId,
            claimId,
            reason,
        );
        throw new AppError(
            'Google Health must be reconnected',
            'GOOGLE_HEALTH_REAUTHORIZATION_REQUIRED',
            { userId: connection.userId },
            cause,
        );
    }

    async function refreshAccessToken(): Promise<string> {
        if (!refreshToken) {
            return requireReauthorization('missing_refresh_token');
        }

        let tokenSet: GoogleHealthTokenSet;
        try {
            tokenSet = await refreshGoogleHealthAccessToken(refreshToken);
        } catch (error: unknown) {
            reportError('googleHealthStepSource:refresh', error, {
                userId: connection.userId,
            });
            if (
                error instanceof GoogleHealthApiError
                && (
                    error.reason === 'invalid_grant'
                    || error.reason === 'missing_required_scope'
                )
            ) {
                return requireReauthorization(error.reason, error);
            }
            throw error;
        }

        accessToken = tokenSet.accessToken;
        refreshToken = tokenSet.refreshToken ?? refreshToken;
        accessTokenExpiresAt = Math.floor(Date.now() / 1000) + tokenSet.expiresIn;
        scopes = tokenSet.scopes;
        await updateGoogleHealthTokens(
            connection.userId,
            claimId,
            {
                accessToken,
                refreshToken: tokenSet.refreshToken,
                accessTokenExpiresAt,
                scopes,
            },
        );
        return accessToken;
    }

    async function getValidAccessToken(): Promise<string> {
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (accessTokenExpiresAt && accessTokenExpiresAt - nowSeconds < 300) {
            return refreshAccessToken();
        }
        return accessToken;
    }

    return {
        async read(
            startDateInclusive: string,
            endDateInclusive: string,
        ): Promise<GoogleHealthDailySteps[]> {
            const validAccessToken = await getValidAccessToken();
            try {
                return await getGoogleHealthDailySteps(
                    validAccessToken,
                    startDateInclusive,
                    endDateInclusive,
                );
            } catch (error: unknown) {
                if (error instanceof GoogleHealthApiError && error.status === 401) {
                    const refreshedAccessToken = await refreshAccessToken();
                    try {
                        return await getGoogleHealthDailySteps(
                            refreshedAccessToken,
                            startDateInclusive,
                            endDateInclusive,
                        );
                    } catch (retryError: unknown) {
                        if (
                            retryError instanceof GoogleHealthApiError
                            && retryError.status === 401
                        ) {
                            return requireReauthorization(
                                'unauthorized_after_refresh',
                                retryError,
                            );
                        }
                        throw retryError;
                    }
                }
                throw error;
            }
        },
    };
}
