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
    const { group_keyword } = body;

    // Validate input (optional but good practice)
    if (group_keyword !== undefined && typeof group_keyword !== 'string') {
        return NextResponse.json({ error: "Invalid keyword format" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ group_keyword: group_keyword || null }) // Set to null if empty string
      .eq("id", (session.user as any).id);

    if (error) {
      console.error("Error updating group keyword:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
