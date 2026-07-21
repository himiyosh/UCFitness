export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { authorizeChallengeGroup } from '@/lib/services/challenge-access';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

// ============================================
// チャレンジ離脱 API
// ============================================

/** DELETE: チャレンジから離脱 */
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { challengeId } = await params;
        const userId = session.user.id;

        // UUID形式バリデーション
        if (!isValidUUID(challengeId)) {
            return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 });
        }

        // チャレンジの存在確認
        const { data: challenge, error: challengeError } = await supabaseAdmin
            .from('challenges')
            .select('id, type, group_id, created_by')
            .eq('id', challengeId)
            .maybeSingle();

        if (challengeError) {
            reportError('challenge:leave:fetch', challengeError, { userId, challengeId });
            return NextResponse.json({ error: 'Failed to fetch challenge' }, { status: 500 });
        }
        if (!challenge) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }
        const access = await authorizeChallengeGroup(challenge, userId, 'participate', 'challenge:leave');
        if (!access.allowed) {
            return NextResponse.json({
                error: access.status === 500 ? 'Failed to authorize challenge leave'
                    : access.status === 404 ? 'Challenge not found' : 'Forbidden',
            }, { status: access.status });
        }

        // 作成者は離脱不可
        if (challenge.created_by === userId) {
            return NextResponse.json({ error: 'Creator cannot leave their own challenge' }, { status: 400 });
        }

        // 参加しているかチェック
        const { data: existing, error: existingError } = await supabaseAdmin
            .from('challenge_participants')
            .select('id')
            .eq('challenge_id', challengeId)
            .eq('user_id', userId)
            .maybeSingle();
        if (existingError) {
            reportError('challenge:leave:existing', existingError, { userId, challengeId });
            return NextResponse.json({ error: 'Failed to check challenge participation' }, { status: 500 });
        }

        if (!existing) {
            return NextResponse.json({ error: 'Not participating' }, { status: 404 });
        }

        // 離脱
        const { error: leaveError } = await supabaseAdmin
            .from('challenge_participants')
            .delete()
            .eq('challenge_id', challengeId)
            .eq('user_id', userId);

        if (leaveError) {
            reportError('challenge:leave', leaveError, { userId, challengeId });
            return NextResponse.json({ error: 'Failed to leave challenge' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError('challenge:leave:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
