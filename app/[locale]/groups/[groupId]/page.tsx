export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { createLoginRequiredRedirect } from "@/lib/auth-redirect";
import {
    getJSTDateString,
    getMonthStartDate,
    getWeekStartDate,
    getYearStartDate,
} from "@/lib/date-utils";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { notFound, redirect } from "next/navigation";
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import GroupHeaderActions from "@/components/group/GroupHeaderActions";
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import { getAllGroupRankings } from "@/lib/services/ranking-service";
import {
    createUnavailableViewerRankingActivities,
    enrichRankingsWithEquip,
    getViewerRankingActivities,
    isRankingPeriod,
} from "@/lib/services/ranking-utils";
import { getGroupCompetitionRankings } from "@/lib/services/group-ranking-service";
import JoinGroupPreview from "@/components/group/JoinGroupPreview";
import { getAllGroupComparisonData } from "@/lib/services/group-comparison-service";
import { getLocale, getTranslations } from 'next-intl/server';
import Footer from '@/components/layout/Footer';
import GroupEventList from "@/components/group/GroupEventList";
import GroupWeeklyReport from "@/components/group/GroupWeeklyReport";
import DeferredGroupChat, {
    DeferredGroupGear,
} from '@/components/group/DeferredGroupSections';
import GroupAnalytics from '@/components/group/GroupAnalytics';

import type { Period } from '@/components/dashboard/LeaderboardTabs';
import type { ChartData } from '@/lib/services/group-comparison-service';
import type { GroupRankingEntry } from '@/lib/services/group-ranking-service';
import type {
    RankingEntry,
    ViewerRankingActivities,
} from '@/lib/services/ranking-utils';

export const dynamic = 'force-dynamic';

interface GroupDetailPageProps {
    params: Promise<{ groupId: string }>;
    searchParams: Promise<{ period?: string | string[] }>;
}

interface CapturedGroupDependency<T> {
    data: T | null;
    failed: boolean;
}

interface GroupMember {
    user_id: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
    users: {
        id: string;
        name: string | null;
        image: string | null;
        username: string | null;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeGroupMember(value: unknown): GroupMember | null {
    if (
        !isRecord(value)
        || typeof value.user_id !== 'string'
        || (value.role !== 'OWNER' && value.role !== 'ADMIN' && value.role !== 'MEMBER')
    ) {
        return null;
    }
    const relation = Array.isArray(value.users) ? value.users[0] : value.users;
    if (!isRecord(relation) || typeof relation.id !== 'string') {
        return null;
    }
    return {
        user_id: value.user_id,
        role: value.role,
        users: {
            id: relation.id,
            name: typeof relation.name === 'string' ? relation.name : null,
            image: typeof relation.image === 'string' ? relation.image : null,
            username: typeof relation.username === 'string' ? relation.username : null,
        },
    };
}

async function captureGroupDependency<T>(
    operation: string,
    userId: string,
    groupId: string,
    promise: Promise<T>,
): Promise<CapturedGroupDependency<T>> {
    try {
        return { data: await promise, failed: false };
    } catch (error: unknown) {
        reportError(operation, error, { userId, groupId });
        return { data: null, failed: true };
    }
}

function createEmptyComparisonData(): Record<Period, ChartData> {
    return {
        DAILY: { data: [], users: [] },
        WEEKLY: { data: [], users: [] },
        MONTHLY: { data: [], users: [] },
        YEARLY: { data: [], users: [] },
    };
}

async function getViewerGroupRankingActivities(userId: string): Promise<ViewerRankingActivities> {
    const today = getJSTDateString();
    const { data, error } = await supabaseAdmin
        .from('daily_steps')
        .select('date, steps')
        .eq('user_id', userId)
        .gte('date', getYearStartDate(today))
        .lte('date', today);

    if (error) throw error;

    return getViewerRankingActivities(data ?? [], {
        DAILY: today,
        WEEKLY: getWeekStartDate(today),
        MONTHLY: getMonthStartDate(today),
        YEARLY: getYearStartDate(today),
    });
}

const EMPTY_RANKINGS: Record<Period, RankingEntry[]> = {
    DAILY: [],
    WEEKLY: [],
    MONTHLY: [],
    YEARLY: [],
};

export default async function GroupDetailPage(props: GroupDetailPageProps): Promise<React.ReactNode> {
    const [params, resolvedSearchParams] = await Promise.all([
        props.params,
        props.searchParams,
    ]);
    const [session, locale] = await Promise.all([auth(), getLocale()]);

    if (!session?.user?.id) {
        const requestedPeriod = typeof resolvedSearchParams.period === 'string'
            ? resolvedSearchParams.period
            : null;
        const groupPath = `/groups/${encodeURIComponent(params.groupId)}`;
        const nextPath = isRankingPeriod(requestedPeriod)
            ? `${groupPath}?period=${requestedPeriod}`
            : groupPath;
        redirect(createLoginRequiredRedirect(locale, nextPath));
    }

    const userId = session.user.id;
    const { groupId } = params;

    // ⚡ パフォーマンス: 翻訳取得を並列化
    const [dashboardT, groupsT, detailT, gearT] = await Promise.all([
        getTranslations('Dashboard'),
        getTranslations('Groups'),
        getTranslations('GroupDetail'),
        getTranslations('GroupGear'),
    ]);

    // ⚡ パフォーマンス: 3つの独立クエリを並列実行
    const [userResult, groupResult, membershipResult, memberCountResult] = await Promise.all([
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
        supabaseAdmin
            .from('group_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('group_id', groupId),
    ]);

    const dbUser = userResult.data;
    const group = groupResult.data;
    const groupError = groupResult.error;
    const membership = membershipResult.data;

    if (userResult.error) {
        reportError('groups/detail:user', userResult.error, { userId, groupId });
        throw new Error('Failed to load user');
    }
    if (groupError && groupError.code !== 'PGRST116') {
        reportError('groups/detail:group', groupError, { userId, groupId });
        throw new Error('Failed to load group');
    }
    if (membershipResult.error && membershipResult.error.code !== 'PGRST116') {
        reportError('groups/detail:membership', membershipResult.error, { userId, groupId });
        throw new Error('Failed to load membership');
    }
    if (memberCountResult.error) {
        reportError('groups/detail:member-count', memberCountResult.error, { userId, groupId });
    }
    const memberCount = memberCountResult.error ? null : memberCountResult.count;

    if (!dbUser?.username) {
        redirect('/setup');
    }

    // Construct user object for menu, preferring DB data
    const currentUser = {
        ...session.user,
        name: dbUser.name || session.user.name,
        image: dbUser.image || session.user.image,
        username: dbUser.username,
    };

    if (!group) {
        return notFound();
    }

    const isMember = !!membership;
    const isOwner = membership?.role === 'OWNER';
    const isOwnerOrAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN';

    if (!isMember && !group.is_public) {
        return notFound();
    }

    // 3. Handle Non-Members -> Show Join Screen
    if (!isMember) {
        return (
            <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
                <AuthenticatedPageHeader
                    appTitle={dashboardT('title')}
                    betaLabel={dashboardT('beta')}
                    contextLabel={group.name}
                    user={currentUser}
                />

                <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
                    <div className="mb-6">
                        <Breadcrumbs
                            items={[
                                { label: groupsT('title'), href: '/groups' },
                                { label: group.name }
                            ]}
                        />
                    </div>
                    <JoinGroupPreview
                        group={{
                            name: group.name,
                            keyword: group.keyword,
                            description: group.description,
                            image_url: group.image_url,
                            header_image_url: group.header_image_url,
                        }}
                        memberCount={memberCount}
                    />
                </div>
                <Footer />
            </main>
        );
    }

    // ランキング・比較・メンバーを個別の障害境界で並列取得
    const [
        rawRankingsState,
        compDailyState,
        compWeeklyState,
        compMonthlyState,
        compYearlyState,
        comparisonState,
        viewerRankingActivitiesState,
        membersResult,
    ] = await Promise.all([
        captureGroupDependency('groups/detail:rankings', userId, groupId, getAllGroupRankings(groupId)),
        group.is_public
            ? captureGroupDependency('groups/detail:competition-daily', userId, groupId, getGroupCompetitionRankings('DAILY'))
            : Promise.resolve<CapturedGroupDependency<GroupRankingEntry[]>>({ data: [], failed: false }),
        group.is_public
            ? captureGroupDependency('groups/detail:competition-weekly', userId, groupId, getGroupCompetitionRankings('WEEKLY'))
            : Promise.resolve<CapturedGroupDependency<GroupRankingEntry[]>>({ data: [], failed: false }),
        group.is_public
            ? captureGroupDependency('groups/detail:competition-monthly', userId, groupId, getGroupCompetitionRankings('MONTHLY'))
            : Promise.resolve<CapturedGroupDependency<GroupRankingEntry[]>>({ data: [], failed: false }),
        group.is_public
            ? captureGroupDependency('groups/detail:competition-yearly', userId, groupId, getGroupCompetitionRankings('YEARLY'))
            : Promise.resolve<CapturedGroupDependency<GroupRankingEntry[]>>({ data: [], failed: false }),
        captureGroupDependency('groups/detail:comparison', userId, groupId, getAllGroupComparisonData(groupId, userId)),
        captureGroupDependency(
            'groups/detail:viewer-ranking-activity',
            userId,
            groupId,
            getViewerGroupRankingActivities(userId),
        ),
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
    if (membersResult.error) {
        reportError('groups/detail:members', membersResult.error, { userId, groupId });
    }
    const enrichedRankingsState = rawRankingsState.data
        ? await captureGroupDependency(
            'groups/detail:ranking-equipment',
            userId,
            groupId,
            enrichRankingsWithEquip(rawRankingsState.data),
        )
        : { data: null, failed: rawRankingsState.failed };
    const rankings = enrichedRankingsState.data ?? EMPTY_RANKINGS;
    const rankingsUnavailable = rawRankingsState.failed || enrichedRankingsState.failed;
    const viewerRankingActivities = viewerRankingActivitiesState.data
        ?? createUnavailableViewerRankingActivities();
    const competitionUnavailableByPeriod: Record<Period, boolean> = {
        DAILY: compDailyState.failed,
        WEEKLY: compWeeklyState.failed,
        MONTHLY: compMonthlyState.failed,
        YEARLY: compYearlyState.failed,
    };
    const competitionUnavailable = Object.values(competitionUnavailableByPeriod).some(Boolean);
    const comparisonUnavailable = comparisonState.failed;
    const membersUnavailable = Boolean(membersResult.error);
    const normalizedMembers = (membersResult.data ?? []).map(normalizeGroupMember);
    const membersIncomplete = !membersUnavailable
        && normalizedMembers.some((member) => member === null);
    if (membersIncomplete) {
        reportError(
            'groups/detail:members-shape',
            new Error('Unexpected group member response shape'),
            { userId, groupId },
        );
    }
    const members = normalizedMembers.filter(
        (member): member is GroupMember => member !== null,
    );

    const groupCompetitionRankings = {
        DAILY: compDailyState.data ?? [],
        WEEKLY: compWeeklyState.data ?? [],
        MONTHLY: compMonthlyState.data ?? [],
        YEARLY: compYearlyState.data ?? [],
    };
    const comparisonData = comparisonState.data ?? createEmptyComparisonData();

    return (
        <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
            <AuthenticatedPageHeader
                appTitle={dashboardT('title')}
                betaLabel={dashboardT('beta')}
                contextLabel={group.name}
                user={currentUser}
            />

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
                {(membersUnavailable || membersIncomplete) && (
                    <p
                        role="status"
                        className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text)]"
                    >
                        {detailT('memberDataUnavailable')}
                    </p>
                )}
                {memberCount === null && (
                    <p
                        role="status"
                        className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text)]"
                    >
                        {groupsT('memberCountUnavailable')}
                    </p>
                )}

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
                            <div className={`min-w-0 flex-1 ${group.header_image_url ? "text-white text-shadow-sm" : "text-gray-900"}`}>
                                <h1 className="text-2xl sm:text-4xl font-black tracking-tight mb-1 sm:mb-2 line-clamp-1">{group.name}</h1>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className={`flex max-w-full min-w-0 items-center gap-2 rounded px-2 py-0.5 text-xs font-mono select-all sm:py-1 ${group.header_image_url ? 'bg-white/20 text-white backdrop-blur-sm border border-white/30' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                                        <span className="opacity-70">ID:</span>
                                        <span className="min-w-0 break-all font-bold">{group.keyword}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="w-full sm:w-auto flex flex-col items-end gap-2 shrink-0 sm:relative">
                            <GroupHeaderActions
                                group={group}
                                isOwner={isOwner}
                                canCreateInviteLinks={isOwnerOrAdmin}
                                members={members}
                                membersUnavailable={membersUnavailable}
                                membersIncomplete={membersIncomplete}
                                currentUserId={userId}
                            />
                        </div>
                    </div>
                </section>

                {rankingsUnavailable && (
                    <p
                        role="status"
                        className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text)]"
                    >
                        {detailT('rankingsUnavailable')}
                    </p>
                )}
                {comparisonUnavailable && (
                    <p
                        role="status"
                        className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text)]"
                    >
                        {detailT('comparisonUnavailable')}
                    </p>
                )}
                {competitionUnavailable && (
                    <p
                        role="status"
                        className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text)]"
                    >
                        {detailT('competitionUnavailable')}
                    </p>
                )}

                <GroupAnalytics
                    rankings={rankings}
                    comparisonData={comparisonData}
                    groupCompetitionRankings={groupCompetitionRankings}
                    rankingsUnavailable={rankingsUnavailable}
                    comparisonUnavailable={comparisonUnavailable}
                    competitionUnavailableByPeriod={competitionUnavailableByPeriod}
                    viewerRankingActivities={viewerRankingActivities}
                    userId={userId}
                    currentGroupId={groupId}
                    currentUsername={dbUser?.name || session.user.name || undefined}
                    isPublic={group.is_public}
                    groupName={group.name}
                    groupImage={group.image_url}
                />

                {/* グループイベント + グループチャット（横並び） */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    <section className="flex">
                        <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow w-full p-4">
                            <GroupEventList groupId={groupId} isOwnerOrAdmin={isOwnerOrAdmin} />
                        </div>
                    </section>
                    <section className="flex">
                        <DeferredGroupChat groupId={groupId} currentUserId={userId} />
                    </section>
                </div>

                {/* メンバーの愛用ギア */}
                <section
                    id="group-gear"
                    tabIndex={-1}
                    aria-labelledby="group-gear-title"
                    className="scroll-mt-24 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-reward)] focus-visible:ring-offset-2"
                >
                    <h2 id="group-gear-title" className="sr-only">{gearT('title')}</h2>
                    <DeferredGroupGear groupId={groupId} userId={userId} />
                </section>

                {/* ウィークリーレポート */}
                <GroupWeeklyReport groupId={groupId} />

            </div>
            <Footer />
        </main>
    );
}
