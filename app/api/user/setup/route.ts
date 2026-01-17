import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { username, email } = body;

        // Validation
        if (!username || username.length < 3) {
            return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
        }

        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(username)) {
            return NextResponse.json({ error: "Username can only contain letters, numbers, and underscores" }, { status: 400 });
        }

        // Email validation if provided (it should be provided if we are here)
        // If the user already has a valid email, they might not send it, or send same.
        // But logic says we ask for email if it's pending.

        const updates: any = {
            username: username,
            updated_at: new Date().toISOString()
        };

        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
            }
            updates.email = email;
        }

        // Check uniqueness for username
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('username', username)
            .neq('email', session.user.email) // Ignore self
            .single();

        if (existingUser) {
            return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
        }

        // Check uniqueness for email if changing
        if (updates.email && updates.email !== session.user.email) {
            const { data: existingEmail } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', updates.email)
                .neq('email', session.user.email)
                .single();

            if (existingEmail) {
                return NextResponse.json({ error: "Email is already registered" }, { status: 409 });
            }
        }

        // Update User
        // We identify user by their CURRENT session email (which might be the pending one)
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update(updates)
            .eq('email', session.user.email);

        if (updateError) {
            console.error("Setup update error:", updateError);
            return NextResponse.json({ error: "Failed to update user profile" }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Setup error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
