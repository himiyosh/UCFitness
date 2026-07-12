export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { Link } from '@/navigation';
import GroupList from "@/components/group/GroupList";
import UserMenu from "@/components/layout/UserMenu";
import RefreshButton from '@/components/layout/RefreshButton';
import NotificationBell from '@/components/layout/NotificationBell';
import GroupSettings from "@/components/group/GroupSettings";
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import { getCachedGlobalRankings, deriveBatchGroupRankings } from "@/lib/services/ranking-service";
import { getLocale, getTranslations } from "next-intl/server";
import Footer from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

export default async function MyGroupsPage() {
    const [session, locale] = await Promise.all([auth(), getLocale()]);

    if (!session || !session.user) {
        redirect(createLoginRequiredRedirect(locale, "/groups"));
    }

    const userId = (session.user as any).id;

    // ⚡ パフォーマンス: ユーザーデータ、メンバーシップ、翻訳を並列取得
    const [userResult, membershipResult, t, dashboardT, commonT] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('name, group_keyword, image, username')
            .eq('id', userId)
            .single(),
        supabaseAdmin
            .from('group_members')
            .select(`
      role,
      joined_at,
      groups (
        id,
        name,
        keyword,
        image_url,
        header_image_url
      )
    `)
            .eq('user_id', userId),
        getTranslations('Groups'),
        getTranslations('Dashboard'),
        getTranslations('Common'),
    ]);

    const userData = userResult.data;
    const memberships = membershipResult.data;
    const pageDataError = Boolean(userResult.error || membershipResult.error);
    let rankingDataError = false;
    if (userResult.error) {
        reportError('groups:user', userResult.error, { userId });
    }
    if (membershipResult.error) {
        reportError('groups:memberships', membershipResult.error, { userId });
    }

    if (!userResult.error && !userData?.username) {
        redirect('/setup');
    }

    // Ensure it's an array
    const groupOrder = Array.isArray(userData?.group_keyword)
        ? userData?.group_keyword
        : (userData?.group_keyword ? [userData.group_keyword] : []);

    // Normalize memberships (Handle array vs object for joined table)
    const normalizedMemberships = (memberships || []).map((m: any) => ({
        ...m,
        groups: Array.isArray(m.groups) ? m.groups[0] : m.groups
    }));

    // ⚡ N+1 解消: グローバルランキングキャッシュからバッチで全グループのランキングを導出
    const groupIds = normalizedMemberships.map((m: any) => m.groups.id);
    let globalRankings: Awaited<ReturnType<typeof getCachedGlobalRankings>> | null = null;
    if (!pageDataError) {
        try {
            globalRankings = await getCachedGlobalRankings();
        } catch (error: unknown) {
            reportError('groups:rankings', error, { userId });
            rankingDataError = true;
        }
    }
    const batchRankings = globalRankings
        ? await deriveBatchGroupRankings(groupIds, globalRankings)
        : {};

    const membershipsWithRank = normalizedMemberships.map((m: any) => {
        const groupRankings = batchRankings[m.groups.id];
        const weeklyRankings = groupRankings?.WEEKLY || [];
        const myRankIndex = weeklyRankings.findIndex((r: any) => r.users.id === userId);

        return {
            ...m,
            rank: myRankIndex !== -1 ? myRankIndex + 1 : null,
            totalMembers: weeklyRankings.length
        };
    });

    // Sort memberships based on groupOrder
    const sortedMemberships = membershipsWithRank.sort((a: any, b: any) => {
        const indexA = groupOrder.indexOf(a.groups.keyword);
        const indexB = groupOrder.indexOf(b.groups.keyword);

        // If both present, sort by index
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;

        // If only A present, A comes first
        if (indexA !== -1) return -1;
        // If only B present, B comes first
        if (indexB !== -1) return 1;

        // If neither, sort by join date (newest first)
        return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
    });

    // G1/G8: グループサマリーデータの計算
    const totalMembers = membershipsWithRank.reduce((sum: number, m: any) => sum + (m.totalMembers || 0), 0);
    const bestRank = membershipsWithRank.reduce((best: number | null, m: any) => {
        if (!m.rank) return best;
        if (best === null) return m.rank;
        return m.rank < best ? m.rank : best;
    }, null as number | null);
    // 全グループのTop3ランクを収集（グループ順に依存せず全て表示）
    const topRankedGroups = membershipsWithRank
        .filter((m: any) => m.rank && m.rank <= 3)
        .sort((a: any, b: any) => a.rank - b.rank);

    // Use custom image if available, otherwise fallback to session image
    const finalUser = {
        ...session.user,
        name: userData?.name || session.user.name,
        image: userData?.image || session.user.image,
    };

    return (
        <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
            {/* Header */}
            <header data-auth-header className="sticky top-0 z-50 overflow-visible border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-xl font-black tracking-tight text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary-strong)] sm:text-2xl" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-1">
                        <RefreshButton />
                        <NotificationBell />
                        <UserMenu user={finalUser} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                {pageDataError ? (
                    <section className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-surface)] p-4 shadow-sm" role="alert">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-semibold text-[var(--color-text)]">{commonT('error')}</p>
                            <form action="/groups" method="get">
                                <button
                                    type="submit"
                                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                                >
                                    {commonT('retry')}
                                </button>
                            </form>
                        </div>
                    </section>
                ) : (
                    <>
                {rankingDataError && (
                    <section className="mb-4 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-surface)] p-3 shadow-sm" role="status">
                        <p className="text-sm font-bold text-[var(--color-text)]">{dashboardT('rankingUnavailableTitle')}</p>
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{dashboardT('rankingUnavailableDescription')}</p>
                    </section>
                )}

                {/* パンくずリスト */}
                <div className="mb-4 sm:mb-6">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                </div>

                {/* ヒーローセクション — ランキングページと統一デザイン */}
                <div className="mb-6 sm:mb-8 relative overflow-hidden rounded-2xl leaderboard-hero-bg p-5 sm:p-6 text-white leaderboard-card-enter">
                    {/* 背景デコレーション */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                        <div className="absolute -top-4 -right-4 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full blur-2xl" />
                        <div className="absolute bottom-0 left-1/4 w-16 h-16 sm:w-20 sm:h-20 bg-white/5 rounded-full blur-xl" />
                    </div>

                    <div className="relative z-10">
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight flex items-center gap-2.5">
                            <span>👥</span>
                            <span>{t('title')}</span>
                        </h1>
                        <p className="mt-1.5 text-sm sm:text-base text-white/80">
                            {t('headerDesc')}
                        </p>
                        <div className="mt-4 h-0.5 w-20 rounded-full bg-white/30" />
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* Group List (Left on Desktop, Top on Mobile) */}
                    <section className="flex-1 w-full">
                        {/* ハイライト + サマリー統合パネル */}
                        {sortedMemberships.length > 0 && (
                            <div className="bg-white midnight-solid-panel rounded-xl p-3 sm:p-4 border border-gray-100 shadow-sm mb-3">
                                {/* ハイライトバナー */}
                                {topRankedGroups.length > 0 && (
                                    <div className="mb-2.5">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">{t('todayHighlight')}</div>
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {topRankedGroups.map((m: any) => (
                                                <span key={m.groups.id} className="inline-flex items-center gap-0.5 text-[11px] font-bold text-gray-700">
                                                    <span>{m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : '🥉'}</span>
                                                    <span className="truncate max-w-[120px]">{m.groups.name}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* サマリー: ラベル+値をインラインでコンパクトに */}
                                <div className="flex items-center gap-4 flex-wrap">
                                    <span className="inline-flex items-center gap-1.5 text-xs">
                                        <span className="font-black text-base text-[var(--theme-primary)]">{sortedMemberships.length}</span>
                                        <span className="font-medium text-gray-500">{t('groupsJoined')}</span>
                                    </span>
                                    {!rankingDataError && (
                                        <>
                                            <span className="inline-flex items-center gap-1.5 text-xs">
                                                <span className="font-black text-base text-[var(--theme-primary)]">{totalMembers}</span>
                                                <span className="font-medium text-gray-500">{t('totalGroupMembers')}</span>
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-xs">
                                                <span className="font-black text-base text-[var(--theme-primary)]">{bestRank ? `#${bestRank}` : '—'}</span>
                                                <span className="font-medium text-gray-500">{t('bestRank')}</span>
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="mb-3">
                            <h2 className="text-base font-bold text-gray-900">{t('yourGroups')}</h2>
                        </div>

                        {!memberships || memberships.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                                <p className="text-gray-500">{t('noGroups')}</p>
                            </div>
                        ) : (
                            <GroupList initialMemberships={sortedMemberships} />
                        )}
                    </section>

                    {/* Join / Create Section (Right on Desktop, Bottom on Mobile) */}
                    <aside className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-24 space-y-3">
                        {/* Join / Create */}
                        <div>
                            <div className="flex items-center mb-2">
                                <h2 className="text-base font-bold text-gray-900">{t('joinOrCreate')}</h2>
                            </div>
                            <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-[var(--theme-primary-light)] via-white to-white border border-[var(--theme-primary)]/20 shadow-sm">
                                {/* 装飾 — デスクトップのみ */}
                                <div className="hidden md:block absolute right-0 top-0 w-32 h-32 bg-[var(--theme-primary)]/5 rounded-bl-full translate-x-8 -translate-y-8" />
                                <div className="hidden md:block absolute left-0 bottom-0 w-24 h-24 bg-[var(--theme-primary)]/5 rounded-tr-full -translate-x-8 translate-y-8" />

                                <div className="relative p-3 md:p-5 md:pb-6">
                                    {/* アイキャッチ — デスクトップのみ */}
                                    <div className="hidden md:flex justify-center mb-4">
                                        <div className="relative w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100">
                                            <div className="absolute inset-0 rounded-full border-[3px] border-[var(--theme-primary)]/20 border-dashed animate-[spin_10s_linear_infinite]" />
                                            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[var(--theme-primary-light)] to-[var(--theme-primary)]/10" />
                                            <span className="text-2xl relative z-10 -ml-0.5">🤝</span>
                                        </div>
                                    </div>
                                    <div className="w-full">
                                        <GroupSettings />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* G5: グループ作成CTA */}
                        <Link
                            href="/groups/create"
                            className="flex items-center gap-3 w-full px-4 py-3 md:block md:p-4 md:text-center rounded-xl bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] text-white shadow-md hover:shadow-lg hover:scale-[1.02] transition-all group cursor-pointer"
                        >
                            <span className="text-xl md:text-2xl md:mb-1 shrink-0">🏃‍♂️</span>
                            <div className="min-w-0">
                                <div className="font-bold text-sm">{t('createGroup')}</div>
                                <div className="text-[11px] md:text-xs text-white/80">{t('createGroupDesc')}</div>
                            </div>
                        </Link>
                    </aside>
                </div>
                    </>
                )}
            </div>
            <Footer />
        </main>
    );
}
