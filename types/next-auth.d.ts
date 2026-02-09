// ============================================
// NextAuth 型拡張
// Session と JWT にカスタムフィールドを追加
// ============================================

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            username?: string | null;
            language?: string;
        };
    }

    interface User {
        id: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
        username?: string | null;
        language?: string;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id?: string;
        username?: string;
        language?: string;
        provider_account_id?: string;
        image?: string;
        accessToken?: string;
    }
}
