import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

// This file contains READ-ONLY badge functions that are safe for Edge Runtime.

/** DB障害時はthrowするため、呼び出し側でセクション単位の失敗境界を設ける。 */
export const getUserBadges = async (userId: string) => {
    if (!userId) return [];

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
        reportError('getUserBadges', error, { userId });
        throw error;
    }

    return data;
};
