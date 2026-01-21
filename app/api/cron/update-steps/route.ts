import { NextResponse } from 'next/server';
import { updateAllUserSteps } from '@/lib/step-manager';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Fail securely if CRON_SECRET is not configured or if the header is missing/incorrect
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        console.log('Starting manual step update...');
        await updateAllUserSteps();
        return NextResponse.json({ message: 'Steps updated successfully' });
    } catch (error) {
        console.error('Error updating steps:', error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
