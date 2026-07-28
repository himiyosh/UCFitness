export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { AppError, reportError } from '@/lib/errors';
import {
    CHALLENGE_PROGRESS_UNAVAILABLE_CODE,
    getChallengeProgressFailureStage,
    getFreshChallengeProgress,
    normalizeChallengeProgressFailure,
} from '@/lib/services/challenge-progress-service';
import { parseCanonicalUUID } from '@/lib/validation';

function getFailureMessage(stage: ReturnType<typeof getChallengeProgressFailureStage>): string {
    switch (stage) {
        case 'challenge-query':
        case 'challenge-result':
            return 'Failed to fetch challenge';
        case 'authorization':
            return 'Failed to authorize challenge progress';
        case 'participation-query':
        case 'participation-result':
            return 'Failed to fetch challenge participation';
        case 'group-rpc':
        case 'group-rpc-result':
        case 'group-record-query':
        case 'group-record-result':
            return 'Failed to calculate progress';
        case 'steps-query':
        case 'steps-result':
            return 'Failed to fetch steps';
        case 'update':
            return 'Failed to update challenge progress';
        default:
            return 'Internal server error';
    }
}

/** GET: チャレンジ進捗を取得 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> },
): Promise<NextResponse> {
    let authenticationComplete = false;
    try {
        const session = await auth();
        authenticationComplete = true;
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { challengeId } = await params;
        const canonicalChallengeId = parseCanonicalUUID(challengeId);
        if (canonicalChallengeId === null) {
            return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 });
        }

        const result = await getFreshChallengeProgress(
            session.user.id,
            canonicalChallengeId,
        );
        if (result.status === 'ok') {
            return NextResponse.json({ progress: result.progress });
        }
        if (result.status === 'not_found') {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }
        return NextResponse.json(
            { error: result.status === 'not_participating' ? 'Not participating' : 'Forbidden' },
            { status: 403 },
        );
    } catch (error: unknown) {
        const normalized = authenticationComplete
            ? normalizeChallengeProgressFailure(error)
            : new AppError(
                'Challenge progress request failed',
                CHALLENGE_PROGRESS_UNAVAILABLE_CODE,
                { stage: 'unexpected' },
            );
        reportError('challenge:progress', normalized);
        return NextResponse.json(
            { error: getFailureMessage(getChallengeProgressFailureStage(normalized)) },
            { status: 500 },
        );
    }
}
