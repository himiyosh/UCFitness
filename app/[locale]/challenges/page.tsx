export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ChallengesPageClient from '@/components/ChallengesPageClient';

// ============================================
// チャレンジページ（Server Component）
// 認証チェック後にクライアントコンポーネントを描画
// ============================================

export const dynamic = 'force-dynamic';

export default async function ChallengesPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/');
    }

    return <ChallengesPageClient />;
}
