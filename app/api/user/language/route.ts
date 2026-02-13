import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { cookies } from 'next/headers';

export const runtime = 'edge';

export async function POST(request: Request) {
    const session = await auth();

    if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { language } = body;

        if (!['ja', 'en'].includes(language)) {
            return NextResponse.json({ error: "Invalid language" }, { status: 400 });
        }

        const userId = (session.user as any).id;

        const { error } = await supabaseAdmin
            .from("users")
            .update({
                language: language,
                updated_at: new Date().toISOString()
            })
            .eq("id", userId);

        if (error) {
            reportError("language-update", error);
            return NextResponse.json({ error: "Failed to update language" }, { status: 500 });
        }

        // Explicitly set the cookie for next-intl
        (await cookies()).set('NEXT_LOCALE', language, { path: '/', maxAge: 31536000 }); // 1 year

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        reportError("language-update", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
