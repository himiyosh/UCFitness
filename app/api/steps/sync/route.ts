export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { backfillUserSteps, syncUserSteps } from '@/lib/services/step-manager';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const rateLimit = checkRateLimit(`steps-sync:${userId}`, 3, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit.retryAfterSeconds);
    }

    try {
        // 過去1年分の履歴を同期（バックフィル）
        await backfillUserSteps(userId);

        // 今日の歩数を同期 + バッジ/称号/コイン処理
        const result = await syncUserSteps(userId);
        const status = result.code === 'updated' || result.code === 'no_data'
            ? 200
            : result.code === 'reauthorization_required'
                || result.code === 'sync_in_progress'
                ? 409
                : 503;
        return NextResponse.json(
            {
                success: result.code === 'updated',
                ...result,
            },
            { status },
        );
    } catch (error: unknown) {
        reportError('steps/sync', error, { userId });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
