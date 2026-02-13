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
        // 🛡️ セキュリティ: IDベースのDB検索を優先（メールフォールバック付き）
        const userId = (session.user as any).id as string | undefined;

        let queryBuilder = supabaseAdmin
            .from('users')
            .select('username, email, is_custom_image');

        if (userId) {
            queryBuilder = queryBuilder.eq('id', userId);
        } else {
            queryBuilder = queryBuilder.eq('email', session.user.email);
        }

        const { data: user, error } = await queryBuilder.single();

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
