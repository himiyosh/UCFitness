import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
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

    const userId = (session.user as any).id;

    const { data: user } = await supabaseAdmin
        .from("users")
        .select("username")
        .eq("id", userId)
        .single();

    if (!user?.username) {
        redirect("/setup");
    }

    redirect(`/user/${user.username}`);
}
