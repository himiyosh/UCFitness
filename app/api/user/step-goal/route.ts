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
        const { step_goal } = await request.json();

        if (typeof step_goal !== 'number' || step_goal < 0) {
            return NextResponse.json({ error: "Invalid goal" }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from("users")
            .update({ step_goal })
            .eq("id", (session.user as any).id);

        if (error) {
            console.error("Error updating goal:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
