import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await auth();

    if (!session || !session.user || !session.user.email) {
        return NextResponse.json({ authenticated: false });
    }

    try {
        // Check DB for this user
        // We can search by email since that's what we have in the session (even if it's pending, we check DB)
        // Or better, search by provider ID if we can get it from session... 
        // asking session for provider ID is hard unless we put it there.
        // But we put 'sub' in token? getServerSession returns session object.

        // Let's use email.
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('username, email, is_custom_image')
            .eq('email', session.user.email)
            .single();

        if (error || !user) {
            return NextResponse.json({ authenticated: true, isSetup: false });
        }

        const isSetup = !!user.username && !user.email.includes('@pending.setup');

        // 🛡️ セキュリティ: メールアドレスをクライアントに返さない
        return NextResponse.json({
            authenticated: true,
            isSetup,
            username: user.username,
            is_custom_image: user.is_custom_image
        });

    } catch (error: unknown) {
        reportError('user-status', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
