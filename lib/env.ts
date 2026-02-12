// ============================================
// 環境変数バリデーション
// ⚠ NEXT_PUBLIC_* は静的リテラルで参照すること
//    process.env[name] では Next.js のビルド時インライン展開が効かない
// ============================================

// --- クライアント + サーバー共用 ---
// Next.js が静的リテラルをビルド時にインライン化するため、直接参照が必須
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

// --- サーバー専用ヘルパー ---
// サーバー側のみで実行される。クライアントで呼ばれた場合は即時エラー
function requireServerEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`必須環境変数 ${name} が設定されていません`);
    }
    return value;
}

// --- 統合エクスポート ---
// クライアント安全: 値はビルド時にインライン化済み
// サーバー専用: lazy getter でアクセス時にのみバリデーション（クライアント側で触らなければ安全）
export const env = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    VAPID_PUBLIC_KEY,

    get SUPABASE_SERVICE_ROLE_KEY() { return requireServerEnv('SUPABASE_SERVICE_ROLE_KEY'); },
    get NEXTAUTH_SECRET() { return requireServerEnv('NEXTAUTH_SECRET'); },
    get FITBIT_CLIENT_ID() { return requireServerEnv('FITBIT_CLIENT_ID'); },
    get FITBIT_CLIENT_SECRET() { return requireServerEnv('FITBIT_CLIENT_SECRET'); },
    get VAPID_PRIVATE_KEY() { return process.env.VAPID_PRIVATE_KEY || ''; },
    get VAPID_SUBJECT() { return process.env.VAPID_SUBJECT || 'mailto:admin@example.com'; },

    // Amazon PA-API v5
    get AMAZON_ACCESS_KEY() { return requireServerEnv('AMAZON_ACCESS_KEY'); },
    get AMAZON_SECRET_KEY() { return requireServerEnv('AMAZON_SECRET_KEY'); },
    get AMAZON_PARTNER_TAG() { return requireServerEnv('AMAZON_PARTNER_TAG'); },
};
