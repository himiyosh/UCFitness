export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { parseChallengeProgressBatchRequest } from '@/lib/challenge-progress';
import { AppError, reportError } from '@/lib/errors';
import {
    CHALLENGE_PROGRESS_UNAVAILABLE_CODE,
    getFreshChallengeProgressBatch,
} from '@/lib/services/challenge-progress-service';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const validation = parseChallengeProgressBatchRequest(body);
    if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    try {
        const results = await getFreshChallengeProgressBatch(
            session.user.id,
            validation.challengeIds,
        );
        return NextResponse.json({ results });
    } catch (error: unknown) {
        const normalized = error instanceof AppError
            && error.code === CHALLENGE_PROGRESS_UNAVAILABLE_CODE
            ? error
            : new AppError(
                'Challenge progress batch request failed',
                'CHALLENGE_PROGRESS_BATCH_UNAVAILABLE',
                { stage: 'unexpected' },
            );
        reportError('challenge:progress:batch', normalized);
        return NextResponse.json(
            { error: 'Failed to load challenge progress' },
            { status: 500 },
        );
    }
}
