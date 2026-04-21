export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { isValidUUID } from '@/lib/validation';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// UUID形式バリデーション（IDOR攻撃防止）
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// グローバルリーダーボード用リアクションAPI
// group_reactions テーブルを group_id='__global__' で再利用

const VALID_EMOJIS = [
    // デフォルト
    '👏', '🔥', '💪', '👍',
    // 拡張: 表情
    '😊', '😂', '🤣', '😍', '🥳', '😎', '🤩', '🥺',
    // 拡張: ジェスチャー
    '🙌', '✌️', '🤝', '🫡',
    // 拡張: シンボル
    '❤️', '💯', '⭐', '🏆', '🎉', '🎊', '💎', '👑',
    // 拡張: スポーツ・アクション
    '🏃', '🚀', '⚡', '💨', '🏅', '🥇', '🥈', '🥉',
] as const;
const VALID_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
const GLOBAL_GROUP_ID = '__global__';

// GET: グローバルリアクション一覧を取得
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'DAILY';

        if (!VALID_PERIODS.includes(period as typeof VALID_PERIODS[number])) {
            return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
        }

        const { data: reactions, error } = await supabaseAdmin
            .from('group_reactions')
            .select('id, from_user_id, to_user_id, emoji, period')
            .eq('group_id', GLOBAL_GROUP_ID)
            .eq('period', period);

        if (error) {
            reportError('reactions/global:list', error);
            return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
        }

        return NextResponse.json({ reactions: reactions || [] });
    } catch (err) {
        reportError('reactions/global:list', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// POST: グローバルリアクションを追加
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { toUserId, emoji, period } = body;

        // バリデーション
        if (!toUserId || typeof toUserId !== 'string' || !UUID_REGEX.test(toUserId)) {
            return NextResponse.json({ error: 'toUserId is required' }, { status: 400 });
        }
        if (!VALID_EMOJIS.includes(emoji)) {
            return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
        }
        if (!VALID_PERIODS.includes(period)) {
            return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
        }

        // グローバルはメンバーシップ不要 — 認証済みユーザーなら誰でもリアクション可能（セルフリアクションも許可）
        const { data: reaction, error } = await supabaseAdmin
            .from('group_reactions')
            .upsert({
                group_id: GLOBAL_GROUP_ID,
                from_user_id: session.user.id,
                to_user_id: toUserId,
                emoji,
                period,
            }, {
                onConflict: 'group_id,from_user_id,to_user_id,emoji,period',
            })
            .select('id, from_user_id, to_user_id, emoji, period')
            .single();

        if (error) {
            reportError('reactions/global:create', error);
            return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
        }

        return NextResponse.json({ reaction }, { status: 201 });
    } catch (err) {
        reportError('reactions/global:create', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// DELETE: グローバルリアクションを削除
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const toUserId = searchParams.get('toUserId');
        const emoji = searchParams.get('emoji');
        const period = searchParams.get('period');

        if (!toUserId || !emoji || !period || !isValidUUID(toUserId)) {
            return NextResponse.json({ error: 'toUserId, emoji, period are required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('group_reactions')
            .delete()
            .eq('group_id', GLOBAL_GROUP_ID)
            .eq('from_user_id', session.user.id)
            .eq('to_user_id', toUserId)
            .eq('emoji', emoji)
            .eq('period', period);

        if (error) {
            reportError('reactions/global:delete', error);
            return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError('reactions/global:delete', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
