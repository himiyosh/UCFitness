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
        // シールドの残数を確認
        const { data: shield, error: fetchError } = await supabaseAdmin
            .from('user_streak_shields')
            .select('id, remaining_uses, last_used_date')
            .eq('user_id', userId)
            .single();

        if (fetchError || !shield) {
            return NextResponse.json(
                { error: 'no_shields', message: 'No shields available' },
                { status: 404 },
            );
        }

        if (shield.remaining_uses <= 0) {
            return NextResponse.json(
                { error: 'no_shields', message: 'No shields remaining' },
                { status: 400 },
            );
        }

        if (shield.last_used_date === today) {
            return NextResponse.json(
                { error: 'already_used', message: 'Shield already used today' },
                { status: 409 },
            );
        }

        // シールドを使用: 残数を減らし、使用日を記録（アトミックガード付き）
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('user_streak_shields')
            .update({
                remaining_uses: shield.remaining_uses - 1,
                last_used_date: today,
                updated_at: new Date().toISOString(),
            })
            .eq('id', shield.id)
            .eq('user_id', userId)
            .gt('remaining_uses', 0)
            .neq('last_used_date', today)
            .select('remaining_uses')
            .single();

        if (updateError || !updated) {
            // 競合状態で別リクエストに先越された場合
            return NextResponse.json(
                { error: 'shield_unavailable', message: 'Shield is no longer available' },
                { status: 409 },
            );
        }

        return NextResponse.json({
            success: true,
            remaining: updated.remaining_uses,
            usedDate: today,
        });
    } catch (error: unknown) {
        reportError('shop/use-shield', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
