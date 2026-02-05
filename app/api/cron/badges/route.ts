import { NextRequest, NextResponse } from 'next/server';
import { assignBadges } from '@/lib/badge-awards';
import { Period } from '@/components/LeaderboardTabs';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes max (Vercel Limit for Pro is higher, but 300 is safe)

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    let type = searchParams.get('type') as Period; // 'DAILY', 'WEEKLY', 'MONTHLY'
    let date = searchParams.get('date'); // 'YYYY-MM-DD'

    if (!type) {
        return new NextResponse('Missing type', { status: 400 });
    }

    // Default Date Logic (JST)
    if (!date) {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        // Helper to get YYYY-MM-DD in JST
        // Note: We need to manipulate the date 'object' to subtract days, then format.
        // Creating a date object from JST string is tricky in server environment.
        // Easier approach: Get UTC time, add 9 hours, manipulate, etc.

        // Robust way:
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstTime = new Date(now.getTime() + jstOffset);

        if (type === 'DAILY') {
            // Yesterday
            jstTime.setUTCDate(jstTime.getUTCDate() - 1);
        } else if (type === 'WEEKLY') {
            // Last Week Start (assuming we run on Monday, last week start was 7 days ago)
            jstTime.setUTCDate(jstTime.getUTCDate() - 7);
        } else if (type === 'MONTHLY') {
            // Last Month Start
            jstTime.setUTCMonth(jstTime.getUTCMonth() - 1);
            jstTime.setUTCDate(1);
        }

        date = jstTime.toISOString().split('T')[0];
    }


    const jobName = `badges-${type}`;
    let logId: number | null = null;

    try {
        // 1. Log Start
        const { data: logEntry, error: logError } = await supabaseAdmin
            .from('cron_logs')
            .insert({
                job_name: jobName,
                status: 'STARTED',
                details: { type, date: date || 'auto' }
            })
            .select()
            .single();

        if (logEntry) logId = logEntry.id;

        await assignBadges(type, date);

        // 2. Log Completion
        if (logId) {
            await supabaseAdmin
                .from('cron_logs')
                .update({
                    status: 'COMPLETED',
                    details: { type, date: date || 'auto', success: true }
                })
                .eq('id', logId);
        }

        return NextResponse.json({ success: true, type, date });
    } catch (error: any) {
        console.error('Badge Cron Error:', error);

        // 3. Log Failure
        if (logId) {
            await supabaseAdmin
                .from('cron_logs')
                .update({
                    status: 'FAILED',
                    details: { error: error.message }
                })
                .eq('id', logId);
        } else {
            // Try to insert failure log if start log failed
            await supabaseAdmin
                .from('cron_logs')
                .insert({
                    job_name: jobName,
                    status: 'FAILED',
                    details: { error: error.message, context: 'Start log failed' }
                });
        }

        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
