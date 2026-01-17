import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { updateUserSteps } from '@/lib/step-manager';

export const dynamic = 'force-dynamic';

export async function POST() {
    const session = await auth();

    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;

    if (!userId) {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    try {
        const steps = await updateUserSteps(userId);
        return NextResponse.json({ success: true, steps });
    } catch (error) {
        console.error('Error syncing steps:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
