export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ authenticated: false });
    }

    try {
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('username, email, is_custom_image, provider, step_goal')
            .eq('id', session.user.id)
            .single();

        if (error) {
            reportError('user-status:load', error, { userId: session.user.id });
            return NextResponse.json({ error: 'Failed to load setup status' }, { status: 500 });
        }
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const isSetup = !!user.username && !user.email.includes('@pending.setup');

        // 🛡️ セキュリティ: メールアドレスをクライアントに返さない
        return NextResponse.json({
            authenticated: true,
            isSetup,
            username: user.username,
            is_custom_image: user.is_custom_image,
            provider: user.provider,
            step_goal: user.step_goal,
        });

    } catch (error: unknown) {
        reportError('user-status', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
