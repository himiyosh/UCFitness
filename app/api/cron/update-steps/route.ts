import { NextResponse } from 'next/server';
import { updateAllUserSteps } from '@/lib/step-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
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
