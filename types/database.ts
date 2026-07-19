// ============================================
// Supabase `public` スキーマ型定義（F033 対象範囲）
// ============================================
// UCFitness には Supabase CLI が生成する追跡済み Database 型が存在しないため、
// このファイルでは F033 で型付けしたクエリのテーブル・カラムを手動で定義する。
// カラムと null 許容性は、追跡済み migration と既存クエリの契約に合わせる。
//
// 新しいテーブル/カラムを参照するコードを追加する場合は、このファイルに追記してから
// `Database['public']['Tables'][...]['Row']` エイリアスとして利用すること。
// client 全体への generic 適用は行わず（大量の未使用テーブルの型を偽装しないため）、
// 個々のクエリでは `.returns<T>()` で対象の Row 型を明示する。

export interface Database {
    public: {
        Tables: {
            users: {
                Row: {
                    id: string;
                    name: string | null;
                    email: string;
                    image: string | null;
                    username: string | null;
                    group_keyword: string[] | null;
                    provider: string | null;
                    provider_account_id: string | null;
                    is_custom_image: boolean | null;
                    language: string | null;
                    banner_url: string | null;
                    created_at: string;
                    updated_at: string | null;
                };
            };
            groups: {
                Row: {
                    id: string;
                    name: string;
                    keyword: string;
                    image_url: string | null;
                    header_image_url: string | null;
                };
            };
            group_members: {
                Row: {
                    group_id: string;
                    user_id: string;
                    role: string;
                    joined_at: string;
                };
            };
            challenges: {
                Row: {
                    id: string;
                    title: string;
                    description: string | null;
                    type: 'INDIVIDUAL' | 'GROUP';
                    target_steps: number;
                    start_date: string;
                    end_date: string;
                    reward_uc: number;
                    is_active: boolean;
                    created_by: string;
                    group_id: string | null;
                    created_at: string;
                };
            };
            daily_steps: {
                Row: {
                    user_id: string;
                    date: string;
                    steps: number;
                };
            };
            user_follows: {
                Row: {
                    id: string;
                    follower_id: string;
                    following_id: string;
                    created_at: string;
                };
            };
            coin_transactions: {
                Row: {
                    id: string;
                    user_id: string;
                    date: string;
                    type: string;
                    amount: number;
                    description: string | null;
                    idempotency_key: string | null;
                };
            };
            recommended_items: {
                Row: {
                    id: string;
                    user_id: string;
                    asin: string;
                    title: string;
                    image_url: string;
                    affiliate_link: string;
                    display_order: number | null;
                    comment: string | null;
                    updated_at: string;
                };
            };
        };
        Functions: {
            get_user_step_stats: {
                /**
                 * PostgreSQL 関数の宣言 (`RETURNS TABLE` か単一行か) によって
                 * PostgREST が配列・単一オブジェクトいずれの形でも返しうるため、
                 * 呼び出し側で `Array.isArray()` によるガードを必須とする。
                 */
                Returns: { total_steps: number; total_days: number };
            };
            get_batch_user_step_totals: {
                Returns: { user_id: string; total_steps: number; total_days: number }[];
            };
            create_group_challenge: {
                Args: {
                    p_group_id: string;
                    p_created_by: string;
                    p_type: 'GROUP';
                    p_title: string;
                    p_description: string | null;
                    p_target_steps: number;
                    p_start_date: string;
                    p_end_date: string;
                    p_reward_uc: number;
                };
                Returns: {
                    status: 'created' | 'not_found' | 'forbidden' | 'invalid';
                    challenge: Database['public']['Tables']['challenges']['Row'] | null;
                }[];
            };
        };
    };
}

export type UserRow = Database['public']['Tables']['users']['Row'];
export type GroupRow = Database['public']['Tables']['groups']['Row'];
export type GroupMemberRow = Database['public']['Tables']['group_members']['Row'];
export type ChallengeRow = Database['public']['Tables']['challenges']['Row'];
export type DailyStepRow = Database['public']['Tables']['daily_steps']['Row'];
export type UserFollowRow = Database['public']['Tables']['user_follows']['Row'];
export type CoinTransactionRow = Database['public']['Tables']['coin_transactions']['Row'];
export type RecommendedItemRow = Database['public']['Tables']['recommended_items']['Row'];
export type UserStepStatsRpcRow = Database['public']['Functions']['get_user_step_stats']['Returns'];
export type BatchUserStepTotalsRpcRow = Database['public']['Functions']['get_batch_user_step_totals']['Returns'][number];
export type GroupChallengeCreationRpcArgs = Database['public']['Functions']['create_group_challenge']['Args'];
export type GroupChallengeCreationRpcRow = Database['public']['Functions']['create_group_challenge']['Returns'][number];

/** ランキング・フォロー等で頻出する公開プロフィール射影 (PII 除外) */
export type PublicUserSummary = Pick<UserRow, 'id' | 'name' | 'image' | 'username'>;
