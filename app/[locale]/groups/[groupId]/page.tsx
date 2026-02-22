export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import GroupDetailLeaderboard from "@/components/GroupDetailLeaderboard";
import UserMenu from "@/components/UserMenu";
import RefreshButton from '@/components/RefreshButton';
import GroupHeaderActions from "@/components/GroupHeaderActions";
import GroupSettingsLayout from "@/components/GroupSettingsLayout";
import Breadcrumbs from '@/components/Breadcrumbs';
import { getAllGroupRankings } from "@/lib/ranking-service";
import { enrichRankingsWithEquip } from "@/lib/ranking-utils";
import { getGroupCompetitionRankings } from "@/lib/group-ranking-service";
import JoinGroupPreview from "@/components/JoinGroupPreview";
import nextDynamic from 'next/dynamic';
import { getAllGroupComparisonData } from "@/lib/group-comparison-service";
import { getTranslations } from 'next-intl/server';
import Footer from '@/components/Footer';
import GroupEventList from "@/components/GroupEventList";
import GroupWeeklyReport from "@/components/GroupWeeklyReport";

// ⚡ パフォーマンス: 重いクライアントコンポーネントを遅延読み込み
const GroupAnalytics = nextDynamic(() => import('@/components/GroupAnalytics'));
const GroupGear = nextDynamic(() => import('@/components/GroupGear'));

export const dynamic = 'force-dynamic';

export default async function GroupDetailPage(props: { params: Promise<{ groupId: string }> }) {
    const params = await props.params;
    const session = await auth();

    if (!session || !session.user) {
        redirect("/api/auth/signin");
    }

    const userId = (session.user as any).id;
    const { groupId } = params;

    // ⚡ パフォーマンス: 翻訳取得を並列化
    const [dashboardT, groupsT, detailT] = await Promise.all([
        getTranslations('Dashboard'),
        getTranslations('Groups'),
        getTranslations('GroupDetail'),
    ]);

    // ⚡ パフォーマンス: 3つの独立クエリを並列実行
    const [userResult, groupResult, membershipResult] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('id, name, image, username')
            .eq('id', userId)
            .single(),
        supabaseAdmin
            .from('groups')
            .select('id, name, keyword, description, is_public, header_image_url, image_url, created_at, created_by')
            .eq('id', groupId)
            .single(),
        supabaseAdmin
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .single(),
    ]);

    const dbUser = userResult.data;
    const group = groupResult.data;
    const groupError = groupResult.error;
    const membership = membershipResult.data;

    if (!dbUser?.username) {
        redirect('/setup');
    }

    // Construct user object for menu, preferring DB data
    const currentUser = dbUser ? {
        ...session.user,
        name: dbUser.name || session.user.name,
        image: dbUser.image || session.user.image,
        username: dbUser.username
    } : session.user;

    if (groupError || !group) {
        return notFound();
    }

    const isMember = !!membership;
    // @ts-ignore
    const isOwner = membership?.role === 'OWNER';
    const isOwnerOrAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN';

    // 3. Handle Non-Members -> Show Join Screen
    if (!isMember) {
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
                            <UserMenu user={currentUser} />
                        </div>
                    </div>
                </header>

                <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
                    <div className="mb-6">
                        <Breadcrumbs
                            items={[
                                { label: groupsT('title'), href: '/groups' },
                                { label: group.name }
                            ]}
                        />
                    </div>
                    <JoinGroupPreview group={group} userId={userId} />
                </div>
                <Footer />
            </main>
        );
    }

    // ⚡ パフォーマンス: ランキング・コンペ・比較データ・メンバーを並列実行
    const [rawRankings, compDaily, compWeekly, compMonthly, compYearly, comparisonData, membersResult] = await Promise.all([
        getAllGroupRankings(groupId),
        getGroupCompetitionRankings('DAILY'),
        getGroupCompetitionRankings('WEEKLY'),
        getGroupCompetitionRankings('MONTHLY'),
        getGroupCompetitionRankings('YEARLY'),
        getAllGroupComparisonData(groupId, userId),
        supabaseAdmin
            .from('group_members')
            .select(`
            user_id,
            role,
            users (
                id,
                name,
                image,
                username
            )
        `)
            .eq('group_id', groupId)
            .order('role', { ascending: false }),
    ]);

    const rankings = await enrichRankingsWithEquip(rawRankings);
    // Supabase の group_members → users は多対一リレーション（単一オブジェクト返却）だが
    // 型推論では配列として推論されるため、実際の型にキャスト
    const members = membersResult.data as Array<{
        user_id: string;
        role: 'OWNER' | 'MEMBER';
        users: {
            id: string;
            name: string | null;
            image: string | null;
            username: string | null;
        };
    }> | null;

    const groupCompetitionRankings = {
        DAILY: compDaily,
        WEEKLY: compWeekly,
        MONTHLY: compMonthly,
        YEARLY: compYearly
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
                        <UserMenu user={currentUser} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Back Nav & Badges */}
                <div className="flex items-center justify-between">
                    <Breadcrumbs
                        items={[
                            { label: groupsT('title'), href: '/groups' },
                            { label: group.name }
                        ]}
                    />
                    {isOwner && (
                        <span className="bg-[var(--theme-primary-light)] text-[var(--theme-primary)] px-3 py-1 rounded-full text-xs font-bold border border-[var(--theme-primary)]/20">
                            {detailT('owner')}
                        </span>
                    )}
                </div>

                {/* Group Info Card / Hero */}
                <section className="relative overflow-hidden rounded-2xl border border-gray-200 shadow-lg bg-white group min-h-[140px] sm:min-h-[200px] flex items-end">
                    {/* Header Background */}
                    {group.header_image_url ? (
                        <div className="absolute inset-0">
                            <img src={group.header_image_url} alt="Header" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10"></div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--theme-primary-light)] to-[var(--theme-secondary)]/20"></div>
                    )}

                    <div className="relative p-4 sm:p-8 w-full flex flex-col-reverse sm:flex-row items-end sm:items-end justify-between gap-4 sm:gap-6 z-10">
                        {/* Left: Icon + Text */}
                        <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto">
                            {/* Icon */}
                            <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-2xl border-2 sm:border-4 border-white shadow-xl overflow-hidden flex-shrink-0 bg-white flex items-center justify-center text-2xl sm:text-4xl font-black text-[var(--theme-primary)]/30">
                                {group.image_url ? (
                                    <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="bg-[var(--theme-primary)] text-white w-full h-full flex items-center justify-center">
                                        {group.name.substring(0, 1).toUpperCase()}
                                    </span>
                                )}
                            </div>

                            {/* Text */}
                            <div className={`flex-1 ${group.header_image_url ? "text-white text-shadow-sm" : "text-gray-900"}`}>
                                <h1 className="text-2xl sm:text-4xl font-black tracking-tight mb-1 sm:mb-2 line-clamp-1">{group.name}</h1>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className={`px-2 py-0.5 sm:py-1 rounded text-xs font-mono select-all flex items-center gap-2 ${group.header_image_url ? 'bg-white/20 text-white backdrop-blur-sm border border-white/30' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                                        <span className="opacity-70">ID:</span>
                                        <span className="font-bold">{group.keyword}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="w-full sm:w-auto flex flex-col items-end gap-2 shrink-0 sm:relative">
                            <GroupHeaderActions group={group} isOwner={isOwner} />
                        </div>
                    </div>
                </section>

                {/* グループイベント + メンバーの愛用ギア */}
                <div className="flex flex-col gap-6">
                    <section>
                        <GroupEventList groupId={groupId} isOwnerOrAdmin={isOwnerOrAdmin} />
                    </section>
                    <section>
                        <GroupGear groupId={groupId} userId={userId} />
                    </section>
                </div>

                {/* ウィークリーレポート */}
                <GroupWeeklyReport groupId={groupId} />

                <div className="space-y-12">
                    {/* Main Content Area - Layout controlled by GroupAnalytics */}
                    <div>
                        <GroupAnalytics
                            rankings={rankings}
                            comparisonData={comparisonData}
                            groupCompetitionRankings={groupCompetitionRankings}
                            userId={userId}
                            currentGroupId={groupId}
                            currentUsername={dbUser?.name || session.user.name || undefined}
                            isPublic={group.is_public}
                            groupName={group.name}
                            groupImage={group.image_url}
                        >
                            <div className="p-4 sm:p-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-4 sticky top-0 bg-white/95 backdrop-blur-sm z-10 pb-2 border-b border-gray-100">{detailT('settingsMembers')}</h2>
                                <GroupSettingsLayout
                                    members={members || []}
                                    group={group}
                                    isOwner={isOwner}
                                    currentUserId={userId}
                                />
                            </div>
                        </GroupAnalytics>
                    </div>
                </div>

            </div>
            <Footer />
        </main>
    );
}

