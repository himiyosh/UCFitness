
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function checkGroupInfo() {
    const groupName = 'JPUCSupport';
    const targetUsername = 'samwalkman';

    // 1. Find Group
    let { data: groups, error } = await supabaseAdmin
        .from('groups')
        .select('id, name')
        .eq('name', groupName);

    if (error || !groups || groups.length === 0) {
        const { data: groupsSearch } = await supabaseAdmin
            .from('groups')
            .select('id, name')
            .ilike('name', `%${groupName}%`);
        groups = groupsSearch || [];
    }

    if (groups.length === 0) {
        console.log("Group not found.");
        return;
    }

    const group = groups[0];
    console.log(`Found Group: ${group.name} (ID: ${group.id})`);

    // 2. Count Members
    const { count } = await supabaseAdmin
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id);

    console.log(`Member Count: ${count}`);

    // 3. User Membership Check
    const { data: user } = await supabaseAdmin.from('users').select('id, username').eq('username', targetUsername).single();

    if (!user) {
        console.log(`User '${targetUsername}' not found in DB.`);
        return;
    }
    console.log(`User '${targetUsername}' ID: ${user.id}`);

    const { data: member } = await supabaseAdmin
        .from('group_members')
        .select('user_id, group_id, joined_at')
        .eq('group_id', group.id)
        .eq('user_id', user.id)
        .single();

    if (member) {
        console.log(`✅ User '${targetUsername}' IS a member.`);
    } else {
        console.log(`❌ User '${targetUsername}' is NOT a member.`);
        return;
    }

    // 4. Check Steps and Ranking for yesterday (since Cron runs for "yesterday")
    const now = new Date();
    // Use UTC date logic similar to what we fixed
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstTime = new Date(now.getTime() + jstOffset);
    jstTime.setUTCDate(jstTime.getUTCDate() - 1);
    const dateStr = jstTime.toISOString().split('T')[0];

    console.log(`Checking steps for date: ${dateStr}`);

    const { data: groupMembers } = await supabaseAdmin
        .from('group_members')
        .select('user_id')
        .eq('group_id', group.id);

    const memberIds = groupMembers?.map(m => m.user_id) || [];

    const { data: stepsData } = await supabaseAdmin
        .from('daily_steps')
        .select('user_id, steps')
        .eq('date', dateStr)
        .in('user_id', memberIds)
        .order('steps', { ascending: false });

    console.log("--- Group Ranking for " + dateStr + " ---");
    let rank = 1;
    let foundUser = false;
    for (const s of stepsData || []) {
        const isTarget = s.user_id === user.id;
        console.log(`${rank}. ${isTarget ? '*** ' : ''}${s.user_id} - ${s.steps} steps ${isTarget ? '***' : ''}`);
        if (isTarget) foundUser = true;
        rank++;
    }

    if (!foundUser) {
        console.log(`User '${targetUsername}' has NO steps recorded for ${dateStr}.`);
    }

}

checkGroupInfo();
