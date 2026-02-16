export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// ギアアイテム（ASIN）へのリアクションAPI
// group_reactions テーブルを再利用: to_user_id に ASIN を格納、period='GEAR'

interface RouteParams {
    params: Promise<{ groupId: string }>;
}

const VALID_EMOJIS = [
    '👏', '🔥', '💪', '👍',
    '😊', '😂', '🤣', '😍', '🥳', '😎', '🤩', '🥺',
    '🙌', '✌️', '🤝', '🫡',
    '❤️', '💯', '⭐', '🏆', '🎉', '🎊', '💎', '👑',
    '🏃', '🚀', '⚡', '💨', '🏅', '🥇', '🥈', '🥉',
] as const;
const GEAR_PERIOD = 'GEAR';

// GET: グループ内ギアリアクション一覧を取得
export async function GET(
    request: NextRequest,
    context: RouteParams
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { groupId } = await context.params;

        // メンバーシップ確認
        const { data: membership } = await supabaseAdmin
            .from('group_members')
            .select('user_id')
            .eq('group_id', groupId)
            .eq('user_id', session.user.id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // ギアリアクション取得（period='GEAR'）
        const { data: reactions, error } = await supabaseAdmin
            .from('group_reactions')
            .select('id, from_user_id, to_user_id, emoji, period')
            .eq('group_id', groupId)
            .eq('period', GEAR_PERIOD);

        if (error) {
            reportError('group/gear-reactions:list', error, { groupId });
            return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
        }

        return NextResponse.json({ reactions: reactions || [] });
    } catch (err) {
        reportError('group/gear-reactions:list', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// POST: ギアリアクションを追加
export async function POST(
    request: NextRequest,
    context: RouteParams
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { groupId } = await context.params;
        const body = await request.json();
        const { toUserId: asin, emoji } = body;

        // バリデーション
        if (!asin || typeof asin !== 'string') {
            return NextResponse.json({ error: 'ASIN is required' }, { status: 400 });
        }
        if (!VALID_EMOJIS.includes(emoji)) {
            return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
        }

        // メンバーシップ確認（送信者のみ）
        const { data: membership } = await supabaseAdmin
            .from('group_members')
            .select('user_id')
            .eq('group_id', groupId)
            .eq('user_id', session.user.id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Must be a group member' }, { status: 403 });
        }

        // リアクション挿入（to_user_id にASINを格納）
        const { data: reaction, error } = await supabaseAdmin
            .from('group_reactions')
            .upsert({
                group_id: groupId,
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
            reportError('group/gear-reactions:create', error, { groupId });
            return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
        }

        return NextResponse.json({ reaction }, { status: 201 });
    } catch (err) {
        reportError('group/gear-reactions:create', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// DELETE: ギアリアクションを削除
export async function DELETE(
    request: NextRequest,
    context: RouteParams
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { groupId } = await context.params;
        const { searchParams } = new URL(request.url);
        const asin = searchParams.get('toUserId');
        const emoji = searchParams.get('emoji');

        if (!asin || !emoji) {
            return NextResponse.json({ error: 'ASIN and emoji are required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('group_reactions')
            .delete()
            .eq('group_id', groupId)
            .eq('from_user_id', session.user.id)
            .eq('to_user_id', asin)
            .eq('emoji', emoji)
            .eq('period', GEAR_PERIOD);

        if (error) {
            reportError('group/gear-reactions:delete', error, { groupId });
            return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError('group/gear-reactions:delete', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
