export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import {
    createGoogleHealthAuthorizationUrl,
    isGoogleHealthEnabled,
} from '@/lib/api/google-health';
import {
    createGoogleHealthOAuthState,
    GOOGLE_HEALTH_OAUTH_STATE_COOKIE,
    GOOGLE_HEALTH_RETURN_TO_COOKIE,
    normalizeGoogleHealthReturnPath,
} from '@/lib/google-health-oauth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isGoogleHealthEnabled()) {
        return NextResponse.json({ error: 'Google Health is not available' }, { status: 503 });
    }

    const rateLimit = checkRateLimit(
        `google-health-authorize:${session.user.id}`,
        5,
        15 * 60 * 1000,
    );
    if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit.retryAfterSeconds) as NextResponse;
    }

    const returnTo = normalizeGoogleHealthReturnPath(
        request.nextUrl.searchParams.get('returnTo'),
    );
    const state = await createGoogleHealthOAuthState(session.user.id);
    const response = NextResponse.redirect(createGoogleHealthAuthorizationUrl(state));
    const secure = process.env.NODE_ENV === 'production';

    response.cookies.set(GOOGLE_HEALTH_OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    });
    response.cookies.set(GOOGLE_HEALTH_RETURN_TO_COOKIE, returnTo, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    });

    return response;
}
