import { supabaseAdmin } from '@/lib/supabase';

import type { ChallengeParticipantRow, ChallengeRow } from '@/types/database';

const PROFILE_CHALLENGE_HISTORY_LIMIT = 100;

type ChallengeSummary = Pick<
    ChallengeRow, 'id' | 'title' | 'end_date'
>;
export interface ProfileChallengeHistoryRow extends Pick<
    ChallengeParticipantRow, 'id' | 'progress_steps' | 'is_completed' | 'completed_at'
> {
    challenge: ChallengeSummary | ChallengeSummary[] | null;
}
export interface ProfileChallengeHistory {
    rows: ProfileChallengeHistoryRow[]; totalCount: number; isTruncated: boolean;
}
export async function getProfileChallengeHistory(
    userId: string,
): Promise<ProfileChallengeHistory> {
    if (!userId) throw new Error('Profile challenge history requires a user ID');
    const { data, error, count } = await supabaseAdmin
        .from('challenge_participants')
        .select(`
            id, progress_steps, is_completed, completed_at,
            challenge:challenges!inner(id, title, end_date)
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('joined_at', { ascending: false })
        .limit(PROFILE_CHALLENGE_HISTORY_LIMIT)
        .returns<ProfileChallengeHistoryRow[]>();
    if (error) throw error;
    const rows = data ?? [];
    const totalCount = count ?? rows.length;
    return { rows, totalCount, isTruncated: totalCount > rows.length };
}
