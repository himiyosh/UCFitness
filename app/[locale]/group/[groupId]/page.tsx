

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import GroupDetailLeaderboard from "@/components/GroupDetailLeaderboard";
import UserMenu from "@/components/UserMenu";
import GroupHeaderActions from "@/components/GroupHeaderActions";
import GroupSettingsLayout from "@/components/GroupSettingsLayout";
import Breadcrumbs from '@/components/Breadcrumbs';
import { getAllGroupRankings } from "@/lib/ranking-service";
import { getGroupCompetitionRankings } from "@/lib/group-ranking-service";
import JoinGroupPreview from "@/components/JoinGroupPreview";
import GroupAnalytics from "@/components/GroupAnalytics";
import { getAllGroupComparisonData } from "@/lib/group-comparison-service";

export const dynamic = 'force-dynamic';

export default async function GroupDetailPage(props: { params: Promise<{ groupId: string }> }) {
    const params = await props.params;
    const session = await auth();

    if (!session || !session.user) {
        redirect("/api/auth/signin");
    }

    const userId = (session.user as any).id;
    const userEmail = session.user.email;
    const { groupId } = params;

    // 0. Fetch Current User (to ensure fresh profile image/name)
    const { data: dbUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    // Construct user object for menu, preferring DB data
    const currentUser = dbUser ? {
        ...session.user,
        name: dbUser.name || session.user.name,
        image: dbUser.image || session.user.image,
        username: dbUser.username
    } : session.user;

    // 1. Fetch Group Details (Regardless of membership)
    const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

    if (groupError || !group) {
        return notFound();
    }

    // 2. Check Membership
    const { data: membership } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single();

    const isMember = !!membership;
    // @ts-ignore
    const isOwner = membership?.role === 'OWNER';

    // 3. Handle Non-Members -> Show Join Screen
    if (!isMember) {
        return (
            <main className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-indigo-50/80 backdrop-blur-md border-b border-indigo-100 sticky top-0 z-50">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Link href="/" className="flex items-center gap-2 group">
                                <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:opacity-80 transition-opacity">
                                    UCFitness
                                </h1>
                                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold tracking-wide uppercase border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
                                    Beta
                                </span>
                            </Link>
                        </div>
                        <div>
                            <UserMenu user={currentUser} />
                        </div>
                    </div>
                </header>

                <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
                    <div className="mb-6">
                        <Breadcrumbs
                            items={[
                                { label: 'Groups', href: '/groups' },
                                { label: group.name }
                            ]}
                        />
                    </div>
                    <JoinGroupPreview group={group} userId={userId} />
                </div>
            </main>
        );
    }

    // 2. Fetch Rankings
    const rankings = await getAllGroupRankings(groupId);

    // 3. Fetch Group Competition Rankings
    const [compDaily, compWeekly, compMonthly, compYearly] = await Promise.all([
        getGroupCompetitionRankings('DAILY'),
        getGroupCompetitionRankings('WEEKLY'),
        getGroupCompetitionRankings('MONTHLY'),
        getGroupCompetitionRankings('YEARLY'),
    ]);

    // 2.5 Fetch Comparison Data (New)
    const comparisonData = await getAllGroupComparisonData(groupId, userId);

    const groupCompetitionRankings = {
        DAILY: compDaily,
        WEEKLY: compWeekly,
        MONTHLY: compMonthly,
        YEARLY: compYearly
    };

    // 3. Fetch All Members for Management Panel
    const { data: members } = await supabase
        .from('group_members')
        .select(`
        user_id,
        role,
        users (
            id,
            name,
            email,
            image,
            username
        )
    `)
        .eq('group_id', groupId)
        .order('role', { ascending: false }); // Owner first

    return (
        <main className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-indigo-50/80 backdrop-blur-md border-b border-indigo-100 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:opacity-80 transition-opacity">
                                UCFitness
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold tracking-wide uppercase border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
                                Beta
                            </span>
                        </Link>
                    </div>
                    <div>
                        <UserMenu user={currentUser} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Back Nav & Badges */}
                <div className="flex items-center justify-between">
                    <Breadcrumbs
                        items={[
                            { label: 'Groups', href: '/groups' },
                            { label: group.name }
                        ]}
                    />
                    {isOwner && (
                        <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-100">
                            Owner
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
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50"></div>
                    )}

                    <div className="relative p-4 sm:p-8 w-full flex flex-col-reverse sm:flex-row items-end sm:items-end justify-between gap-4 sm:gap-6 z-10">
                        {/* Left: Icon + Text */}
                        <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto">
                            {/* Icon */}
                            <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-2xl border-2 sm:border-4 border-white shadow-xl overflow-hidden flex-shrink-0 bg-white flex items-center justify-center text-2xl sm:text-4xl font-black text-indigo-200">
                                {group.image_url ? (
                                    <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="bg-indigo-600 text-white w-full h-full flex items-center justify-center">
                                        {group.name.substring(0, 1).toUpperCase()}
                                    </span>
                                )}
                            </div>

                            {/* Text */}
                            <div className={`flex-1 ${group.header_image_url ? "text-white text-shadow-sm" : "text-gray-900"}`}>
                                <h1 className="text-2xl sm:text-4xl font-black tracking-tight mb-1 sm:mb-2 line-clamp-1">{group.name}</h1>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className={`px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-mono select-all flex items-center gap-2 ${group.header_image_url ? 'bg-white/20 text-white backdrop-blur-sm border border-white/30' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
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

                <div className="space-y-12">
                    {/* Main Content Area - Layout controlled by GroupAnalytics */}
                    <div>
                        <GroupAnalytics
                            rankings={rankings}
                            comparisonData={comparisonData}
                            groupCompetitionRankings={groupCompetitionRankings}
                            userEmail={userEmail}
                            currentGroupId={groupId}
                            currentUsername={session.user.name || undefined}
                            isPublic={group.is_public}
                            groupName={group.name}
                            groupImage={group.image_url}
                        >
                            <div className="p-4 sm:p-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-4 sticky top-0 bg-white/95 backdrop-blur-sm z-10 pb-2 border-b border-gray-100">Settings & Members</h2>
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
        </main>
    );
}

export const runtime = 'edge';
