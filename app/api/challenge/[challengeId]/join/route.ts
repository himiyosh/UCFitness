export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getJSTDateString } from '@/lib/date-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// ============================================
// チャレンジ参加 API
// ============================================

/** POST: チャレンジに参加 */
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { challengeId } = await params;
        const userId = session.user.id;

        // チャレンジの存在確認と日付チェック
        const { data: challenge, error: challengeError } = await supabaseAdmin
            .from('challenges')
            .select('id, start_date, end_date, is_active')
            .eq('id', challengeId)
            .single();

        if (challengeError || !challenge) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }

        if (!challenge.is_active) {
            return NextResponse.json({ error: 'Challenge is no longer active' }, { status: 400 });
        }

        const today = getJSTDateString();
        if (today > challenge.end_date) {
            return NextResponse.json({ error: 'Challenge has ended' }, { status: 400 });
        }

        // 既に参加済みかチェック
        const { data: existing } = await supabaseAdmin
            .from('challenge_participants')
            .select('id')
            .eq('challenge_id', challengeId)
            .eq('user_id', userId)
            .single();

        if (existing) {
            return NextResponse.json({ error: 'Already joined' }, { status: 409 });
        }

        // 参加登録
        const { error: joinError } = await supabaseAdmin
            .from('challenge_participants')
            .insert({
                challenge_id: challengeId,
                user_id: userId,
            });

        if (joinError) {
            reportError('challenge:join', joinError, { userId, challengeId });
            return NextResponse.json({ error: 'Failed to join challenge' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError('challenge:join:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
