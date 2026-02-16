export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// グローバルギアリアクションAPI（ダッシュボード用）
// group_reactions テーブルを再利用: group_id='__global__', to_user_id=ASIN, period='GEAR'

const VALID_EMOJIS = [
    '👏', '🔥', '💪', '👍',
    '😊', '😂', '🤣', '😍', '🥳', '😎', '🤩', '🥺',
    '🙌', '✌️', '🤝', '🫡',
    '❤️', '💯', '⭐', '🏆', '🎉', '🎊', '💎', '👑',
    '🏃', '🚀', '⚡', '💨', '🏅', '🥇', '🥈', '🥉',
] as const;
const GLOBAL_GROUP = '__global__';
const GEAR_PERIOD = 'GEAR';

// GET: グローバルギアリアクション一覧を取得
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: reactions, error } = await supabaseAdmin
            .from('group_reactions')
            .select('id, from_user_id, to_user_id, emoji, period')
            .eq('group_id', GLOBAL_GROUP)
            .eq('period', GEAR_PERIOD);

        if (error) {
            reportError('gear-reactions:list', error);
            return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
        }

        return NextResponse.json({ reactions: reactions || [] });
    } catch (err) {
        reportError('gear-reactions:list', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// POST: ギアリアクションを追加
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { toUserId: asin, emoji } = body;

        if (!asin || typeof asin !== 'string') {
            return NextResponse.json({ error: 'ASIN is required' }, { status: 400 });
        }
        if (!VALID_EMOJIS.includes(emoji)) {
            return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
        }

        const { data: reaction, error } = await supabaseAdmin
            .from('group_reactions')
            .upsert({
                group_id: GLOBAL_GROUP,
                from_user_id: session.user.id,
                to_user_id: asin,
                emoji,
                period: GEAR_PERIOD,
            }, {
                onConflict: 'group_id,from_user_id,to_user_id,emoji,period',
            })
            .select('id, from_user_id, to_user_id, emoji, period')
            .single();

        if (error) {
            reportError('gear-reactions:create', error);
            return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
        }

        return NextResponse.json({ reaction }, { status: 201 });
    } catch (err) {
        reportError('gear-reactions:create', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// DELETE: ギアリアクションを削除
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const asin = searchParams.get('toUserId');
        const emoji = searchParams.get('emoji');

        if (!asin || !emoji) {
            return NextResponse.json({ error: 'ASIN and emoji are required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('group_reactions')
            .delete()
            .eq('group_id', GLOBAL_GROUP)
            .eq('from_user_id', session.user.id)
            .eq('to_user_id', asin)
            .eq('emoji', emoji)
            .eq('period', GEAR_PERIOD);

        if (error) {
            reportError('gear-reactions:delete', error);
            return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError('gear-reactions:delete', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
