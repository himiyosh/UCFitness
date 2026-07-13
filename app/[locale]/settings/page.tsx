export const runtime = 'edge';

import { redirect } from 'next/navigation';

import { getLocale, getTranslations } from 'next-intl/server';

import { isGoogleHealthEnabled } from '@/lib/api/google-health';
import { auth } from '@/lib/auth';
import { createLoginRequiredRedirect } from '@/lib/auth-redirect';
import { reportError } from '@/lib/errors';
import { parseGoogleHealthNotice } from '@/lib/google-health-oauth';
import { getCoinBalance } from '@/lib/services/coin-service';
import { getGoogleHealthConnectionSummary } from '@/lib/services/fitness-connection-service';
import { supabaseAdmin } from '@/lib/supabase';

import ExportButton from '@/components/ExportButton';
import GoogleHealthConnectionCard from '@/components/GoogleHealthConnectionCard';
import SettingsForm from '@/components/SettingsForm';
import SmartGoalAdvisor from '@/components/SmartGoalAdvisor';
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import Footer from '@/components/layout/Footer';
import PageIntro from '@/components/layout/PageIntro';

export const dynamic = 'force-dynamic';

interface SettingsPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({
    searchParams,
}: SettingsPageProps): Promise<React.ReactNode> {
    // ⚡ パフォーマンス: 翻訳取得を並列化
    const [session, t, commonT, dashboardT, locale, resolvedSearchParams] = await Promise.all([
        auth(),
        getTranslations('Settings'),
        getTranslations('Common'),
        getTranslations('Dashboard'),
        getLocale(),
        searchParams,
    ]);

    const healthNoticeValue = resolvedSearchParams.health;
    const healthNotice = parseGoogleHealthNotice(
        Array.isArray(healthNoticeValue) ? healthNoticeValue[0] : healthNoticeValue,
    );
    if (!session?.user?.id) {
        const nextPath = healthNotice
            ? `/settings?health=${healthNotice}`
            : '/settings';
        redirect(createLoginRequiredRedirect(locale, nextPath));
    }
    const userId = session.user.id;

    // ⚡ パフォーマンス: supabaseAdmin を使用し必要なカラムのみ取得
    const { data: user } = await supabaseAdmin
        .from("users")
        .select("name, image, username, is_custom_image, step_goal, banner_url, provider")
        .eq("id", userId)
        .single();

    if (!user) {
        return <div className="flex items-center justify-center min-h-screen text-[var(--foreground-muted)]">{commonT('userNotFound')}</div>;
    }

    if (!user.username) {
        redirect('/setup');
    }

    // 通知設定カラム（DB にカラムが未追加の場合でもエラーにならないよう別クエリで安全に取得）
    const { data: notifySettings } = await supabaseAdmin
        .from("users")
        .select("notification_reactions, notification_gear_reactions")
        .eq("id", userId)
        .single();

    // ⚡ パフォーマンス: Midnight テーマチェックと所持アイテムを並列取得
    // スマートゴールアドバイザー用: 直近30日の歩数データを取得
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const googleHealthAvailable = isGoogleHealthEnabled();
    const googleHealthStatePromise = getGoogleHealthConnectionSummary(userId)
        .then((connection) => ({ connection, loadError: false }))
        .catch((error: unknown) => {
            reportError('settings:googleHealthConnection', error, { userId });
            return { connection: null, loadError: true };
        });

    const [
        midnightResult,
        ownedItemsResult,
        recentStepsResult,
        coinBalance,
        googleHealthState,
    ] = await Promise.all([
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
        // スマートゴールアドバイザー用データ
        supabaseAdmin
            .from('daily_steps')
            .select('date, steps')
            .eq('user_id', userId)
            .gte('date', thirtyDaysAgoStr)
            .order('date', { ascending: true }),
        getCoinBalance(userId),
        googleHealthStatePromise,
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
            <AuthenticatedPageHeader
                appTitle={dashboardT('title')}
                betaLabel={dashboardT('beta')}
                contextLabel={t('title')}
                user={{
                    id: userId,
                    username: user.username,
                    name: user.name || session.user.name,
                    email: session.user.email,
                    image: user.image || session.user.image,
                }}
            />

            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                <PageIntro
                    headingId="settings-page-title"
                    title={t('title')}
                    description={t('description')}
                    icon="settings"
                    tone="primary"
                    breadcrumbs={[{ label: t('title') }]}
                />

                <GoogleHealthConnectionCard
                    available={googleHealthAvailable}
                    connection={googleHealthState.connection}
                    fitbitFallbackAvailable={user.provider === 'fitbit'}
                    loadError={googleHealthState.loadError}
                    notice={healthNotice}
                />

                <SettingsForm user={{ ...user, notification_reactions: notifySettings?.notification_reactions ?? null, notification_gear_reactions: notifySettings?.notification_gear_reactions ?? null }} ownsMidnight={ownsMidnight} ownedTitles={ownedTitles} ownedFrames={ownedFrames} ownedThemes={ownedThemes} />

                {/* データエクスポート */}
                <div className="mt-8 max-w-sm">
                    <ExportButton />
                </div>
            </div>
            <Footer />
        </main>
    );
}
