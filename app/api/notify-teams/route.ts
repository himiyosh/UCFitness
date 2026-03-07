import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTeamsNotification } from '@/lib/api/teams';
import { reportError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 🛡️ Sentinel: Security Check
    // Fail securely if CRON_SECRET is not configured or if the header is missing/incorrect
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const today = new Date().toISOString().split('T')[0];

        // Fetch rankings
        // 🛡️ Sentinel: Use supabaseAdmin to bypass RLS for cron job
        const { data: rankings, error } = await supabaseAdmin
            .from('daily_steps')
            .select(`
        steps,
        users (
          name,
          username
        )
      `)
            .eq('date', today)
            .order('steps', { ascending: false });

        if (error) {
            reportError('notify-teams:fetch', error);
            return NextResponse.json({ error: 'Failed to fetch rankings' }, { status: 500 });
        }

        if (rankings && rankings.length > 0) {
            // Supabase の型推論は users を配列として返すが、多対一リレーションでは単一オブジェクト
            await sendTeamsNotification(rankings as unknown as Parameters<typeof sendTeamsNotification>[0]);
        } else {
            // No rankings found to send.
        }

        return NextResponse.json({ message: 'Teams notification sent (if data existed)' });
    } catch (error: unknown) {
        reportError('notify-teams', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
