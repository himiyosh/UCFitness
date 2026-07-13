import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * /profile → /user/{username} へリダイレクト
 * プロフィールページは /user/[username] に統一済み
 */
export default async function ProfileRedirect() {
    const [session, locale] = await Promise.all([auth(), getLocale()]);

    if (!session || !session.user) {
        redirect(createLoginRequiredRedirect(locale, "/profile"));
    }

    const userId = String(session.user.id);

    const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("username")
        .eq("id", userId)
        .single();

    if (userError && userError.code !== 'PGRST116') {
        reportError('profile-redirect:user', userError, { userId });
        throw new Error('Failed to load profile redirect user');
    }

    if (!user?.username) {
        redirect("/setup");
    }

    redirect(`/user/${encodeURIComponent(user.username)}`);
}
