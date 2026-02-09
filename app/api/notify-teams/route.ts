import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTeamsNotification } from '@/lib/teams';

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
          email,
          username
        )
      `)
            .eq('date', today)
            .order('steps', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (rankings && rankings.length > 0) {
            await sendTeamsNotification(rankings);
        } else {
            console.log("No rankings found to send.");
        }

        return NextResponse.json({ message: 'Teams notification sent (if data existed)' });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
