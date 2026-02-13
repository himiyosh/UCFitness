import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const session = await auth();

    if (!session || !session.user || !session.user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { username } = body;

        // Validate input
        if (!username || typeof username !== 'string' || username.trim().length === 0) {
            return NextResponse.json({ error: "User ID is required" }, { status: 400 });
        }

        if (username.length < 6) {
            return NextResponse.json({ error: "User ID must be at least 6 characters" }, { status: 400 });
        }

        if (username.length > 20) {
            return NextResponse.json({ error: "User ID is too long (max 20 chars)" }, { status: 400 });
        }

        // Allowed: a-z, A-Z, 0-9, _, -, .
        if (!/^[a-zA-Z0-9_\-\.]+$/.test(username)) {
            return NextResponse.json({ error: "User ID can only contain letters, numbers, underscores, hyphens, and dots." }, { status: 400 });
        }

        // 🛡️ Sentinel: Reject reserved usernames
        const RESERVED_USERNAMES = ['admin', 'system', 'support', 'help', 'api', 'root', 'null', 'undefined', 'moderator', 'mod', 'official', 'ucfitness', 'undoucoin'];
        if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
            return NextResponse.json({ error: "This User ID is reserved." }, { status: 400 });
        }

        // Check uniqueness
        const { data: existingUser } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("username", username)
            .neq("id", session.user.id) // Exclude self
            .single();

        if (existingUser) {
            return NextResponse.json({ error: "This User ID is already taken." }, { status: 409 });
        }

        // Update username in Supabase
        const { error } = await supabaseAdmin
            .from("users")
            .update({ username: username.trim() })
            .eq("id", session.user.id);

        if (error) {
            // Catch unique constraint error if race condition occurs
            if (error.code === '23505') {
                return NextResponse.json({ error: "This User ID is already taken." }, { status: 409 });
            }
            reportError("username-update", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        reportError("username-update", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
