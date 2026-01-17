import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getServerSession(authOptions);

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

        return NextResponse.json({
            authenticated: true,
            isSetup,
            username: user.username,
            email: user.email
        });

    } catch (error) {
        console.error('Error checking user status:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'edge';
