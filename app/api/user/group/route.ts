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
    const { action, keyword } = body;
    const userId = (session.user as any).id;

    if (!action || !keyword) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const target = keyword.trim();
    if (!target) return NextResponse.json({ error: "Invalid keyword" }, { status: 400 });

    // 1. Handle New Schema (groups, group_members)
    if (action === 'add') {
      // Check if group exists
      const { data: existingGroup } = await supabaseAdmin
        .from('groups')
        .select('id')
        .eq('keyword', target)
        .single();

      let groupId = existingGroup?.id;

      if (!groupId) {
        // Create New Group
        const { data: newGroup, error: createError } = await supabaseAdmin
          .from('groups')
          .insert({ name: target, keyword: target, owner_id: userId })
          .select('id')
          .single();

        if (createError) throw createError;
        groupId = newGroup.id;
      }

      // Add Member (upsert to be safe)
      const role = !existingGroup ? 'OWNER' : 'MEMBER';
      await supabaseAdmin
        .from('group_members')
        .upsert({ group_id: groupId, user_id: userId, role }, { onConflict: 'group_id,user_id' });

    } else if (action === 'remove') {
      // Find group
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id')
        .eq('keyword', target)
        .single();

      if (group) {
        await supabaseAdmin
          .from('group_members')
          .delete()
          .eq('group_id', group.id)
          .eq('user_id', userId);
      }
    } else if (action === 'kick') {
      const { targetUserId } = body;
      if (!targetUserId) return NextResponse.json({ error: "Missing target user" }, { status: 400 });

      // Find group
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id')
        .eq('keyword', target)
        .single();

      if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

      // Verify Ownership (Check group_members)
      const { data: currentUserMember } = await supabaseAdmin
        .from('group_members')
        .select('role')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .single();

      if (!currentUserMember || currentUserMember.role !== 'OWNER') {
        return NextResponse.json({ error: "Forbidden: Only owner can remove members" }, { status: 403 });
      }

      // Remove Member
      await supabaseAdmin
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', targetUserId);

      // Sync Legacy Array for Target User
      const { data: memberships } = await supabaseAdmin
        .from('group_members')
        .select('groups(keyword)')
        .eq('user_id', targetUserId);

      // @ts-ignore
      const newKeywords = memberships?.map((m: any) => m.groups?.keyword).filter(Boolean) || [];

      await supabaseAdmin
        .from('users')
        .update({ group_keyword: newKeywords })
        .eq('id', targetUserId);

      return NextResponse.json({ success: true });

    } else if (action === 'transfer_ownership') {
      const { targetUserId } = body;
      if (!targetUserId) return NextResponse.json({ error: "Missing target user" }, { status: 400 });

      // Find group
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id')
        .eq('keyword', target)
        .single();

      if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

      // Verify Ownership
      const { data: currentUserMember } = await supabaseAdmin
        .from('group_members')
        .select('role')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .single();

      if (!currentUserMember || currentUserMember.role !== 'OWNER') {
        return NextResponse.json({ error: "Forbidden: Only owner can promote members" }, { status: 403 });
      }

      // Promote Target to OWNER (Allow multiple owners)
      const { error: promoteError } = await supabaseAdmin
        .from('group_members')
        .update({ role: 'OWNER' })
        .eq('group_id', group.id)
        .eq('user_id', targetUserId);

      if (promoteError) console.error("Promote Error", promoteError);

      return NextResponse.json({ success: true });

    } else if (action === 'demote') {
      const { targetUserId } = body;
      if (!targetUserId) return NextResponse.json({ error: "Missing target user" }, { status: 400 });

      // Find group
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id')
        .eq('keyword', target)
        .single();

      if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

      // Verify Ownership (Current user must be OWNER)
      const { data: currentUserMember } = await supabaseAdmin
        .from('group_members')
        .select('role')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .single();

      if (!currentUserMember || currentUserMember.role !== 'OWNER') {
        return NextResponse.json({ error: "Forbidden: Only owner can demote members" }, { status: 403 });
      }

      // Verify Target is actually an OWNER
      const { data: targetMember } = await supabaseAdmin
        .from('group_members')
        .select('role')
        .eq('group_id', group.id)
        .eq('user_id', targetUserId)
        .single();

      if (!targetMember || targetMember.role !== 'OWNER') {
        return NextResponse.json({ error: "Target is not an owner" }, { status: 400 });
      }

      // CRITICAL: Check if there are OTHER owners. Cannot demote the last owner.
      const { count: ownerCount, error: countError } = await supabaseAdmin
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id)
        .eq('role', 'OWNER');

      if (countError) throw countError;

      // If only 1 owner (or 0??), reject.
      if ((ownerCount || 0) <= 1) {
        return NextResponse.json({ error: "Cannot demote the last owner. Promote someone else first." }, { status: 400 });
      }

      // Demote to MEMBER
      const { error: demoteError } = await supabaseAdmin
        .from('group_members')
        .update({ role: 'MEMBER' })
        .eq('group_id', group.id)
        .eq('user_id', targetUserId);

      if (demoteError) console.error("Demote Error", demoteError);

      return NextResponse.json({ success: true });

    } else if (action === 'update_metadata') {
      const { name, image_url, header_image_url } = body;

      // Find group
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id')
        .eq('keyword', target)
        .single();

      if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

      // Verify Ownership
      const { data: currentUserMember } = await supabaseAdmin
        .from('group_members')
        .select('role')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .single();

      if (!currentUserMember || currentUserMember.role !== 'OWNER') {
        return NextResponse.json({ error: "Forbidden: Only owner can update group settings" }, { status: 403 });
      }

      // Update Group
      // Filter out undefined values to avoid overwriting with null if client doesn't send them
      // But typical patterns send full or partial. Let's assume passed values are what to update.
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (image_url !== undefined) updates.image_url = image_url;
      if (header_image_url !== undefined) updates.header_image_url = header_image_url;

      updates.updated_at = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('groups')
        .update(updates)
        .eq('id', group.id);

      if (updateError) {
        console.error("Group Update Error", updateError);
        return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // 2. Sync Legacy Array (users.group_keyword)
    // Fetch fresh memberships to rebuild array
    const { data: memberships } = await supabaseAdmin
      .from('group_members')
      .select('groups(keyword)')
      .eq('user_id', userId);

    // @ts-ignore
    const newKeywords = memberships?.map((m: any) => m.groups?.keyword).filter(Boolean) || [];

    await supabaseAdmin
      .from('users')
      .update({ group_keyword: newKeywords })
      .eq('id', userId);

    return NextResponse.json({ success: true, keywords: newKeywords });

  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
