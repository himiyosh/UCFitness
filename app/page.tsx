import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import AuthButtons from '@/components/AuthButtons';
import RefreshButton from '@/components/RefreshButton';
import UserMenu from '@/components/UserMenu';
import { auth } from "@/lib/auth";
import { getAllRankings, getAllGroupRankings, getBatchGroupRankings } from '@/lib/ranking-service';
import { getGroupCompetitionRankings, getCombinedGroupCompetitionRankings } from '@/lib/group-ranking-service';
import AnimatedLeaderboard from '@/components/AnimatedLeaderboard';
import { RankingEntry } from '@/lib/ranking-utils';
import GoalProgressChart from '@/components/GoalProgressChart';
import RunnerAnimation from '@/components/RunnerAnimation';
import AutoSync from '@/components/AutoSync';
import LandingPage from '@/components/LandingPage';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return <LandingPage />;
  }

  const userEmail = session?.user?.email;

  let groupKeywords: string[] = [];
  let username: string | undefined;
  let mySteps = 0;
  let yesterdaySteps = 0;
  let lastWeekSteps = 0;
  let lastMonthSteps = 0;
  let stepGoal = 10000;
  let bannerUrl: string | null | undefined;

  if (session?.user && (session.user as any).id) {
    const userId = (session.user as any).id;
    // Fetch current user's group keywords
    const { data: userData } = await supabase
      .from('users')
      .select('group_keyword, username, step_goal, banner_url')
      .eq('id', userId)
      .single();

    stepGoal = userData?.step_goal || 10000;
    groupKeywords = userData?.group_keyword || [];
    username = userData?.username;
    bannerUrl = userData?.banner_url;

    // Use JST
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstDate.toISOString().split('T')[0];

    // Fetch yesterday's steps (JST)
    const yesterdayDate = new Date(jstDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    // --- Calculate Last Week & Last Month Ranges ---
    const currentDate = new Date(`${today}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay(); // 0(Sun) - 6(Sat)
    const daysToSubtract = (utcDay + 6) % 7;

    // This Week Start (Mon)
    const thisWeekMonday = new Date(currentDate);
    thisWeekMonday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const thisWeekStartStr = thisWeekMonday.toISOString().split('T')[0];

    // Last Week Start (Mon - 7)
    const lastWeekMonday = new Date(thisWeekMonday);
    lastWeekMonday.setUTCDate(thisWeekMonday.getUTCDate() - 7);
    const lastWeekStartStr = lastWeekMonday.toISOString().split('T')[0];

    // This Month Start
    const [y, m] = today.split('-');
    const thisMonthStartStr = `${y}-${m}-01`;

    // Last Month Start (1st of prev month)
    const thisMonthDate = new Date(`${thisMonthStartStr}T00:00:00Z`);
    const lastMonthDate = new Date(thisMonthDate);
    lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
    const lastMonthStartStr = lastMonthDate.toISOString().split('T')[0];

    // ⚡ Bolt Optimization: Combined Query
    // Fetch all needed data in a single request (Today, Yesterday, Last Week, Last Month)
    // We fetch from the earliest date needed (Last Month Start)
    const { data: userStepsData } = await supabase
      .from('daily_steps')
      .select('steps, date')
      .eq('user_id', userId)
      .gte('date', lastMonthStartStr);

    // Process results in memory
    const stepsMap = new Map<string, number>();
    userStepsData?.forEach(row => {
      stepsMap.set(row.date, row.steps);
    });

    mySteps = stepsMap.get(today) || 0;
    yesterdaySteps = stepsMap.get(yesterday) || 0;

    lastWeekSteps = (userStepsData ?? []).filter(row => row.date >= lastWeekStartStr && row.date < thisWeekStartStr)
      .reduce((sum, row) => sum + row.steps, 0) || 0;

    lastMonthSteps = (userStepsData ?? []).filter(row => row.date >= lastMonthStartStr && row.date < thisMonthStartStr)
      .reduce((sum, row) => sum + row.steps, 0) || 0;
  }

  // Pre-load ALL rankings (Optimization: Single query per scope)
  const allGlobalRankings = await getAllRankings('GLOBAL');

  // Extract Stats for Current User
  const myWeeklyEntry = allGlobalRankings['WEEKLY'].find((r: RankingEntry) => r.users.email === userEmail);
  const myWeeklySteps = myWeeklyEntry?.steps || 0;

  const myMonthlyEntry = allGlobalRankings['MONTHLY'].find((r: RankingEntry) => r.users.email === userEmail);
  const myMonthlySteps = myMonthlyEntry?.steps || 0;

  // ⚡ Bolt Optimization: Bulk fetch group metadata to avoid N+1 queries
  const groupMetadataMap = new Map<string, { id: string; header_image_url: string | null; image_url: string | null }>();
  const validGroupIds: string[] = [];

  if (groupKeywords.length > 0) {
    const { data: groupsData } = await supabase
      .from('groups')
      .select('id, keyword, header_image_url, image_url')
      .in('keyword', groupKeywords);

    groupsData?.forEach(g => {
      groupMetadataMap.set(g.keyword, g);
      validGroupIds.push(g.id);
    });
  }

  // ⚡ Bolt Optimization: Batch fetch rankings for all groups to avoid N+1 queries
  const batchGroupRankings = await getBatchGroupRankings(validGroupIds);

  const allGroupRankings = await Promise.all(
    groupKeywords.map(async (keyword) => {
      // Lookup groupId & images from memory
      const grp = groupMetadataMap.get(keyword);
      const groupId = grp?.id;

      let rankings;
      if (groupId && batchGroupRankings[groupId]) {
        rankings = batchGroupRankings[groupId];
      } else if (groupId) {
        // Fallback (should normally be covered by batch)
        rankings = await getAllGroupRankings(groupId);
      } else {
        // Fallback if no group ID found (shouldn't happen if keyword exists)
        rankings = await getAllRankings('GROUP', keyword);
      }

      return {
        keyword,
        groupId,
        header_image_url: grp?.header_image_url,
        image_url: grp?.image_url,
        neighbors: rankings
      };
    })
  );

  // Fetch Group Competition Rankings
  // ⚡ Bolt Optimization: Combined call to reduce DB queries (12 -> 3)
  const {
    DAILY: compDaily,
    WEEKLY: compWeekly,
    MONTHLY: compMonthly,
    YEARLY: compYearly
  } = await getCombinedGroupCompetitionRankings();

  const groupCompetitionRankings = {
    DAILY: compDaily,
    WEEKLY: compWeekly,
    MONTHLY: compMonthly,
    YEARLY: compYearly
  };

  // Determine Banner Image (Priority: User Banner -> First group's header image -> Default Gradient)
  const userDataBanner = bannerUrl;
  const primaryGroupBanner = userDataBanner || (allGroupRankings.length > 0 ? allGroupRankings[0].header_image_url : null);
  const userImage = session?.user?.image;

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
        {/* MAIN LAYOUT CONTAINER */}
        <div className="flex flex-col gap-8">

          {/* TOP SECTION: Stats & Motivation (Equal Height on Desktop) */}
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8 min-h-[220px]">
            {/* My Stats Panel (Left: 5 cols) - Premium Design */}
            {session && (
              <div className="lg:col-span-5 flex flex-col h-full overflow-hidden rounded-2xl bg-white shadow-lg shadow-indigo-100/50 border border-indigo-50 relative group">
                {/* Decorative Background Blob */}
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity"></div>

                <div className="p-6 relative z-10 flex flex-col h-full justify-between">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-md shadow-indigo-200">
                      {/* Bolt Icon */}
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 tracking-tight">Your Activity</h3>
                  </div>

                  {/* Today's Main Stat */}
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 drop-shadow-sm">
                          {mySteps.toLocaleString()}
                        </span>
                        <span className="text-sm font-semibold text-gray-400">steps today</span>
                      </div>

                      {/* Comparison Badge */}
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${mySteps - yesterdaySteps >= 0
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-600 border border-red-100'
                          }`}>
                          {mySteps - yesterdaySteps >= 0 ? (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                          )}
                          {Math.abs(mySteps - yesterdaySteps).toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">vs yesterday</span>
                      </div>
                    </div>

                    {/* Goal Progress Chart */}
                    <div className="flex-shrink-0 animate-in fade-in zoom-in duration-500 delay-150">
                      <GoalProgressChart current={mySteps} goal={stepGoal} size={84} />
                    </div>
                  </div>

                  {/* Secondary Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 mt-auto">
                    {/* Weekly */}
                    <Link
                      href={username ? `/user/${username}#weekly-graph` : '/profile'}
                      className="block bg-gray-50/80 p-3 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all duration-300 group/item cursor-pointer"
                    >
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        This Week
                      </p>
                      <div className="flex flex-col">
                        <span className="text-lg font-extrabold text-gray-700 group-hover/item:text-indigo-600 transition-colors">
                          {myWeeklySteps.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[10px] font-bold ${myWeeklySteps >= lastWeekSteps ? 'text-green-600' : 'text-red-500'}`}>
                            {myWeeklySteps >= lastWeekSteps ? '↑' : '↓'} {Math.abs(myWeeklySteps - lastWeekSteps).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-400">vs last wk</span>
                        </div>
                      </div>
                    </Link>

                    {/* Monthly */}
                    <Link
                      href={username ? `/user/${username}#monthly-graph` : '/profile'}
                      className="block bg-gray-50/80 p-3 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all duration-300 group/item cursor-pointer"
                    >
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        This Month
                      </p>
                      <div className="flex flex-col">
                        <span className="text-lg font-extrabold text-gray-700 group-hover/item:text-indigo-600 transition-colors">
                          {myMonthlySteps.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[10px] font-bold ${myMonthlySteps >= lastMonthSteps ? 'text-green-600' : 'text-red-500'}`}>
                            {myMonthlySteps >= lastMonthSteps ? '↑' : '↓'} {Math.abs(myMonthlySteps - lastMonthSteps).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-400">vs last mo</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Motivation / Status (Right: 7 cols) - Adjusted styling to match */}
            {session && (
              <div className="lg:col-span-7 flex flex-col justify-center h-full rounded-2xl p-4 sm:p-8 text-white shadow-xl shadow-purple-200 relative overflow-hidden group">

                {/* Background Image or Gradient */}
                {primaryGroupBanner ? (
                  <>
                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105" style={{ backgroundImage: `url(${primaryGroupBanner})` }}></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/90 to-purple-900/80"></div>
                  </>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600"></div>
                )}


                {/* Decorative circles */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>

                {/* Animation */}
                <div className="absolute top-1/2 right-4 sm:right-12 transform -translate-y-1/2 opacity-100 pointer-events-none">
                  <RunnerAnimation userImage={userImage} />
                </div>

                <div className="relative z-10">
                  <div className="flex items-center gap-3 sm:block">
                    <div className="mb-0 sm:mb-4 inline-flex items-center justify-center p-1.5 sm:p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                      <svg className="w-4 h-4 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h4 className="font-black text-lg sm:text-2xl mb-0 sm:mb-2 tracking-tight">Keep Stepping!</h4>
                  </div>

                  <p className="opacity-90 text-[10px] sm:text-sm leading-relaxed max-w-md font-medium text-indigo-50 mt-1 sm:mt-0">
                    Every step counts! Join groups to compete and maintain your streak.
                  </p>

                  <div className="mt-3 sm:mt-6 flex flex-wrap gap-2 sm:gap-3">
                    <Link href="/profile" className="px-3 py-1 sm:px-5 sm:py-2 bg-white text-indigo-600 text-[10px] sm:text-sm font-bold rounded-full shadow-lg hover:bg-indigo-50 transition-colors inline-flex items-center gap-2">
                      Profile
                    </Link>
                    <Link href="/groups" className="px-3 py-1 sm:px-5 sm:py-2 bg-indigo-600/30 backdrop-blur-md text-white border border-white/20 text-[10px] sm:text-sm font-bold rounded-full hover:bg-indigo-600/50 transition-colors inline-flex items-center gap-2">
                      Groups
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* BOTTOM SECTION: Leaderboards */}
          <AnimatedLeaderboard
            userEmail={userEmail}
            allGlobalRankings={allGlobalRankings}
            allGroupRankings={allGroupRankings}
            groupCompetitionRankings={groupCompetitionRankings}
          />

          <AutoSync />

        </div>
      </div>
    </main>
  );
}

export const runtime = 'edge';
