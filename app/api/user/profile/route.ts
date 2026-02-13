import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { reportError } from "@/lib/errors";

export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        const body = await request.json();
        const { name } = body;

        // Validate input
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        if (name.length > 50) {
            return NextResponse.json({ error: "Name is too long (max 50 chars)" }, { status: 400 });
        }

        // Update name in Supabase
        const { error } = await supabaseAdmin
            .from("users")
            .update({ name: name.trim() })
            .eq("id", userId);

        if (error) {
            reportError('user/profile:update', error, { userId });
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        reportError('user/profile', error, { userId });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
