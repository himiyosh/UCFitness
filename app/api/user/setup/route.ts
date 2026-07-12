import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
    const session = await auth();

    if (!session || !session.user || !session.user.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🛡️ セキュリティ: IDベースのユーザー特定（メール衝突によるIDOR防止）
    const userId = (session.user as any).id as string | undefined;

    try {
        const body = await request.json();
        const { username, email, name } = body;
        const trimmedUsername = typeof username === 'string' ? username.trim() : '';
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        const trimmedEmail = typeof email === 'string' ? email.trim() : '';

        // Validation
        if (trimmedUsername.length < 3) {
            return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
        }

        const usernameRegex = /^[a-zA-Z0-9_.-]+$/;
        if (!usernameRegex.test(trimmedUsername)) {
            return NextResponse.json({ error: "Username can only contain letters, numbers, underscores, hyphens, and dots" }, { status: 400 });
        }

        if (trimmedUsername.length > 30) {
            return NextResponse.json({ error: "Username must be 30 characters or less" }, { status: 400 });
        }
        if (!trimmedName || trimmedName.length > 50) {
            return NextResponse.json({ error: "Display name is required and must be 50 characters or less" }, { status: 400 });
        }

        // 🛡️ Sentinel: Reject reserved usernames
        const RESERVED_USERNAMES = ['admin', 'system', 'support', 'help', 'api', 'root', 'null', 'undefined', 'moderator', 'mod', 'official', 'ucfitness', 'undoucoin'];
        if (RESERVED_USERNAMES.includes(trimmedUsername.toLowerCase())) {
            return NextResponse.json({ error: "This username is reserved" }, { status: 400 });
        }

        // Email validation if provided (it should be provided if we are here)
        // If the user already has a valid email, they might not send it, or send same.
        // But logic says we ask for email if it's pending.

        const updates: { username: string; name: string; updated_at: string; email?: string } = {
            username: trimmedUsername,
            name: trimmedName,
            updated_at: new Date().toISOString()
        };

        const isPendingSetup = session.user.email.endsWith('@pending.setup');
        if (isPendingSetup && !trimmedEmail) {
            return NextResponse.json({ error: "Email is required to complete setup" }, { status: 400 });
        }
        if (trimmedEmail) {
            if (trimmedEmail.toLowerCase().endsWith('@pending.setup')) {
                return NextResponse.json({ error: "Enter a permanent email address" }, { status: 400 });
            }
            // 🛡️ Sentinel: Security Check
            // Only allow email updates if the current email is a temporary setup email.
            // This prevents account takeover attempts via email change on already set up accounts.
            if (!isPendingSetup && trimmedEmail !== session.user.email) {
                return NextResponse.json({ error: "Email change not allowed for fully registered users" }, { status: 403 });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(trimmedEmail)) {
                return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
            }
            updates.email = trimmedEmail;
        }

        // 🚀 パフォーマンス: メール・ユーザー名の一意性チェックを並列実行
        const needsEmailCheck = !!(updates.email && updates.email !== session.user.email);

        const [emailCheckResult, usernameCheckResult] = await Promise.all([
            needsEmailCheck
                ? supabaseAdmin
                    .from('users')
                    .select('id')
                    .eq('email', updates.email!)
                    .neq(userId ? 'id' : 'email', userId || session.user.email)
                    .single()
                : Promise.resolve({ data: null }),
            supabaseAdmin
                .from('users')
                .select('id')
                .eq('username', trimmedUsername)
                .neq(userId ? 'id' : 'email', userId || session.user.email) // Ignore self
                .single(),
        ]);

        if (needsEmailCheck && emailCheckResult.data) {
            return NextResponse.json({ error: "Email is already registered" }, { status: 409 });
        }

        if (usernameCheckResult.data) {
            return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
        }

        // 🛡️ Sentinel: Security Check
        // Prevent email change if user already has a valid email (not pending)
        const isPendingEmail = session.user.email.includes('@pending.setup');
        if (!isPendingEmail && updates.email && updates.email !== session.user.email) {
            return NextResponse.json({ error: "Cannot change email address after setup." }, { status: 403 });
        }

        // Update User
        // 🛡️ セキュリティ: IDが利用可能な場合はIDで特定（メール衝突によるIDOR防止）
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update(updates)
            .eq(userId ? 'id' : 'email', userId || session.user.email);

        if (updateError) {
            reportError("user-setup", updateError);
            return NextResponse.json({ error: "Failed to update user profile" }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        reportError("user-setup", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
