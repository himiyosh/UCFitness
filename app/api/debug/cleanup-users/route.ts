import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const keepUsernames = ['samwalkman', 'well_hand'];

    try {
        // 1. Select users to delete
        const { data: usersToDelete, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('id, username, email')
            .not('username', 'is', null)
            .not('username', 'in', `(${keepUsernames.map(n => `"${n}"`).join(',')})`); // Checking query syntax

        // Alternative safe query using JS filter if 'not in' syntax is tricky with Supabase builder
        const { data: allUsers, error: allError } = await supabaseAdmin
            .from('users')
            .select('id, username, email');

        if (allError) throw allError;

        const targets = allUsers.filter(u =>
            u.username !== null &&
            !keepUsernames.includes(u.username)
        );

        const count = targets.length;
        const targetIds = targets.map(u => u.id);
        const targetNames = targets.map(u => u.username);

        if (count === 0) {
            return NextResponse.json({ message: 'No users to delete', keep: keepUsernames });
        }

        // 2. Delete them
        // Note: this assumes cascading deletes are enabled in DB, 
        // or effectively we might leave orphaned records if not. 
        // Ideally we should delete from child tables too if needed, but assuming DB handles it or it's fine for now.
        const { error: deleteError } = await supabaseAdmin
            .from('users')
            .delete()
            .in('id', targetIds);

        if (deleteError) {
            throw deleteError;
        }

        return NextResponse.json({
            success: true,
            deletedCount: count,
            deletedUsernames: targetNames,
            kept: {
                allowList: keepUsernames,
                nullUsernamesPreserved: true
            }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
