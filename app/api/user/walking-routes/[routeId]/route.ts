export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { isValidUUID } from '@/lib/validation';

export const dynamic = 'force-dynamic';

interface RouteParams {
    params: Promise<{ routeId: string }>;
}

/**
 * PATCH /api/user/walking-routes/[routeId]
 * コースの更新（お気に入り切替、歩いた記録など）
 */
export async function PATCH(
    request: NextRequest,
    context: RouteParams
): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { routeId } = await context.params;

        if (!isValidUUID(routeId)) {
            return NextResponse.json({ error: 'Invalid route ID format' }, { status: 400 });
        }

        // 所有権確認
        const { data: existing } = await supabaseAdmin
            .from('walking_routes')
            .select('id, walk_count')
            .eq('id', routeId)
            .eq('user_id', session.user.id)
            .single();

        if (!existing) {
            return NextResponse.json({ error: 'Route not found' }, { status: 404 });
        }

        const body = await request.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };

        // お気に入り切替
        if (typeof body?.is_favorite === 'boolean') {
            updates.is_favorite = body.is_favorite;
        }

        // 「歩いた」記録
        if (body?.log_walk === true) {
            updates.walk_count = (existing.walk_count || 0) + 1;
            updates.last_walked_at = new Date().toISOString();
        }

        // 名前更新
        if (typeof body?.name === 'string' && body.name.trim()) {
            updates.name = body.name.trim().slice(0, 100);
        }

        // 説明更新
        if (typeof body?.description === 'string') {
            updates.description = body.description.trim().slice(0, 500);
        }

        const { data: updated, error } = await supabaseAdmin
            .from('walking_routes')
            .update(updates)
            .eq('id', routeId)
            .eq('user_id', session.user.id)
            .select('id, name, description, distance_km, duration_minutes, difficulty, is_favorite, walk_count, last_walked_at, created_at')
            .single();

        if (error) {
            reportError('walking-routes:patch', error);
            return NextResponse.json({ error: 'Failed to update route' }, { status: 500 });
        }

        return NextResponse.json({ route: updated });
    } catch (error: unknown) {
        reportError('walking-routes:patch', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * DELETE /api/user/walking-routes/[routeId]
 * コースの削除
 */
export async function DELETE(
    _request: NextRequest,
    context: RouteParams
): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { routeId } = await context.params;

        if (!isValidUUID(routeId)) {
            return NextResponse.json({ error: 'Invalid route ID format' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('walking_routes')
            .delete()
            .eq('id', routeId)
            .eq('user_id', session.user.id);

        if (error) {
            reportError('walking-routes:delete', error);
            return NextResponse.json({ error: 'Failed to delete route' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        reportError('walking-routes:delete', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
