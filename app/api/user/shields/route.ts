export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// ストリークシールドの残数を取得
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('user_streak_shields')
            .select('remaining_uses, last_used_date')
            .eq('user_id', session.user.id)
            .single();

        if (error || !data) {
            // シールドレコードが無い場合は0として返す
            return NextResponse.json({ remaining: 0, lastUsedDate: null });
        }

        return NextResponse.json({
            remaining: data.remaining_uses,
            lastUsedDate: data.last_used_date,
        });
    } catch (error: unknown) {
        reportError('user/shields', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
