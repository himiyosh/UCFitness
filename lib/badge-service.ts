import { supabaseAdmin } from '@/lib/supabase';

// This file contains READ-ONLY badge functions that are safe for Edge Runtime.

export const getUserBadges = async (userId: string) => {
    const { data, error } = await supabaseAdmin
        .from('user_badges')
        .select(`
            *,
            badges (
                name,
                image_url,
                description,
                category,
                type,
                rank
            )
        `)
        .eq('user_id', userId)
        .order('awarded_at', { ascending: false });

    if (error) {
        console.error("Error fetching user badges:", error);
        return [];
    }

    return data;
};
