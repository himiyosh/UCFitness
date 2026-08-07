export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { parseTimestampMillis } from '@/lib/date-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
    params: Promise<{ groupId: string }>;
}

/** メッセージ取得の最大件数 */
const MAX_MESSAGES = 50;

/** メッセージの最大文字数 */
const MAX_MESSAGE_LENGTH = 500;

/**
 * GET /api/group/[groupId]/messages
 * グループの最新メッセージを取得（最新50件）
 */
export async function GET(
    request: NextRequest,
    context: RouteParams
): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { groupId } = await context.params;

        if (!isValidUUID(groupId)) {
            return NextResponse.json({ error: 'Invalid group ID format' }, { status: 400 });
        }

        // メンバーシップ確認
        const { data: membership } = await supabaseAdmin
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', session.user.id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // カーソルベースのページネーション（オプション）
        const url = new URL(request.url);
        const before = url.searchParams.get('before');

        let query = supabaseAdmin
            .from('group_messages')
            .select('id, user_id, message, created_at, users(id, name, image, username)')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(MAX_MESSAGES);

        if (before && parseTimestampMillis(before) === null) {
            return NextResponse.json({ error: 'Invalid message cursor' }, { status: 400 });
        }
        if (before) {
            query = query.lt('created_at', before);
        }

        const { data: messages, error } = await query;

        if (error) {
            reportError('group-messages:get', error);
            return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
        }

        // 古い順に並び替えて返す（UIで下から上に表示）
        const sorted = (messages || []).reverse();

        return NextResponse.json({ messages: sorted });
    } catch (error: unknown) {
        reportError('group-messages:get', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * POST /api/group/[groupId]/messages
 * グループにメッセージを投稿
 */
export async function POST(
    request: NextRequest,
    context: RouteParams
): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { groupId } = await context.params;

        if (!isValidUUID(groupId)) {
            return NextResponse.json({ error: 'Invalid group ID format' }, { status: 400 });
        }

        // メンバーシップ確認
        const { data: membership } = await supabaseAdmin
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', session.user.id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const message = typeof body?.message === 'string' ? body.message.trim() : '';

        // バリデーション
        if (!message) {
            return NextResponse.json({ error: 'メッセージが空です' }, { status: 400 });
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            return NextResponse.json(
                { error: `メッセージは${MAX_MESSAGE_LENGTH}文字以内にしてください` },
                { status: 400 }
            );
        }

        // メッセージ挿入
        const { data: newMessage, error } = await supabaseAdmin
            .from('group_messages')
            .insert({
                group_id: groupId,
                user_id: session.user.id,
                message,
            })
            .select('id, user_id, message, created_at, users(id, name, image, username)')
            .single();

        if (error) {
            reportError('group-messages:post', error);
            return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
        }

        return NextResponse.json({ message: newMessage }, { status: 201 });
    } catch (error: unknown) {
        reportError('group-messages:post', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
