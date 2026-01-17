import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTeamsNotification } from '@/lib/teams';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Fetch rankings
        const { data: rankings, error } = await supabase
            .from('daily_steps')
            .select(`
        steps,
        users (
          name,
          email
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
