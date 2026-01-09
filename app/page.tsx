import { supabase } from '@/lib/supabase';
import AuthButtons from '@/components/AuthButtons';
import RefreshButton from '@/components/RefreshButton';
import GroupSettings from '@/components/GroupSettings';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

async function getRankings(groupKeyword: string | null) {
  const today = new Date().toISOString().split('T')[0];

  let query = supabase
    .from('daily_steps')
    .select(`
      steps,
      users (
        name,
        image,
        email,
        group_keyword
      )
    `)
    .eq('date', today)
    .order('steps', { ascending: false });

  if (groupKeyword) {
    // Filter by group_keyword on the joined users table
    // Note: This assumes Supabase/PostgREST can filter on the joined relationship.
    // If using Supabase JS v2, this syntax works for inner joins if !inner is used in select,
    // but here we are filtering the result.
    // However, basic filtering on foreign tables usually requires !inner to filter the top level rows.
    // Let's try the syntax: .eq('users.group_keyword', groupKeyword)
    // If that fails, we might need to modify the select string.

    // Using !inner to ensure we only get daily_steps where the user matches the group
    query = supabase
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
    .eq('users.group_keyword', groupKeyword)
    .order('steps', { ascending: false });
  }

  const { data: dailySteps, error } = await query;

  if (error) {
    console.error('Error fetching rankings:', error);
    return [];
  }

  return dailySteps;
}

export default async function Home() {
  const session = await getServerSession(authOptions);

  let groupKeyword = null;
  let mySteps = 0;

  if (session?.user && (session.user as any).id) {
    // Fetch current user's group keyword
    const { data: userData } = await supabase
      .from('users')
      .select('group_keyword')
      .eq('id', (session.user as any).id)
      .single();

    groupKeyword = userData?.group_keyword || null;

    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('daily_steps')
      .select('steps')
      .eq('user_id', (session.user as any).id)
      .eq('date', today)
      .single();
    mySteps = data?.steps || 0;
  }

  const rankings = await getRankings(groupKeyword);
  if (session?.user && (session.user as any).id) {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('daily_steps')
      .select('steps')
      .eq('user_id', (session.user as any).id)
      .eq('date', today)
      .single();
    mySteps = data?.steps || 0;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Step Competition</h1>
          <div className="flex gap-4">
            <RefreshButton />
            <AuthButtons />
          </div>
        </div>

        {session && (
          <>
            <div className="mb-8 overflow-hidden rounded-lg bg-white shadow">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium leading-6 text-gray-900">My Stats</h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                  <p>Today, you have walked:</p>
                </div>
                <div className="mt-5">
                  <div className="text-3xl font-bold text-indigo-600">
                    {mySteps.toLocaleString()} steps
                  </div>
                </div>
              </div>
            </div>

            <GroupSettings initialKeyword={groupKeyword} />
          </>
        )}

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">
              Today's Leaderboard {groupKeyword ? `(Group: ${groupKeyword})` : '(Global)'}
            </h3>
          </div>
          <div className="bg-gray-50 px-4 py-5 sm:p-6">
            <ul role="list" className="divide-y divide-gray-200">
              {rankings.map((entry: any, index: number) => (
                <li key={index} className="py-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="text-xl font-bold text-gray-500 mr-4">#{index + 1}</span>
                    {entry.users?.image && (
                      <img className="h-10 w-10 rounded-full mr-3" src={entry.users.image} alt="" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {entry.users?.name || entry.users?.email}
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-0.5 text-sm font-medium text-green-800">
                      {entry.steps.toLocaleString()} steps
                    </span>
                  </div>
                </li>
              ))}
              {rankings.length === 0 && (
                <p className="text-gray-500 text-center py-4">No data yet. Sign in and refresh!</p>
              )}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
