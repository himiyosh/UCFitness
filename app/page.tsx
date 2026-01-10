import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import AuthButtons from '@/components/AuthButtons';
import RefreshButton from '@/components/RefreshButton';
import GroupSettings from '@/components/GroupSettings';
import UserMenu from '@/components/UserMenu';
import GroupRankingPanel from '@/components/GroupRankingPanel';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDisplayRankings } from '@/lib/ranking-utils';

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
  const { displayRankings: filteredGlobalRankings } = getDisplayRankings(globalRankings, userEmail);

  // Fetch Group Leaderboards
  type GroupRankingData = { keyword: string; neighbors: any[] };
  const groupRankingsList: GroupRankingData[] = [];

  for (const keyword of groupKeywords) {
    const rankings = await getRankings('GROUP', keyword);
    const { displayRankings: filteredRankings } = getDisplayRankings(rankings, userEmail);

    groupRankingsList.push({ keyword, neighbors: filteredRankings });
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Rich Header */}
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
          <div className="flex gap-4 items-center">
            <RefreshButton />
            {session?.user ? (
              <UserMenu user={session.user} />
            ) : (
              <AuthButtons />
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Top section moved to columns below */}

        {/* MAIN LAYOUT CONTAINER */}
        <div className="flex flex-col gap-8">

          {/* TOP SECTION: Stats & Motivation (Equal Height on Desktop) */}
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8">
            {/* My Stats Panel (Left: 5 cols) */}
            {session && (
              <div className="lg:col-span-5 flex flex-col h-full overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-center h-full">
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

            {/* Motivation / Status (Right: 7 cols) */}
            {session && (
              <div className="lg:col-span-7 flex flex-col justify-center h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
                <h4 className="font-bold text-lg mb-2">Keep Stepping!</h4>
                <p className="opacity-90 text-sm">Every step counts differently in every group!</p>
              </div>
            )}
          </div>

          {/* BOTTOM SECTION: Leaderboards */}
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">

            {/* Global Leaderboard (Mobile: Order 2, Desktop: Left 5 cols) */}
            <div className="lg:col-span-5 order-2 lg:order-1 overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-base font-bold text-gray-900">
                  Global Leaderboard
                </h3>
                <span className="bg-gray-100 text-gray-600 py-1 px-2 rounded text-xs font-semibold">Top 3 & Neighbors</span>
              </div>
              <div className="bg-white px-0">
                <ul role="list" className="divide-y divide-gray-50">
                  {(() => {
                    if ((globalRankings as any[]).length === 0) {
                      return <p className="text-gray-500 text-center py-8">No data available yet.</p>;
                    }

                    return filteredGlobalRankings.map((entry: any, index: number) => {
                      const isGap = index > 0 && entry.originalRank > filteredGlobalRankings[index - 1].originalRank + 1;

                      // Spacer row for gap
                      if (isGap) {
                        return (
                          <div key={`gap-${index}`} className="px-6 py-2 bg-gray-50 flex justify-center border-b border-gray-50">
                            <span className="text-gray-400 text-xs tracking-widest">•••</span>
                          </div>
                        );
                      }

                      return (
                        <li key={entry.originalRank} className={`px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${entry.users.email === userEmail ? 'bg-indigo-50/50' : ''}`}>
                          <div className="flex items-center gap-4">
                            <span className={`
                                            flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
                                            ${entry.originalRank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                entry.originalRank === 2 ? 'bg-gray-100 text-gray-700' :
                                  entry.originalRank === 3 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}
                                        `}>
                              {entry.originalRank}
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
                                {entry.users.email === userEmail && <span className="ml-2 text-xs text-indigo-600 font-bold">(YOU)</span>}
                              </p>

                            </div>
                          </div>
                          <div className="font-mono font-semibold text-indigo-600">
                            {entry.steps.toLocaleString()}
                          </div>
                        </li>
                      );
                    });
                  })()}
                </ul>
              </div>
            </div>


            {/* Right Column Stack (Mobile: Order 1, Desktop: Right 7 cols) */}
            <div className="lg:col-span-7 order-1 lg:order-2 space-y-6">

              {/* Group Leaderboards */}
              {groupRankingsList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
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
      </div>
    </main>
  );
}
