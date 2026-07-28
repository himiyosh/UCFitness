export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { parseTimestampMillis } from '@/lib/date-utils';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const GROUP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface InviteRpcResult {
    status: string;
    expiresAt?: string;
    groupId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseRpcResult(data: unknown): InviteRpcResult | null {
    const value = Array.isArray(data) ? data[0] : data;
    if (!isRecord(value) || typeof value.status !== 'string') return null;
    return {
        status: value.status,
        expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : undefined,
        groupId: typeof value.groupId === 'string' ? value.groupId : undefined,
    };
}

function createToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function hashToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function json(body: Record<string, unknown>, status = 200): NextResponse {
    return NextResponse.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store, private' },
    });
}

export async function POST(request: Request): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user?.id) return json({ code: 'AUTH_REQUIRED' }, 401);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ code: 'INVALID_REQUEST' }, 400);
    }
    if (!isRecord(body) || typeof body.action !== 'string') {
        return json({ code: 'INVALID_REQUEST' }, 400);
    }

    const userId = session.user.id;
    if (body.action === 'create') {
        if (typeof body.groupId !== 'string' || !GROUP_ID_PATTERN.test(body.groupId)) {
            return json({ code: 'INVALID_REQUEST' }, 400);
        }
        const token = createToken();
        const { data, error } = await supabaseAdmin.rpc('create_group_invite', {
            p_group_id: body.groupId,
            p_created_by: userId,
            p_token_hash: await hashToken(token),
        });
        if (error) {
            reportError('group/invite:create', error, { userId, groupId: body.groupId });
            return json({ code: 'INVITE_CREATE_FAILED' }, 500);
        }
        const result = parseRpcResult(data);
        if (result?.status === 'forbidden') return json({ code: 'FORBIDDEN' }, 403);
        if (result?.status === 'rate_limited') return json({ code: 'INVITE_LIMIT_REACHED' }, 429);
        if (
            result?.status !== 'created'
            || !result.expiresAt
            || parseTimestampMillis(result.expiresAt) === null
        ) {
            return json({ code: 'INVITE_CREATE_FAILED' }, 500);
        }
        return json({ token, expiresAt: result.expiresAt });
    }

    if (body.action === 'join') {
        if (typeof body.token !== 'string' || !TOKEN_PATTERN.test(body.token)) {
            return json({ code: 'INVITE_UNAVAILABLE' }, 404);
        }
        const { data, error } = await supabaseAdmin.rpc('join_group_with_invite', {
            p_token_hash: await hashToken(body.token),
            p_user_id: userId,
        });
        if (error) {
            reportError('group/invite:join', error, { userId });
            return json({ code: 'INVITE_JOIN_FAILED' }, 500);
        }
        const result = parseRpcResult(data);
        if (result?.status === 'expired') return json({ code: 'INVITE_EXPIRED' }, 410);
        if (result?.status === 'invalid') return json({ code: 'INVITE_UNAVAILABLE' }, 404);
        if (
            (result?.status === 'joined' || result?.status === 'already_member')
            && result.groupId
        ) {
            return json({
                groupId: result.groupId,
                alreadyMember: result.status === 'already_member',
            });
        }
        return json({ code: 'INVITE_JOIN_FAILED' }, 500);
    }

    return json({ code: 'INVALID_REQUEST' }, 400);
}
