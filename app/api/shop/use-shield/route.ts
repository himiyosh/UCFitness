export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { getJSTDateString } from '@/lib/date-utils';

// ストリークシールドを使用する
export async function POST() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const today = getJSTDateString();

    try {
        const { data, error } = await supabaseAdmin.rpc('use_streak_shield', {
            p_user_id: userId,
            p_date: today,
        });
        const result: unknown = data;
        if (error || typeof result !== 'object' || result === null || !('success' in result)) {
            throw error ?? new Error('Invalid shield RPC response');
        }
        if (result.success !== true) {
            const code = 'error' in result ? result.error : null;
            const status = code === 'not_found' ? 404 : code === 'no_remaining' ? 400 : 409;
            return NextResponse.json({
                error: code === 'already_used' ? 'already_used' : 'no_shields',
                message: code === 'already_used'
                    ? 'Shield already used today'
                    : 'No shields available',
            }, { status });
        }
        if (
            !('remaining' in result)
            || typeof result.remaining !== 'number'
            || !Number.isSafeInteger(result.remaining)
            || result.remaining < 0
        ) {
            throw new Error('Shield RPC returned an invalid remaining count');
        }

        return NextResponse.json({
            success: true,
            remaining: result.remaining,
            usedDate: today,
        });
    } catch (error: unknown) {
        reportError('shop/use-shield', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
