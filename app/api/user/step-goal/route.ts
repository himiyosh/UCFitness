export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidStepGoal } from '@/lib/step-goal';

export async function POST(request: Request): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        const body: unknown = await request.json();
        const stepGoal = (
            typeof body === 'object'
            && body !== null
            && 'step_goal' in body
        )
            ? body.step_goal
            : undefined;

        if (!isValidStepGoal(stepGoal)) {
            return NextResponse.json({ error: 'Invalid goal' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('users')
            .update({ step_goal: stepGoal })
            .eq('id', userId);

        if (error) {
            reportError('step-goal-update', error, { userId });
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        reportError('step-goal-update', error, { userId });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
