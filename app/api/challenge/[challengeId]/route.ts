export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// ============================================
// チャレンジ詳細取得 API
// ============================================

/** GET: チャレンジ詳細と参加者一覧を取得 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { challengeId } = await params;

        // UUID形式バリデーション
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)) {
            return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 });
        }

        const { data: challenge, error } = await supabaseAdmin
            .from('challenges')
            .select(`
                *,
                creator:created_by(username, name, image),
                challenge_participants(
                    user_id,
                    progress_steps,
                    is_completed,
                    completed_at,
                    joined_at,
                    user:user_id(username, name, image)
                )
            `)
            .eq('id', challengeId)
            .single();

        if (error || !challenge) {
            return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
        }

        return NextResponse.json({ challenge });
    } catch (err) {
        reportError('challenge:detail:unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
