export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { NextResponse } from 'next/server';

// ============================================
// POST /api/user/feed/read
// フィードの既読タイムスタンプを更新する
// ベルアイコンのポップオーバーを開いた時にクライアントから呼ばれる
// ============================================

export async function POST(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const now = new Date().toISOString();

        const { error } = await supabaseAdmin
            .from('users')
            .update({ feed_last_read_at: now })
            .eq('id', userId);

        if (error) {
            reportError('user/feed/read', error, { userId });
            return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
        }

        return NextResponse.json({ success: true, readAt: now });
    } catch (err) {
        reportError('user/feed/read', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
