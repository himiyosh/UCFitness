import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * /profile → /user/{username} へリダイレクト
 * プロフィールページは /user/[username] に統一済み
 */
export default async function ProfileRedirect() {
    const session = await auth();

    if (!session || !session.user) {
        redirect("/");
    }

    const userId = (session.user as any).id;

    const { data: user } = await supabase
        .from("users")
        .select("username")
        .eq("id", userId)
        .single();

    if (!user?.username) {
        redirect("/setup");
    }

    redirect(`/user/${user.username}`);
}
