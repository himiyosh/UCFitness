import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { getGroupRankings } from '@/lib/ranking-service';
import { Period } from '@/components/LeaderboardTabs';

interface RouteParams {
    params: Promise<{
        groupId: string;
    }>;
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

        if (authHeader) console.log(`[API] Auth Header: '${authHeader}'`);

        // Support case-insensitive "Bearer" prefix
        const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
        let apiKey: string | null = null;

        if (authHeader && !tokenMatch) {
            console.warn('[API] Auth header missing "Bearer " prefix');
        }

        if (tokenMatch) {
            apiKey = tokenMatch[1].trim();
        }

        if (apiKey) {
            console.log(`[API] Key lookup for: ${apiKey.substring(0, 10)}...`);

            // Use supabaseAdmin to bypass RLS for API Key lookup
            const { data: keyData, error: keyError } = await supabaseAdmin
                .from('api_keys')
                .select('user_id, scopes, is_admin')
                .eq('key', apiKey)
                .single();

            if (keyError || !keyData) {
                console.error('[API] Key lookup failed:', keyError);
                return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
            }
            console.log(`[API] Key valid. User: ${keyData.user_id}, Admin: ${keyData.is_admin}`);

            // Check Scope
            if (!keyData.scopes || !keyData.scopes.includes('ranking:read')) {
                console.error('[API] Insufficient Scope:', keyData.scopes);
                return NextResponse.json({ error: 'Forbidden: Insufficient Scope (Required: ranking:read)' }, { status: 403 });
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

        let query = supabaseAdmin
            .from('groups')
            .select('id');

        if (isUuid) {
            // If it looks like a UUID, it could be either ID or Keyword
            query = query.or(`keyword.eq.${idOrKeyword},id.eq.${idOrKeyword}`);
        } else {
            // If it's not a UUID, it MUST be a keyword (searching ID would cause DB error)
            query = query.eq('keyword', idOrKeyword);
        }

        const { data: groupData, error: groupError } = await query.single();

        if (groupError || !groupData) {
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
                console.warn(`[API] User ${userId} attempted to access rankings for group ${idOrKeyword} without membership.`);
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
            console.error('[API] Error fetching group members:', memberError);
            return NextResponse.json({ error: 'Error fetching group members' }, { status: 500 });
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
                    email,
                    username
                )
            `)
            .in('user_id', memberUserIds)
            .gte('date', startDate);

        if (stepsError) {
            console.error(`[API] Error fetching group rankings for ${targetGroupId}:`, stepsError);
            return NextResponse.json({ error: 'Error fetching rankings' }, { status: 500 });
        }

        // Aggregate
        const userMap = new Map<string, any>();
        rawSteps?.forEach((row: any) => {
            const email = row.users.email;
            if (!userMap.has(email)) {
                userMap.set(email, {
                    steps: 0,
                    users: row.users
                });
            }
            const entry = userMap.get(email);
            entry.steps += Number(row.steps);
        });

        const rankings = Array.from(userMap.values())
            .sort((a, b) => b.steps - a.steps)
            .map((item: any, index: number) => ({
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

    } catch (error) {
        console.error('[API] Error fetching group rankings:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
