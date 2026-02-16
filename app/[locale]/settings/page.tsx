import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation"; // Standard redirect works fine for root
import UserMenu from "@/components/UserMenu";
import RefreshButton from '@/components/RefreshButton';
import { Link } from "@/navigation"; // Localized Link
import Breadcrumbs from "@/components/Breadcrumbs";
import SettingsForm from "@/components/SettingsForm";
import { getTranslations } from 'next-intl/server';
import Footer from '@/components/Footer';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';


export default async function SettingsPage() {
    const session = await auth();
    const t = await getTranslations('Settings');
    const commonT = await getTranslations('Common');
    const dashboardT = await getTranslations('Dashboard');

    if (!session || !session.user) {
        redirect("/");
    }

    // ⚡ パフォーマンス: supabaseAdmin を使用し必要なカラムのみ取得
    const { data: user } = await supabaseAdmin
        .from("users")
        .select("name, image, username, is_custom_image, step_goal, banner_url")
        .eq("id", (session.user as any).id)
        .single();

    if (!user) {
        return <div className="flex items-center justify-center min-h-screen text-[var(--foreground-muted)]">{commonT('userNotFound')}</div>;
    }

    // ⚡ パフォーマンス: Midnight テーマチェックと所持アイテムを並列取得
    const userId = (session.user as any).id;
    const [midnightResult, ownedItemsResult] = await Promise.all([
        supabaseAdmin
            .from('user_items')
            .select('id, shop_items!inner(item_code)')
            .eq('user_id', userId)
            .eq('shop_items.item_code', 'theme_midnight')
            .maybeSingle(),
        supabaseAdmin
            .from('user_items')
            .select('id, is_equipped, shop_items(item_code, name_en, name_ja, preview_value, category)')
            .eq('user_id', userId)
            .order('purchased_at', { ascending: true }),
    ]);
    const ownsMidnight = midnightResult.data !== null;
    const ownedTitleItems = ownedItemsResult.data;

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

    // 所持しているテーマカラーアイテムを取得
    const ownedThemes = (ownedTitleItems || [])
        .filter((item: any) => item.shop_items?.category === 'THEME_COLOR')
        .map((item: any) => ({
            userItemId: item.id,
            itemCode: item.shop_items.item_code,
            nameEn: item.shop_items.name_en,
            nameJa: item.shop_items.name_ja,
            isEquipped: item.is_equipped,
        }));

    return (
        <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
            {/* Header (Consistent with Profile) */}
            <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: '"Inter", sans-serif' }}>
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-1">
                        <RefreshButton />
                        <UserMenu user={{
                            ...session.user,
                            image: user?.image || session.user.image
                        }} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-6">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{t('title')}</h1>
                    <p className="text-gray-500">{t('description')}</p>
                </div>

                <SettingsForm user={user} ownsMidnight={ownsMidnight} ownedTitles={ownedTitles} ownedFrames={ownedFrames} ownedThemes={ownedThemes} />
            </div>
            <Footer />
        </main>
    );
}
