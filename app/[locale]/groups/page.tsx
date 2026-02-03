

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import GroupList from "@/components/GroupList";
import UserMenu from "@/components/UserMenu";
import GroupSettings from "@/components/GroupSettings";
import Breadcrumbs from '@/components/Breadcrumbs';

export const dynamic = 'force-dynamic';

import { getAllGroupRankings } from "@/lib/ranking-service";
import { getTranslations } from "next-intl/server";

// ... imports ...

export default async function MyGroupsPage() {
    const session = await auth();

    if (!session || !session.user) {
        redirect("/api/auth/signin");
    }

    const userId = (session.user as any).id;
    const userEmail = session.user.email;

    // Fetch User's Group Preference and Custom Image
    // Fetch User's Group Preference and Custom Image
    const { data: userData } = await supabase
        .from('users')
        .select('name, group_keyword, image')
        .eq('id', userId)
        .single();

    // Ensure it's an array
    const groupOrder = Array.isArray(userData?.group_keyword)
        ? userData?.group_keyword
        : (userData?.group_keyword ? [userData.group_keyword] : []);

    // Fetch User's Groups
    const { data: memberships } = await supabase
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
        .eq('user_id', userId);

    // Normalize memberships (Handle array vs object for joined table)
    const normalizedMemberships = (memberships || []).map((m: any) => ({
        ...m,
        groups: Array.isArray(m.groups) ? m.groups[0] : m.groups
    }));

    // Fetch Rankings for each group to get "My Rank"
    const membershipsWithRank = await Promise.all(normalizedMemberships.map(async (m: any) => {
        // Optimization: We could perhaps fetch only WEEKLY but the service fetches all.
        // Ideally we cache this or use a lighter query, but for now we follow the plan.
        const rankings = await getAllGroupRankings(m.groups.id);
        const weeklyRankings = rankings['WEEKLY'];
        const myRankIndex = weeklyRankings.findIndex((r: any) => r.users.email === userEmail);

        return {
            ...m,
            rank: myRankIndex !== -1 ? myRankIndex + 1 : null,
            totalMembers: weeklyRankings.length
        };
    }));

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
        return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
    });

    const t = await getTranslations('Groups');

    // Use custom image if available, otherwise fallback to session image
    const finalUser = {
        ...session.user,
        name: userData?.name || session.user.name,
        image: userData?.image || session.user.image,
    };

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
                        <UserMenu user={finalUser} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Page Title & Back Nav */}
                {/* Page Title & Back Nav */}
                <div className="space-y-4">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                    <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
                </div>

                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* Group List (Left on Desktop, Top on Mobile) */}
                    <section className="flex-1 w-full">
                        <div className="flex items-center justify-between mb-4">
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
                    <aside className="w-full lg:w-80 flex-shrink-0 sticky top-24">
                        <div className="flex items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-900">{t('joinOrCreate')}</h2>
                        </div>
                        <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
                            <div className="w-full">
                                <GroupSettings />
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}

export const runtime = 'edge';
