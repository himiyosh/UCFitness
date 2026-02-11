import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, keyword, name } = body;
    const userId = session.user.id;

    if (!action) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Keyword is required for all actions except 'reorder'
    if (action !== 'reorder' && !keyword) {
      return NextResponse.json({ error: "Invalid keyword" }, { status: 400 });
    }

    const target = keyword ? keyword.trim() : '';
    if (action !== 'reorder' && !target) return NextResponse.json({ error: "Invalid keyword" }, { status: 400 });

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
        // 🛡️ Sentinel: Validate Keyword before creation
        // Enforce: 3-50 chars, alphanumeric, underscores, hyphens only
        const KEYWORD_REGEX = /^[a-zA-Z0-9_-]{3,50}$/;
        if (!KEYWORD_REGEX.test(target)) {
          return NextResponse.json({
            error: "New group keywords must be 3-50 characters and contain only letters, numbers, hyphens, or underscores."
          }, { status: 400 });
        }

        // Create New Group
        const groupDisplayName = (name && name.trim()) ? name.trim() : target;
        const { data: newGroup, error: createError } = await supabaseAdmin
          .from('groups')
          .insert({ name: groupDisplayName, keyword: target, owner_id: userId })
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const updates: Record<string, string | boolean> = {};
      if (name !== undefined) updates.name = name;
      if (image_url !== undefined) updates.image_url = image_url;
      if (header_image_url !== undefined) updates.header_image_url = header_image_url;
      if (body.is_public !== undefined) updates.is_public = body.is_public;

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

    } else if (action === 'invite') {
      const { targetUserId } = body;
      if (!targetUserId) return NextResponse.json({ error: "Missing target user" }, { status: 400 });

      // Find group
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id')
        .eq('keyword', target)
        .single();

      if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

      // Verify Ownership (Only owner can invite directly or maybe members too? Plan said Owner)
      const { data: currentUserMember } = await supabaseAdmin
        .from('group_members')
        .select('role')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .single();

      if (!currentUserMember || currentUserMember.role !== 'OWNER') {
        return NextResponse.json({ error: "Forbidden: Only owner can invite members" }, { status: 403 });
      }

      // Check if target is already member
      const { data: existingMember } = await supabaseAdmin
        .from('group_members')
        .select('id')
        .eq('group_id', group.id)
        .eq('user_id', targetUserId)
        .single();

      if (existingMember) {
        return NextResponse.json({ error: "User is already a member" }, { status: 400 });
      }

      // Add Member
      await supabaseAdmin
        .from('group_members')
        .insert({ group_id: group.id, user_id: targetUserId, role: 'MEMBER' });

      // Sync Legacy Array for Target User
      const { data: memberships } = await supabaseAdmin
        .from('group_members')
        .select('groups(keyword)')
        .eq('user_id', targetUserId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newKeywords = memberships?.map((m: any) => m.groups?.keyword).filter(Boolean) || [];

      await supabaseAdmin
        .from('users')
        .update({ group_keyword: newKeywords })
        .eq('id', targetUserId);

      return NextResponse.json({ success: true });

    } else if (action === 'reorder') {
      const { groupKeywords } = body;

      if (!Array.isArray(groupKeywords)) {
        return NextResponse.json({ error: "Invalid keywords format" }, { status: 400 });
      }

      // Validate that the user is actually a member of all these groups
      // Fetch current memberships
      const { data: memberships } = await supabaseAdmin
        .from('group_members')
        .select('groups(keyword)')
        .eq('user_id', userId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentKeywords = memberships?.map((m: any) => {
        const groupData = Array.isArray(m.groups) ? m.groups[0] : m.groups;
        return groupData?.keyword;
      }).filter(Boolean) || [];

      // Ensure new list has same items (length and content)
      if (groupKeywords.length !== currentKeywords.length) {
        console.error('Length mismatch:', groupKeywords.length, 'vs', currentKeywords.length);
        return NextResponse.json({ error: "Keyword count mismatch" }, { status: 400 });
      }

      const sortedCurrent = [...currentKeywords].sort();
      const sortedNew = [...groupKeywords].sort();

      const isSame = sortedCurrent.every((val, index) => val === sortedNew[index]);
      if (!isSame) {
        console.error('Content mismatch');
        return NextResponse.json({ error: "Invalid group list provided" }, { status: 400 });
      }

      // Update Order
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ group_keyword: groupKeywords })
        .eq('id', userId);

      if (updateError) {
        console.error("Reorder Error", updateError);
        return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
      }

      return NextResponse.json({ success: true });

    } else if (action === 'delete_group') {
      // Find group (画像URLも取得してストレージクリーンアップに使用)
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id, image_url, header_image_url')
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
        return NextResponse.json({ error: "Forbidden: Only owner can delete the group" }, { status: 403 });
      }

      // 削除前に全メンバーのuser_idを取得（レガシー配列同期用）
      const { data: members } = await supabaseAdmin
        .from('group_members')
        .select('user_id')
        .eq('group_id', group.id);

      const memberUserIds = members?.map(m => m.user_id) || [];

      // グループ削除（ON DELETE CASCADEでgroup_membersも自動削除される）
      const { error: deleteError } = await supabaseAdmin
        .from('groups')
        .delete()
        .eq('id', group.id);

      if (deleteError) {
        console.error("Delete Group Error", deleteError);
        return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
      }

      // 全メンバーのレガシー group_keyword 配列を同期
      for (const memberId of memberUserIds) {
        const { data: memberships } = await supabaseAdmin
          .from('group_members')
          .select('groups(keyword)')
          .eq('user_id', memberId);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newKeywords = memberships?.map((m: any) => m.groups?.keyword).filter(Boolean) || [];

        await supabaseAdmin
          .from('users')
          .update({ group_keyword: newKeywords })
          .eq('id', memberId);
      }

      // ストレージのグループ画像をクリーンアップ
      const imagesToDelete: string[] = [];
      for (const url of [group.image_url, group.header_image_url]) {
        if (url && url.includes('group-assets/')) {
          const path = url.split('group-assets/').pop();
          if (path) imagesToDelete.push(path);
        }
      }
      if (imagesToDelete.length > 0) {
        const { error: storageError } = await supabaseAdmin.storage
          .from('group-assets')
          .remove(imagesToDelete);
        if (storageError) {
          console.warn("Failed to cleanup group images:", storageError);
          // 画像削除失敗はグループ削除自体の成功には影響させない
        }
      }

      return NextResponse.json({ success: true });
    }

    // 2. Sync Legacy Array (users.group_keyword)
    // Fetch fresh memberships to rebuild array
    const { data: memberships } = await supabaseAdmin
      .from('group_members')
      .select('groups(keyword)')
      .eq('user_id', userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const runtime = 'edge';
