import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

import type { Period } from '@/components/dashboard/LeaderboardTabs';

interface RouteParams {
    params: Promise<{
        groupId: string;
    }>;
}

interface ApiKeyData {
    id?: string;
    user_id: string;
    scopes: string[] | null;
    is_admin: boolean | null;
    expires_at?: string | null;
    revoked_at?: string | null;
}

async function sha256Hex(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

async function queryApiKey(column: 'key' | 'key_hash', value: string): Promise<ApiKeyData | null> {
    const fullResult = await supabaseAdmin
        .from('api_keys')
        .select('id, user_id, scopes, is_admin, expires_at, revoked_at')
        .eq(column, value)
        .maybeSingle();

    if (fullResult.data) {
        return fullResult.data as ApiKeyData;
    }

    if (!fullResult.error || column === 'key_hash') {
        return null;
    }

    const legacyResult = await supabaseAdmin
        .from('api_keys')
        .select('id, user_id, scopes, is_admin')
        .eq(column, value)
        .maybeSingle();

    return (legacyResult.data as ApiKeyData | null) ?? null;
}

async function findApiKey(apiKey: string): Promise<ApiKeyData | null> {
    const keyHash = await sha256Hex(apiKey);
    return await queryApiKey('key_hash', keyHash) ?? await queryApiKey('key', apiKey);
}

export async function GET(
    request: NextRequest,
    context: RouteParams
) {
    try {
        const { groupId: idOrKeyword } = await context.params;

        // 1. Authentication Check (Dual Strategy: Scoped API Key OR Session)
        const authHeader = request.headers.get('authorization');
        let userId: string | null = null;
        let isAdmin = false;

        // Support case-insensitive "Bearer" prefix
        const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
        let apiKey: string | null = null;

        if (authHeader && !tokenMatch) {
            // Auth header present but missing "Bearer " prefix — ignore silently
        }

        if (tokenMatch) {
            apiKey = tokenMatch[1].trim();
        }

        if (apiKey) {
            const keyData = await findApiKey(apiKey);

            if (!keyData) {
                return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
            }

            if (keyData.revoked_at || (keyData.expires_at && new Date(keyData.expires_at) <= new Date())) {
                return NextResponse.json({ error: 'Unauthorized: API Key expired or revoked' }, { status: 401 });
            }

            // Check Scope
            if (!keyData.scopes || !keyData.scopes.includes('ranking:read')) {
                return NextResponse.json({ error: 'Forbidden: Insufficient scope' }, { status: 403 });
            }

            if (keyData.id) {
                await supabaseAdmin
                    .from('api_keys')
                    .update({ last_used_at: new Date().toISOString() })
                    .eq('id', keyData.id);
            }

            userId = keyData.user_id;
            isAdmin = keyData.is_admin || false;

        } else {
            // Strategy B: Cookie Session
            const session = await auth();
            if (session?.user?.id) {
                userId = session.user.id;
            }
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Validate Group ID Format (Keyword/Slug validation)
        // Rule: At least 6 chars, max 20 (following username rules), allowed: a-z, A-Z, 0-9, _, -, .
        if (idOrKeyword.length < 6) {
            return NextResponse.json({ error: 'Group ID must be at least 6 characters' }, { status: 400 });
        }
        if (!/^[a-zA-Z0-9_\-\.]+$/.test(idOrKeyword)) {
            return NextResponse.json({ error: 'Group ID contains invalid characters' }, { status: 400 });
        }

        // 3. Resolve Group ID (Keyword -> UUID)
        let targetGroupId = idOrKeyword;

        // Check if input is likely a UUID (36 chars, hex + dashes) to skip keyword lookup if possible,
        // OR just try to find by keyword first.

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrKeyword);

        let groupData: { id: string; is_public: boolean } | null = null;

        if (isUuid) {
            // 🛡️ セキュリティ: .or()テンプレートリテラルの代わりにパラメータ化クエリを使用
            const { data: byKeyword } = await supabaseAdmin
                .from('groups')
                .select('id, is_public')
                .eq('keyword', idOrKeyword)
                .single();

            if (byKeyword) {
                groupData = byKeyword;
            } else {
                const { data: byId } = await supabaseAdmin
                    .from('groups')
                    .select('id, is_public')
                    .eq('id', idOrKeyword)
                    .single();
                groupData = byId;
            }
        } else {
            // If it's not a UUID, it MUST be a keyword (searching ID would cause DB error)
            const { data } = await supabaseAdmin
                .from('groups')
                .select('id, is_public')
                .eq('keyword', idOrKeyword)
                .single();
            groupData = data;
        }

        if (!groupData) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

        targetGroupId = groupData.id;

        // 4. Authorization Check (Group Membership)
        // logic: allowed if (isAdmin) OR (isMember)
        if (!isAdmin) {
            const { data: membership, error: membershipError } = await supabaseAdmin
                .from('group_members')
                .select('id')
                .eq('group_id', targetGroupId)
                .eq('user_id', userId)
                .single();

            if (membershipError || !membership) {
                if (!groupData.is_public) {
                    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
                }
                return NextResponse.json({ error: 'Forbidden: You are not a member of this group' }, { status: 403 });
            }
        }

        // 5. Parse Parameters
        const { searchParams } = new URL(request.url);
        const period = (searchParams.get('period') as Period) || 'WEEKLY';

        // Validate Period
        const validPeriods: Period[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
        if (!validPeriods.includes(period)) {
            return NextResponse.json({ error: 'Invalid period parameter' }, { status: 400 });
        }

        // 6. Fetch Rankings (Inline logic using supabaseAdmin to bypass RLS)
        // Note: getGroupRankings from lib/ranking-service uses 'supabase' (anon) client which fails here.

        // JST Calculation
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const jstDateStr = formatter.format(now);

        let startDate = jstDateStr;

        if (period === 'WEEKLY') {
            const currentDate = new Date(`${jstDateStr}T00:00:00Z`);
            const utcDay = currentDate.getUTCDay();
            const daysToSubtract = (utcDay + 6) % 7;
            const monday = new Date(currentDate);
            monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
            startDate = monday.toISOString().split('T')[0];
        } else if (period === 'MONTHLY') {
            const [y, m] = jstDateStr.split('-');
            startDate = `${y}-${m}-01`;
        } else if (period === 'YEARLY') {
            const y = jstDateStr.split('-')[0];
            startDate = `${y}-01-01`;
        }

        // Fetch Members
        const { data: groupMembers, error: memberError } = await supabaseAdmin
            .from('group_members')
            .select('user_id')
            .eq('group_id', targetGroupId);

        if (memberError || !groupMembers) {
            reportError('group/ranking:fetchMembers', memberError, { groupId: targetGroupId });
            return NextResponse.json({ error: 'Error fetching group data' }, { status: 500 });
        }

        const memberUserIds = groupMembers.map(m => m.user_id);

        if (memberUserIds.length === 0) {
            return NextResponse.json([]);
        }

        // Fetch Steps
        const { data: rawSteps, error: stepsError } = await supabaseAdmin
            .from('daily_steps')
            .select(`
                steps,
                date,
                users!inner (
                    id,
                    name,
                    image,
                    username
                )
            `)
            .in('user_id', memberUserIds)
            .gte('date', startDate);

        if (stepsError) {
            reportError('group/ranking:fetchSteps', stepsError, { groupId: targetGroupId });
            return NextResponse.json({ error: 'Error fetching rankings' }, { status: 500 });
        }

        // Aggregate
        interface UserStepRow {
            steps: number;
            users: { id: string; name: string; image: string; username: string };
        }
        const userMap = new Map<string, { steps: number; users: UserStepRow['users'] }>();
        // Supabase の型推論は users を配列として返すが、!inner指定の多対一リレーションでは単一オブジェクト
        (rawSteps as unknown as UserStepRow[] | null)?.forEach((row) => {
            const uid = row.users.id;
            if (!userMap.has(uid)) {
                userMap.set(uid, {
                    steps: 0,
                    users: row.users
                });
            }
            const entry = userMap.get(uid)!;
            entry.steps += Number(row.steps);
        });

        const rankings = Array.from(userMap.values())
            .sort((a, b) => b.steps - a.steps)
            .map((item, index) => ({
                rank: index + 1,
                steps: item.steps,
                user: {
                    id: item.users.id,
                    name: item.users.name,
                    image: item.users.image,
                    username: item.users.username
                }
            }));

        return NextResponse.json(rankings);

    } catch (error: unknown) {
        reportError('group/ranking', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
