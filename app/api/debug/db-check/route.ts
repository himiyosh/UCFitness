import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    const results: any = {
        env: {
            url_configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            key_configured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        }
    };

    // Check Users Table
    try {
        const { data, error } = await supabaseAdmin.from('users').select('count', { count: 'exact', head: true });
        results.users_table = { ok: !error, error: error?.message || null };
    } catch (e: any) {
        results.users_table = { ok: false, error: e.message };
    }

    // Check Daily Steps Table
    try {
        const { data, error } = await supabaseAdmin.from('daily_steps').select('count', { count: 'exact', head: true });
        results.daily_steps_table = { ok: !error, error: error?.message || null };
    } catch (e: any) {
        results.daily_steps_table = { ok: false, error: e.message };
    }

    return NextResponse.json(results);
}

export const runtime = 'edge';
