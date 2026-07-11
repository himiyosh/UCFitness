export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { isGoogleHealthEnabled } from '@/lib/api/google-health';
import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import {
    GOOGLE_HEALTH_OAUTH_STATE_COOKIE,
    GOOGLE_HEALTH_RETURN_TO_COOKIE,
} from '@/lib/google-health-oauth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
    disconnectGoogleHealth,
    getGoogleHealthConnectionSummary,
} from '@/lib/services/fitness-connection-service';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const connection = await getGoogleHealthConnectionSummary(session.user.id);
        return NextResponse.json({
            available: isGoogleHealthEnabled(),
            connection,
        });
    } catch (error: unknown) {
        reportError('healthConnections/google:get', error, {
            userId: session.user.id,
        });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimit = checkRateLimit(
        `google-health-disconnect:${session.user.id}`,
        5,
        60 * 1000,
    );
    if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit.retryAfterSeconds) as NextResponse;
    }

    try {
        await disconnectGoogleHealth(session.user.id);
        const response = NextResponse.json({ success: true });
        const secure = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure,
            sameSite: 'lax' as const,
            path: '/',
            maxAge: 0,
        };
        response.cookies.set(GOOGLE_HEALTH_OAUTH_STATE_COOKIE, '', cookieOptions);
        response.cookies.set(GOOGLE_HEALTH_RETURN_TO_COOKIE, '', cookieOptions);
        return response;
    } catch (error: unknown) {
        reportError('healthConnections/google:disconnect', error, {
            userId: session.user.id,
        });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
