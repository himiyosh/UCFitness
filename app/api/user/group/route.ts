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
    // New format: { action, keyword }
    // Old format fallback: { group_keyword } (string or array)
    const { action, keyword, group_keyword } = body;

    const userId = (session.user as any).id;
    let newGroups: string[] = [];

    // 1. Fetch current groups
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("group_keyword")
      .eq("id", userId)
      .single();

    let currentGroups: string[] = user?.group_keyword || [];

    if (action && keyword) {
      // --- NEW LOGIC: Add/Remove single ---
      const target = keyword.trim();
      if (!target) return NextResponse.json({ error: "Invalid keyword" }, { status: 400 });

      if (action === 'add') {
        // Avoid duplicates
        if (!currentGroups.includes(target)) {
          currentGroups.push(target);
        }
      } else if (action === 'remove') {
        currentGroups = currentGroups.filter(g => g !== target);
      } else if (action === 'move') {
        const { direction } = body; // 'up' | 'down'
        const idx = currentGroups.indexOf(target);
        if (idx !== -1) {
          if (direction === 'up' && idx > 0) {
            // Swap with previous
            [currentGroups[idx - 1], currentGroups[idx]] = [currentGroups[idx], currentGroups[idx - 1]];
          } else if (direction === 'down' && idx < currentGroups.length - 1) {
            // Swap with next
            [currentGroups[idx + 1], currentGroups[idx]] = [currentGroups[idx], currentGroups[idx + 1]];
          }
        }
      }
      newGroups = currentGroups;

    } else if (group_keyword !== undefined) {
      // --- FALLBACK: Old logic (Overwrite) ---
      // This supports the "Leave All" or legacy edits if any
      if (typeof group_keyword === 'string') {
        newGroups = group_keyword.split(',').map(k => k.trim()).filter(k => k.length > 0);
      } else if (Array.isArray(group_keyword)) {
        newGroups = group_keyword.filter((k: any) => typeof k === 'string' && k.trim().length > 0);
      }
    } else {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 2. Update DB
    const { error } = await supabaseAdmin
      .from("users")
      .update({ group_keyword: newGroups })
      .eq("id", userId);

    if (error) {
      console.error("Error updating group keyword:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, keywords: newGroups });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
