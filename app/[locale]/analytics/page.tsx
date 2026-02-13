export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import UserMenu from "@/components/UserMenu";
import Breadcrumbs from "@/components/Breadcrumbs";
import BackButton from "@/components/BackButton";
import nextDynamic from 'next/dynamic';

// ⚡ パフォーマンス: クライアントコンポーネントを遅延読み込み
const PersonalAnalytics = nextDynamic(() => import('@/components/PersonalAnalytics'));

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
    const session = await auth();
    const t = await getTranslations('Analytics');

    if (!session?.user) {
        redirect("/");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;
    const user = session.user;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ヘッダー */}
            <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100">
                <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BackButton />
                        <h1 className="text-lg font-bold text-gray-900">📊 {t('title')}</h1>
                    </div>
                    <UserMenu user={{
                        id: userId,
                        name: user.name,
                        email: user.email,
                        image: user.image,
                    }} />
                </div>
            </header>

            {/* パンくずリスト */}
            <div className="max-w-3xl mx-auto px-4 py-2">
                <Breadcrumbs items={[
                    { label: '🏠', href: '/' },
                    { label: t('title') },
                ]} />
            </div>

            {/* コンテンツ */}
            <main className="max-w-3xl mx-auto px-4 pb-8">
                <PersonalAnalytics userId={userId} />
            </main>
        </div>
    );
}
