export const runtime = 'edge';

import { auth } from "@/lib/auth";
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
import { getTranslations } from "next-intl/server";
import Footer from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

export default async function MyGroupsPage() {
    const session = await auth();

    if (!session || !session.user) {
        redirect("/");
    }

    const userId = (session.user as any).id;

    // ⚡ パフォーマンス: ユーザーデータ、メンバーシップ、翻訳を並列取得
    const [userResult, membershipResult, t, dashboardT] = await Promise.all([
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
    ]);

    const userData = userResult.data;
    const memberships = membershipResult.data;

    if (!userData?.username) {
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
    const globalRankings = await getCachedGlobalRankings();
    const batchRankings = await deriveBatchGroupRankings(groupIds, globalRankings);

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
            <header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
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
                        <NotificationBell />
                        <UserMenu user={finalUser} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Page Title & Back Nav */}
                {/* Page Title & Back Nav */}
                <div className="space-y-4">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2.5">
                            <span>👥</span>
                            <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
                                {t('title')}
                            </span>
                        </h1>
                        <p className="mt-2.5 text-base text-gray-500">
                            {t('headerDesc')}
                        </p>
                        <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* Group List (Left on Desktop, Top on Mobile) */}
                    <section className="flex-1 w-full">
                        {/* G1/G8: ハイライト + グループサマリー統合パネル */}
                        {sortedMemberships.length > 0 && (
                            <div className="bg-white midnight-solid-panel rounded-xl p-4 sm:p-5 border border-gray-100 shadow-sm mb-4">
                                {/* ハイライトバナー（全グループのTop3をコンパクト表示） */}
                                {topRankedGroups.length > 0 && (
                                    <div className="mb-3 p-2.5 rounded-lg bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide shrink-0">{t('todayHighlight')}</span>
                                            {topRankedGroups.map((m: any, i: number) => (
                                                <span key={m.groups.id} className="inline-flex items-center gap-1 text-sm font-bold text-gray-900">
                                                    <span>{m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : '🥉'}</span>
                                                    <span>{t('topRankedIn', { rank: m.rank, group: m.groups.name })}</span>
                                                    {i < topRankedGroups.length - 1 && <span className="text-gray-300 mx-0.5">|</span>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* グループサマリー */}
                                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <span className="text-lg">📊</span>
                                    {t('groupSummary')}
                                </h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-center p-2 bg-[var(--theme-primary-light)] rounded-lg">
                                        <div className="text-xl font-black text-[var(--theme-primary)]">{sortedMemberships.length}</div>
                                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{t('groupsJoined')}</div>
                                    </div>
                                    <div className="text-center p-2 bg-[var(--theme-primary-light)] rounded-lg">
                                        <div className="text-xl font-black text-[var(--theme-primary)]">{totalMembers}</div>
                                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{t('totalGroupMembers')}</div>
                                    </div>
                                    <div className="text-center p-2 bg-[var(--theme-primary-light)] rounded-lg">
                                        <div className="text-xl font-black text-[var(--theme-primary)]">
                                            {bestRank ? `#${bestRank}` : '—'}
                                        </div>
                                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{t('bestRank')}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mb-4">
                            <h2 className="text-lg font-bold text-gray-900">{t('yourGroups')}</h2>
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
                    <aside className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-24 space-y-4">
                        {/* Join / Create */}
                        <div>
                            <div className="flex items-center mb-4">
                                <h2 className="text-lg font-bold text-gray-900">{t('joinOrCreate')}</h2>
                            </div>
                            <div className="bg-[var(--theme-primary-light)] midnight-solid-panel rounded-xl p-6 border border-[var(--theme-primary)]/20">
                                {/* G4: イラスト風装飾 */}
                                <div className="flex justify-center mb-4">
                                    <div className="flex items-end gap-1">
                                        <div className="w-6 h-10 bg-[var(--theme-primary)]/15 rounded-t-full" />
                                        <div className="w-6 h-16 bg-[var(--theme-primary)]/25 rounded-t-full" />
                                        <div className="w-6 h-12 bg-[var(--theme-primary)]/20 rounded-t-full" />
                                        <div className="w-6 h-20 bg-[var(--theme-primary)]/30 rounded-t-full" />
                                        <div className="w-6 h-14 bg-[var(--theme-primary)]/20 rounded-t-full" />
                                    </div>
                                </div>
                                <div className="w-full">
                                    <GroupSettings />
                                </div>
                            </div>
                        </div>

                        {/* G5: グループ作成CTA */}
                        <Link
                            href="/groups/create"
                            className="block w-full p-4 rounded-xl bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] text-white text-center shadow-md hover:shadow-lg hover:scale-[1.02] transition-all group cursor-pointer"
                        >
                            <div className="text-2xl mb-1">🏃‍♂️</div>
                            <div className="font-bold text-sm">{t('createGroup')}</div>
                            <div className="text-xs text-white/80 mt-0.5">{t('createGroupDesc')}</div>
                        </Link>
                    </aside>
                </div>
            </div>
            <Footer />
        </main>
    );
}

