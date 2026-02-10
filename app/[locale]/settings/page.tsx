import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation"; // Standard redirect works fine for root
import UserMenu from "@/components/UserMenu";
import { Link } from "@/navigation"; // Localized Link
import Breadcrumbs from "@/components/Breadcrumbs";
import SettingsForm from "@/components/SettingsForm";
import { getTranslations } from 'next-intl/server';
import { getCoinBalance } from '@/lib/coin-service';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';


export default async function SettingsPage() {
    const session = await auth();
    const t = await getTranslations('Settings');
    const commonT = await getTranslations('Common');
    const landingT = await getTranslations('Landing');
    const dashboardT = await getTranslations('Dashboard'); // Added

    if (!session || !session.user) {
        redirect("/");
    }

    // Fetch current user data
    const { data: user } = await supabase
        .from("users")
        .select("name, image, username, is_custom_image, step_goal, banner_url, created_at")
        .eq("id", (session.user as any).id)
        .single();

    if (!user) {
        return <div>User not found</div>;
    }

    // Midnight テーマの所有チェック（shop_items → user_items）
    const userId = (session.user as any).id;

    // UC残高・ランク取得
    const coinBalance = await getCoinBalance(userId);

    const { data: midnightItem } = await supabaseAdmin
        .from('user_items')
        .select('id, shop_items!inner(item_code)')
        .eq('user_id', userId)
        .eq('shop_items.item_code', 'theme_midnight')
        .maybeSingle();
    const ownsMidnight = midnightItem !== null;

    // 所持している称号アイテムを取得（!inner を使わず JS でフィルタ）
    const { data: ownedTitleItems } = await supabaseAdmin
        .from('user_items')
        .select('id, is_equipped, shop_items(item_code, name_en, name_ja, preview_value, category)')
        .eq('user_id', userId)
        .order('purchased_at', { ascending: true });

    const ownedTitles = (ownedTitleItems || [])
        .filter((item: any) => item.shop_items?.category === 'TITLE')
        .map((item: any) => ({
            userItemId: item.id,
            itemCode: item.shop_items.item_code,
            nameEn: item.shop_items.name_en,
            nameJa: item.shop_items.name_ja,
            emoji: item.shop_items.preview_value,
            isEquipped: item.is_equipped,
        }));

    // 所持しているフレームアイテムを取得
    const ownedFrames = (ownedTitleItems || [])
        .filter((item: any) => item.shop_items?.category === 'ICON_FRAME')
        .map((item: any) => ({
            userItemId: item.id,
            itemCode: item.shop_items.item_code,
            nameEn: item.shop_items.name_en,
            nameJa: item.shop_items.name_ja,
            previewValue: item.shop_items.preview_value,
            isEquipped: item.is_equipped,
        }));

    return (
        <main className="min-h-screen bg-[var(--theme-page-bg)]">
            {/* Header (Consistent with Profile) */}
            <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity">
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    <UserMenu user={{
                        ...session.user,
                        image: user?.image || session.user.image
                    }} />
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
                {/* ① グラデーション付きページヘッダー */}
                <div className="relative mb-8 p-6 rounded-2xl bg-gradient-to-br from-[var(--theme-primary-light)] via-white to-[var(--theme-primary-light)]/50 border border-[var(--theme-primary)]/10 overflow-hidden">
                    {/* 装飾オーブ */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-[var(--theme-primary)]/5 rounded-full blur-2xl"></div>
                    <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-purple-400/5 rounded-full blur-2xl"></div>

                    <Breadcrumbs items={[{ label: t('title') }]} />
                    <div className="flex items-center gap-3 mt-2">
                        <div className="settings-gear p-2 rounded-xl bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold text-gray-900">{t('title')}</h1>
                            <p className="text-gray-500 text-sm">{t('description')}</p>
                        </div>
                    </div>
                </div>

                <SettingsForm
                    user={user}
                    ownsMidnight={ownsMidnight}
                    ownedTitles={ownedTitles}
                    ownedFrames={ownedFrames}
                    accountData={{
                        createdAt: user.created_at || null,
                        ucBalance: coinBalance?.total_balance ?? 0,
                        investorRank: coinBalance?.investor_rank ?? 'BEGINNER',
                    }}
                />
            </div>
        </main>
    );
}
