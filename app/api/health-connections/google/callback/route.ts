export const runtime = 'edge';

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import {
    exchangeGoogleHealthAuthorizationCode,
    getGoogleHealthIdentity,
    isGoogleHealthEnabled,
    revokeGoogleHealthToken,
} from '@/lib/api/google-health';
import { auth } from '@/lib/auth';
import { AppError, reportError } from '@/lib/errors';
import {
    GOOGLE_HEALTH_OAUTH_STATE_COOKIE,
    GOOGLE_HEALTH_RETURN_TO_COOKIE,
    isMatchingGoogleHealthOAuthState,
    normalizeGoogleHealthReturnPath,
} from '@/lib/google-health-oauth';
import {
    saveGoogleHealthConnection,
    verifyGoogleHealthMigrationIdentity,
} from '@/lib/services/fitness-connection-service';

import type { GoogleHealthNotice } from '@/lib/google-health-oauth';

export const dynamic = 'force-dynamic';

function getTrustedAppOrigin(request: NextRequest): string {
    const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
    if (redirectUri) {
        try {
            return new URL(redirectUri).origin;
        } catch {
            // Configuration validation in the OAuth client will surface the invalid URI.
        }
    }
    return request.nextUrl.origin;
}

function createSettingsRedirect(
    request: NextRequest,
    returnTo: string,
    notice: GoogleHealthNotice,
): NextResponse {
    const url = new URL(returnTo, getTrustedAppOrigin(request));
    url.searchParams.set('health', notice);
    const response = NextResponse.redirect(url);
    const secure = process.env.NODE_ENV === 'production';

    response.cookies.set(GOOGLE_HEALTH_OAUTH_STATE_COOKIE, '', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
    response.cookies.set(GOOGLE_HEALTH_RETURN_TO_COOKIE, '', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });

    return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const cookieStore = await cookies();
    const returnTo = normalizeGoogleHealthReturnPath(
        cookieStore.get(GOOGLE_HEALTH_RETURN_TO_COOKIE)?.value ?? null,
    );
    const session = await auth();
    if (!session?.user?.id) {
        return createSettingsRedirect(request, returnTo, 'session_expired');
    }

    if (!isGoogleHealthEnabled()) {
        return createSettingsRedirect(request, returnTo, 'connection_failed');
    }

    const actualState = request.nextUrl.searchParams.get('state') ?? '';
    const expectedState = cookieStore.get(GOOGLE_HEALTH_OAUTH_STATE_COOKIE)?.value ?? '';
    if (!await isMatchingGoogleHealthOAuthState(
        actualState,
        expectedState,
        session.user.id,
    )) {
        return createSettingsRedirect(request, returnTo, 'invalid_state');
    }

    const oauthError = request.nextUrl.searchParams.get('error');
    if (oauthError) {
        return createSettingsRedirect(request, returnTo, 'oauth_denied');
    }

    const code = request.nextUrl.searchParams.get('code');
    if (!code || code.length > 4096) {
        return createSettingsRedirect(request, returnTo, 'invalid_state');
    }

    let tokenToRevoke: string | null = null;
    try {
        const tokenSet = await exchangeGoogleHealthAuthorizationCode(code);
        tokenToRevoke = tokenSet.refreshToken ?? tokenSet.accessToken;
        const identity = await getGoogleHealthIdentity(tokenSet.accessToken);
        await verifyGoogleHealthMigrationIdentity(
            session.user.id,
            identity.legacyUserId,
        );
        await saveGoogleHealthConnection({
            userId: session.user.id,
            providerUserId: identity.healthUserId,
            legacyProviderUserId: identity.legacyUserId,
            accessToken: tokenSet.accessToken,
            refreshToken: tokenSet.refreshToken,
            accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokenSet.expiresIn,
            scopes: tokenSet.scopes,
        });
        return createSettingsRedirect(request, returnTo, 'connected');
    } catch (error: unknown) {
        if (tokenToRevoke) {
            try {
                await revokeGoogleHealthToken(tokenToRevoke);
            } catch (revocationError: unknown) {
                reportError('googleHealthOAuth:revokeFailedConnection', revocationError, {
                    userId: session.user.id,
                });
            }
        }
        reportError('googleHealthOAuth:callback', error, {
            userId: session.user.id,
        });
        const notice = error instanceof AppError
            && (
                error.code === 'GOOGLE_HEALTH_LEGACY_IDENTITY_MISMATCH'
                || error.code === 'GOOGLE_HEALTH_PROVIDER_IDENTITY_MISMATCH'
            )
            ? 'account_mismatch'
            : 'connection_failed';
        return createSettingsRedirect(request, returnTo, notice);
    }
}
