import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { backfillUserSteps } from "@/lib/step-manager";

export async function POST(request: Request) {
    const session = await auth();

    if (!session || !session.user || !session.user.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { username, email, name } = body;

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

        const updates: { username: string; name: string; updated_at: string; email?: string } = {
            username: username,
            name: name,
            updated_at: new Date().toISOString()
        };

        if (email) {
            // 🛡️ Sentinel: Security Check
            // Only allow email updates if the current email is a temporary setup email.
            // This prevents account takeover attempts via email change on already set up accounts.
            const isPendingSetup = session.user.email.endsWith('@pending.setup');
            if (!isPendingSetup && email !== session.user.email) {
                return NextResponse.json({ error: "Email change not allowed for fully registered users" }, { status: 403 });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
            }
            updates.email = email;
        }

        // Check uniqueness for email if changing
        // CRITICAL: Check this BEFORE username, because if we are merging accounts,
        // we don't care if the username is taken (since we are deleting the temp user anyway).
        if (updates.email && updates.email !== session.user.email) {
            console.log(`[Setup] Checking email change: ${session.user.email} -> ${updates.email}`);

            const { data: existingEmail } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', updates.email)
                .neq('email', session.user.email)
                .single();

            if (existingEmail) {
                console.log(`[Setup] Email is already registered: ${existingEmail.id}`);
                // Security Decision: 
                // We do NOT automatically merge accounts based on email verification alone,
                // as this allows account takeover if the previous email was insecure/placeholder.
                // Since the root cause of login failures (SQL error) is fixed, legitimate users 
                // should login automatically via Fitbit ID match and never see this screen.

                return NextResponse.json({ error: "Email is already registered" }, { status: 409 });
            }
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

        // 🛡️ Sentinel: Security Check
        // Prevent email change if user already has a valid email (not pending)
        const isPendingEmail = session.user.email.includes('@pending.setup');
        if (!isPendingEmail && updates.email && updates.email !== session.user.email) {
            return NextResponse.json({ error: "Cannot change email address after setup." }, { status: 403 });
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

    } catch (error) {
        console.error("Setup error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
