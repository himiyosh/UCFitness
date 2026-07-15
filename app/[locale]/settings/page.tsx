export const runtime = 'edge';

import { redirect } from 'next/navigation';

import { getLocale, getTranslations } from 'next-intl/server';

import { isGoogleHealthEnabled } from '@/lib/api/google-health';
import { auth } from '@/lib/auth';
import { createLoginRequiredRedirect } from '@/lib/auth-redirect';
import { reportError } from '@/lib/errors';
import { parseGoogleHealthNotice } from '@/lib/google-health-oauth';
import { getGoogleHealthConnectionSummary } from '@/lib/services/fitness-connection-service';
import { RECOMMENDED_STEP_GOAL } from '@/lib/step-goal';
import { supabaseAdmin } from '@/lib/supabase';

import ExportButton from '@/components/ExportButton';
import GoogleHealthConnectionCard from '@/components/GoogleHealthConnectionCard';
import SettingsForm from '@/components/SettingsForm';
import StepGoalForm from '@/components/StepGoalForm';
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import Footer from '@/components/layout/Footer';
import PageIntro from '@/components/layout/PageIntro';

export const dynamic = 'force-dynamic';

interface SettingsPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface SettingsShopItem {
    itemCode: string;
    nameEn: string;
    nameJa: string;
    previewValue: string;
    category: string;
}

interface SettingsOwnedItem {
    id: string;
    isEquipped: boolean;
    shopItem: SettingsShopItem;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseOwnedItem(value: unknown): SettingsOwnedItem | null {
    if (!isRecord(value) || typeof value.id !== 'string') {
        return null;
    }
    const relation = Array.isArray(value.shop_items)
        ? value.shop_items[0]
        : value.shop_items;
    if (
        !isRecord(relation)
        || typeof relation.item_code !== 'string'
        || typeof relation.name_en !== 'string'
        || typeof relation.name_ja !== 'string'
        || typeof relation.preview_value !== 'string'
        || typeof relation.category !== 'string'
    ) {
        return null;
    }

    return {
        id: value.id,
        isEquipped: value.is_equipped === true,
        shopItem: {
            itemCode: relation.item_code,
            nameEn: relation.name_en,
            nameJa: relation.name_ja,
            previewValue: relation.preview_value,
            category: relation.category,
        },
    };
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
    const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("name, image, username, is_custom_image, step_goal, banner_url, provider")
        .eq("id", userId)
        .single();

    if (userError) {
        reportError('settings:user', userError, { userId });
        throw new Error('Failed to load settings user');
    }
    if (!user) {
        return <div className="flex items-center justify-center min-h-screen text-[var(--foreground-muted)]">{commonT('userNotFound')}</div>;
    }

    if (!user.username) {
        redirect('/setup');
    }

    // 通知設定を独立取得し、障害時は既定値へ偽装せず明示する
    const { data: notifySettings, error: notifySettingsError } = await supabaseAdmin
        .from("users")
        .select("notification_reactions, notification_gear_reactions")
        .eq("id", userId)
        .single();

    if (notifySettingsError) {
        reportError('settings:notifications', notifySettingsError, { userId });
    }

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
        googleHealthStatePromise,
    ]);
    if (midnightResult.error) {
        reportError('settings:midnight-ownership', midnightResult.error, { userId });
        throw new Error('Failed to load theme ownership');
    }
    if (ownedItemsResult.error) {
        reportError('settings:owned-items', ownedItemsResult.error, { userId });
        throw new Error('Failed to load owned items');
    }
    const ownsMidnight = midnightResult.data !== null;
    const parsedOwnedItems = (ownedItemsResult.data ?? []).map(parseOwnedItem);
    if (parsedOwnedItems.some((item) => item === null)) {
        const shapeError = new Error('Unexpected owned item response shape');
        reportError('settings:owned-items-shape', shapeError, { userId });
        throw shapeError;
    }
    const ownedItems = parsedOwnedItems.filter(
        (item): item is SettingsOwnedItem => item !== null,
    );

    const ownedTitles = ownedItems
        .filter((item) => item.shopItem.category === 'TITLE')
        .map((item) => ({
            userItemId: item.id,
            itemCode: item.shopItem.itemCode,
            nameEn: item.shopItem.nameEn,
            nameJa: item.shopItem.nameJa,
            emoji: item.shopItem.previewValue,
            isEquipped: item.isEquipped,
        }));

    // 所持しているフレームアイテムを取得
    const ownedFrames = ownedItems
        .filter((item) => item.shopItem.category === 'ICON_FRAME')
        .map((item) => ({
            userItemId: item.id,
            itemCode: item.shopItem.itemCode,
            nameEn: item.shopItem.nameEn,
            nameJa: item.shopItem.nameJa,
            previewValue: item.shopItem.previewValue,
            isEquipped: item.isEquipped,
        }));

    // 所持しているテーマカラーアイテムを取得
    const ownedThemes = ownedItems
        .filter((item) => item.shopItem.category === 'THEME_COLOR')
        .map((item) => ({
            userItemId: item.id,
            itemCode: item.shopItem.itemCode,
            nameEn: item.shopItem.nameEn,
            nameJa: item.shopItem.nameJa,
            isEquipped: item.isEquipped,
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

                <div data-settings-priority="health-and-goal">
                    <GoogleHealthConnectionCard
                        available={googleHealthAvailable}
                        connection={googleHealthState.connection}
                        fitbitFallbackAvailable={user.provider === 'fitbit'}
                        loadError={googleHealthState.loadError}
                        notice={healthNotice}
                    />

                    <section
                        aria-labelledby="settings-daily-goal-heading"
                        className="settings-goal-card mb-3 rounded-xl border border-[var(--color-border)] border-l-4 border-l-[var(--color-primary)] bg-white p-3 shadow-sm sm:p-5"
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <h2 id="settings-daily-goal-heading" className="flex items-center gap-2 text-base font-bold text-[var(--color-text)]">
                                    <span aria-hidden="true" className="text-xl">🎯</span>
                                    {t('dailyGoal')}
                                </h2>
                                <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                                    {t('stepGoalPriorityDescription')}
                                </p>
                            </div>
                            <div className="w-full sm:w-auto sm:min-w-72">
                                <StepGoalForm initialGoal={user.step_goal ?? RECOMMENDED_STEP_GOAL} />
                            </div>
                        </div>
                    </section>
                </div>

                <SettingsForm
                    user={{
                        ...user,
                        notification_reactions: notifySettings?.notification_reactions ?? null,
                        notification_gear_reactions: notifySettings?.notification_gear_reactions ?? null,
                    }}
                    notificationSettingsLoadError={notifySettingsError !== null}
                    ownsMidnight={ownsMidnight}
                    ownedTitles={ownedTitles}
                    ownedFrames={ownedFrames}
                    ownedThemes={ownedThemes}
                />

                {/* データエクスポート */}
                <div className="mt-8 max-w-sm">
                    <ExportButton />
                </div>
            </div>
            <Footer />
        </main>
    );
}
