export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// UUID形式バリデーション（IDOR攻撃防止）
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
    params: Promise<{ groupId: string }>;
}

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

// GET: グループ内リアクション一覧を取得
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
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'DAILY';

        if (!VALID_PERIODS.includes(period as typeof VALID_PERIODS[number])) {
            return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
        }

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

        // リアクション取得
        const { data: reactions, error } = await supabaseAdmin
            .from('group_reactions')
            .select('id, from_user_id, to_user_id, emoji, period')
            .eq('group_id', groupId)
            .eq('period', period);

        if (error) {
            reportError('group/reactions:list', error, { groupId });
            return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
        }

        return NextResponse.json({ reactions: reactions || [] });
    } catch (err) {
        reportError('group/reactions:list', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// POST: リアクションを追加
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

        // UUIDバリデーション
        if (!UUID_REGEX.test(groupId)) {
            return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 });
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

        // メンバーシップ確認（送信者 + 受信者の両方がグループメンバーであること）
        // セルフリアクション（from === to）の場合は1件でOK
        const isSelfReaction = toUserId === session.user.id;
        const userIdsToCheck = isSelfReaction
            ? [session.user.id]
            : [session.user.id, toUserId];
        const { data: members } = await supabaseAdmin
            .from('group_members')
            .select('user_id')
            .eq('group_id', groupId)
            .in('user_id', userIdsToCheck);

        const requiredCount = isSelfReaction ? 1 : 2;
        if (!members || members.length < requiredCount) {
            return NextResponse.json({ error: 'Both users must be group members' }, { status: 403 });
        }

        // リアクション挿入（重複は UNIQUE 制約で弾く）
        const { data: reaction, error } = await supabaseAdmin
            .from('group_reactions')
            .upsert({
                group_id: groupId,
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
            reportError('group/reactions:create', error, { groupId });
            return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
        }

        return NextResponse.json({ reaction }, { status: 201 });
    } catch (err) {
        reportError('group/reactions:create', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// DELETE: リアクションを削除
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

        // UUIDバリデーション
        if (!UUID_REGEX.test(groupId)) {
            return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const toUserId = searchParams.get('toUserId');
        const emoji = searchParams.get('emoji');
        const period = searchParams.get('period');

        if (!toUserId || !emoji || !period) {
            return NextResponse.json({ error: 'toUserId, emoji, period are required' }, { status: 400 });
        }

        // toUserId UUID バリデーション
        if (!UUID_REGEX.test(toUserId)) {
            return NextResponse.json({ error: 'Invalid toUserId' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('group_reactions')
            .delete()
            .eq('group_id', groupId)
            .eq('from_user_id', session.user.id)
            .eq('to_user_id', toUserId)
            .eq('emoji', emoji)
            .eq('period', period);

        if (error) {
            reportError('group/reactions:delete', error, { groupId });
            return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError('group/reactions:delete', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
