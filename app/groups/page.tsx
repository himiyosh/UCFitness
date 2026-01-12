
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import GroupSettings from "@/components/GroupSettings";
import UserMenu from "@/components/UserMenu";

export const dynamic = 'force-dynamic';

export default async function MyGroupsPage() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        redirect("/api/auth/signin");
    }

    const userId = (session.user as any).id;

    // Fetch User's Groups with Member Count (optional, hard to do in one query without join aggregate)
    // Let's just fetch basic group info first
    const { data: memberships } = await supabase
        .from('group_members')
        .select(`
      role,
      joined_at,
      groups (
        id,
        name,
        keyword,
        created_at,
        owner_id
      )
    `)
        .eq('user_id', userId)
        .order('joined_at', { ascending: false });

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
                        <UserMenu user={session.user} />
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Page Title & Back Nav */}
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-gray-900">My Groups</h1>
                </div>

                {/* Join / Create Section */}
                <section>
                    <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
                        <h2 className="text-lg font-bold text-indigo-900 mb-2">Join or Create a Group</h2>
                        <div className="max-w-md">
                            <GroupSettings />
                        </div>
                    </div>
                </section>

                {/* Group List */}
                <section>
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Your Groups</h2>

                    {!memberships || memberships.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                            <p className="text-gray-500">You haven't joined any groups yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {memberships.map((m: any) => (
                                <Link
                                    key={m.groups.id}
                                    href={`/group/${m.groups.id}`}
                                    className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="h-10 w-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
                                            {m.groups.name.substring(0, 1).toUpperCase()}
                                        </div>
                                        {m.role === 'OWNER' && (
                                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                Owner
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 truncate">
                                        {m.groups.name}
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Keyword: <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">{m.groups.keyword}</code>
                                    </p>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
