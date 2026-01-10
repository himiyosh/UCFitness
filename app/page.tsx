import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import AuthButtons from '@/components/AuthButtons';
import RefreshButton from '@/components/RefreshButton';
import GroupSettings from '@/components/GroupSettings';
import UserMenu from '@/components/UserMenu';
import GroupRankingPanel from '@/components/GroupRankingPanel';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

const getRankings = async (scope: 'GLOBAL' | 'GROUP', groupKeyword?: string) => {
  const today = new Date().toISOString().split('T')[0];

  let query = supabase
    .from('daily_steps')
    .select(`
      steps,
      users!inner (
        name,
        image,
        email,
        group_keyword
      )
    `)
    .eq('date', today)
    .order('steps', { ascending: false });

  if (scope === 'GROUP' && groupKeyword) {
    // Check if array column contains the keyword.
    // PostgREST: group_keyword.cs.{"value"}
    query = query.filter('users.group_keyword', 'cs', `{"${groupKeyword}"}`);
  }

  const { data: dailySteps, error } = await query;

  if (error) {
    console.error(`Error fetching ${scope} rankings for group ${groupKeyword}:`, error);
    return [];
  }

  return dailySteps || [];
};

export default async function Home() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  let groupKeywords: string[] = [];
  let mySteps = 0;
  let yesterdaySteps = 0;

  if (session?.user && (session.user as any).id) {
    // Fetch current user's group keywords
    const { data: userData } = await supabase
      .from('users')
      .select('group_keyword')
      .eq('id', (session.user as any).id)
      .single();

    groupKeywords = userData?.group_keyword || [];

    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('daily_steps')
      .select('steps')
      .eq('user_id', (session.user as any).id)
      .eq('date', today)
      .single();
    mySteps = data?.steps || 0;

    // Fetch yesterday's steps
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    const { data: yesterdayData } = await supabase
      .from('daily_steps')
      .select('steps')
      .eq('user_id', (session.user as any).id)
      .eq('date', yesterday)
      .single();

    yesterdaySteps = yesterdayData?.steps || 0;
    const diff = mySteps - yesterdaySteps;
  }

  // Fetch Global Leaderboard
  const globalRankings = await getRankings('GLOBAL');

  // Fetch Group Leaderboards
  type GroupRankingData = { keyword: string; neighbors: any[] };
  const groupRankingsList: GroupRankingData[] = [];

  for (const keyword of groupKeywords) {
    const rankings = await getRankings('GROUP', keyword);
    // Find my index
    const userIndex = rankings.findIndex(r => (r.users as any).email === userEmail);
    let neighbors: any[] = [];

    if (userIndex !== -1) {
      const start = Math.max(0, userIndex - 2);
      const end = Math.min(rankings.length, userIndex + 3);
      neighbors = rankings.slice(start, end).map((r, i) => ({
        ...r,
        originalRank: start + i + 1
      }));
    } else {
      // Not in top list or just fallback
      neighbors = rankings.slice(0, 5).map((r, i) => ({ ...r, originalRank: i + 1 }));
    }
    groupRankingsList.push({ keyword, neighbors });
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Step Competition</h1>
          <div className="flex gap-4 items-center">
            <RefreshButton />
            {session?.user ? (
              <UserMenu user={session.user} />
            ) : (
              <AuthButtons />
            )}
          </div>
        </div>

        {/* Top section moved to columns below */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* LEFT COLUMN */}
          <div className="space-y-6">
            {/* My Stats Panel */}
            {session && (
              <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">My Stats</h3>
                    <p className="text-sm text-gray-500">Today's steps</p>
                    <p className={`text-xs font-medium mt-1 ${mySteps - yesterdaySteps >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {mySteps - yesterdaySteps >= 0 ? '↑' : '↓'} {Math.abs(mySteps - yesterdaySteps).toLocaleString()} vs yesterday
                    </p>
                  </div>
                  <div className="text-4xl font-extrabold text-indigo-600">
                    {mySteps.toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* Global Leaderboard */}
            <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-base font-bold text-gray-900">
                  Global Leaderboard
                </h3>
                <span className="bg-gray-100 text-gray-600 py-1 px-2 rounded text-xs font-semibold">Top 100</span>
              </div>
              <div className="bg-white px-0">
                <ul role="list" className="divide-y divide-gray-50">
                  {globalRankings.slice(0, 100).map((entry: any, index: number) => (
                    <li key={index} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className={`
                            flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
                            ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                            index === 1 ? 'bg-gray-100 text-gray-700' :
                              index === 2 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}
                        `}>
                          {index + 1}
                        </span>
                        {entry.users?.image ? (
                          <img className="h-10 w-10 rounded-full border border-gray-100" src={entry.users.image} alt="" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                            {(entry.users?.name || '?')[0]}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {entry.users?.name || entry.users?.email}
                          </p>
                          {entry.users?.group_keyword && Array.isArray(entry.users.group_keyword) && entry.users.group_keyword.length > 0 && (
                            <span className="text-xs text-gray-400">Grp: {entry.users.group_keyword.join(', ')}</span>
                          )}
                        </div>
                      </div>
                      <div className="font-mono font-semibold text-indigo-600">
                        {entry.steps.toLocaleString()}
                      </div>
                    </li>
                  ))}
                  {globalRankings.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No data available yet.</p>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            {/* Motivation / Status */}
            {session && (
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
                <h4 className="font-bold text-lg mb-2">Keep Stepping!</h4>
                <p className="opacity-90 text-sm">Every step counts differently in every group!</p>
              </div>
            )}

            {/* Join Group Panel moved to bottom */}

            {/* Group Leaderboards (Neighbors) */}
            {/* Group Leaderboards (Neighbors) */}
            {groupRankingsList.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {groupRankingsList.map((groupData, index) => (
                  <GroupRankingPanel
                    key={groupData.keyword}
                    keyword={groupData.keyword}
                    neighbors={groupData.neighbors}
                    userEmail={userEmail}
                    index={index}
                    totalCount={groupRankingsList.length}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-500">
                Join your first group to see rankings here!
              </div>
            )}

            {/* Join Group Panel */}
            {session && <GroupSettings />}
          </div>
        </div>
      </div>
    </main>
  );
}
