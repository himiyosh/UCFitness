import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // 🛡️ Sentinel: Security Check
    // Allow access only if:
    // 1. We are in development mode
    // 2. OR a valid CRON_SECRET is provided (admin/system access)

    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    // 🛡️ セキュリティ: dev モードバイパスを削除（本番で NODE_ENV 設定ミス時の情報漏洩防止）
    const isAuthorized = (cronSecret && authHeader === `Bearer ${cronSecret}`);

    if (!isAuthorized) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const results: any = {
        env: {
            url_configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            key_configured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        }
    };

    // Check Users Table
    try {
        const { data, error } = await supabaseAdmin.from('users').select('count', { count: 'exact', head: true });
        results.users_table = { ok: !error, error: error ? 'Query failed' : null };
    } catch (e: any) {
        results.users_table = { ok: false, error: 'Query failed' };
    }

    // Check Daily Steps Table
    try {
        const { data, error } = await supabaseAdmin.from('daily_steps').select('count', { count: 'exact', head: true });
        results.daily_steps_table = { ok: !error, error: error ? 'Query failed' : null };
    } catch (e: any) {
        results.daily_steps_table = { ok: false, error: 'Query failed' };
    }

    return NextResponse.json(results);
}

export const runtime = 'edge';
