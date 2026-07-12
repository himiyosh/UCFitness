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
        const { name, username } = body;
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        const trimmedUsername = typeof username === 'string' ? username.trim() : '';

        // Validate input
        if (!trimmedName) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        if (trimmedName.length > 50) {
            return NextResponse.json({ error: "Name is too long (max 50 chars)" }, { status: 400 });
        }

        if (username !== undefined) {
            if (trimmedUsername.length < 3 || trimmedUsername.length > 30 || !/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
                return NextResponse.json({ error: "Invalid User ID" }, { status: 400 });
            }
            const reserved = ['admin', 'system', 'support', 'help', 'api', 'root', 'null', 'undefined', 'moderator', 'mod', 'official', 'ucfitness', 'undoucoin'];
            if (reserved.includes(trimmedUsername.toLowerCase())) {
                return NextResponse.json({ error: "This User ID is reserved" }, { status: 400 });
            }
        }

        const updates: { name: string; username?: string } = { name: trimmedName };
        if (username !== undefined) updates.username = trimmedUsername;

        // 同じ行を1回で更新し、名前とUser IDの部分成功を防ぐ
        const { error } = await supabaseAdmin
            .from("users")
            .update(updates)
            .eq("id", userId);

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: "This User ID is already taken" }, { status: 409 });
            }
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
