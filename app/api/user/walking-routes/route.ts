export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** コース名の最大文字数 */
const MAX_NAME_LENGTH = 100;
/** 説明の最大文字数 */
const MAX_DESCRIPTION_LENGTH = 500;
/** 1ユーザーあたりの最大コース数 */
const MAX_ROUTES_PER_USER = 50;

type Difficulty = 'easy' | 'normal' | 'hard';
const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function parseOptionalNonnegativeNumber(
    value: unknown,
    requireInteger: boolean,
): number | null | undefined {
    if (value === null || value === undefined) return null;
    if (
        typeof value !== 'number'
        || !Number.isFinite(value)
        || value < 0
        || (requireInteger && !Number.isSafeInteger(value))
    ) {
        return undefined;
    }
    return value;
}

/**
 * GET /api/user/walking-routes
 * 自分のウォーキングコース一覧を取得
 */
export async function GET(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: routes, error } = await supabaseAdmin
            .from('walking_routes')
            .select('id, name, description, distance_km, duration_minutes, difficulty, is_favorite, walk_count, last_walked_at, created_at')
            .eq('user_id', session.user.id)
            .order('is_favorite', { ascending: false })
            .order('updated_at', { ascending: false });

        if (error) {
            reportError('walking-routes:get', error);
            return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
        }

        return NextResponse.json({ routes: routes || [] });
    } catch (error: unknown) {
        reportError('walking-routes:get', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * POST /api/user/walking-routes
 * 新しいウォーキングコースを作成
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const description = typeof body?.description === 'string' ? body.description.trim() : '';
        const distanceKm = parseOptionalNonnegativeNumber(body?.distance_km, false);
        const durationMinutes = parseOptionalNonnegativeNumber(body?.duration_minutes, true);
        const difficulty: Difficulty = VALID_DIFFICULTIES.includes(body?.difficulty) ? body.difficulty : 'normal';

        // バリデーション
        if (!name) {
            return NextResponse.json({ error: 'コース名は必須です' }, { status: 400 });
        }
        if (name.length > MAX_NAME_LENGTH) {
            return NextResponse.json({ error: `コース名は${MAX_NAME_LENGTH}文字以内にしてください` }, { status: 400 });
        }
        if (description.length > MAX_DESCRIPTION_LENGTH) {
            return NextResponse.json({ error: `説明は${MAX_DESCRIPTION_LENGTH}文字以内にしてください` }, { status: 400 });
        }
        if (distanceKm === undefined) {
            return NextResponse.json({ error: 'Invalid distance_km' }, { status: 400 });
        }
        if (durationMinutes === undefined) {
            return NextResponse.json({ error: 'Invalid duration_minutes' }, { status: 400 });
        }

        // コース数の上限チェック
        const { count, error: countError } = await supabaseAdmin
            .from('walking_routes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', session.user.id);

        if (countError) {
            reportError('walking-routes:count', countError);
            return NextResponse.json({ error: 'Failed to check route count' }, { status: 500 });
        }

        if ((count ?? 0) >= MAX_ROUTES_PER_USER) {
            return NextResponse.json(
                { error: `コースは最大${MAX_ROUTES_PER_USER}件まで登録できます` },
                { status: 400 }
            );
        }

        const { data: newRoute, error } = await supabaseAdmin
            .from('walking_routes')
            .insert({
                user_id: session.user.id,
                name,
                description,
                distance_km: distanceKm,
                duration_minutes: durationMinutes,
                difficulty,
            })
            .select('id, name, description, distance_km, duration_minutes, difficulty, is_favorite, walk_count, last_walked_at, created_at')
            .single();

        if (error) {
            reportError('walking-routes:post', error);
            return NextResponse.json({ error: 'Failed to create route' }, { status: 500 });
        }

        return NextResponse.json({ route: newRoute }, { status: 201 });
    } catch (error: unknown) {
        reportError('walking-routes:post', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
