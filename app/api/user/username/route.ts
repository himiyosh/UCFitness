import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { username } = body;

        // Validate input
        if (!username || typeof username !== 'string' || username.trim().length === 0) {
            return NextResponse.json({ error: "User ID is required" }, { status: 400 });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return NextResponse.json({ error: "User ID can only contain letters, numbers, and underscores." }, { status: 400 });
        }

        if (username.length > 20) {
            return NextResponse.json({ error: "User ID is too long (max 20 chars)" }, { status: 400 });
        }

        // Check uniqueness
        const { data: existingUser } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("username", username)
            .neq("id", (session.user as any).id) // Exclude self
            .single();

        if (existingUser) {
            return NextResponse.json({ error: "This User ID is already taken." }, { status: 409 });
        }

        // Update username in Supabase
        const { error } = await supabaseAdmin
            .from("users")
            .update({ username: username.trim() })
            .eq("id", (session.user as any).id);

        if (error) {
            // Catch unique constraint error if race condition occurs
            if (error.code === '23505') {
                return NextResponse.json({ error: "This User ID is already taken." }, { status: 409 });
            }
            console.error("Error updating username:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error processing request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
