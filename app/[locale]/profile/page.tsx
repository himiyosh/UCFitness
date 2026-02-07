import { auth } from "@/lib/auth";
import ProfileImageEditor from "@/components/ProfileImageEditor";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProfileForm from "@/components/ProfileForm";
import UsernameForm from "@/components/UsernameForm";
import UserMenu from "@/components/UserMenu";
import ActivityGraph from "@/components/ActivityGraph";
import ProfileHeader from "@/components/ProfileHeader";
import ProfileBadges from "@/components/ProfileBadges";
import SyncHistoryButton from "@/components/SyncHistoryButton";
import Breadcrumbs from "@/components/Breadcrumbs";
import { getUserBadges } from "@/lib/badge-service";
import { getTranslations } from "next-intl/server";

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
    const session = await auth();
    const t = await getTranslations('Profile');
    const dashboardT = await getTranslations('Dashboard');

    if (!session || !session.user) {
        redirect("/");
    }

    // Fetch current user data
    const { data: user } = await supabase
        .from("users")
        .select("name, email, image, group_keyword, username, step_goal, is_custom_image, banner_url") // Added username, step_goal, banner_url
        .eq("id", (session.user as any).id)
        .single();

    if (!user) {
        console.error("ProfilePage: User not found for ID:", (session.user as any).id);
    }

    // Fetch stats (Total steps, etc.)
    let totalSteps = 0;
    let bestDay = { date: '-', steps: 0 };
    let allHistoryData: any[] = [];
    let userBadges: any[] = [];

    if (user) {
        // Fetch Badges
        userBadges = await getUserBadges((session.user as any).id);

        // Fetch All History
        const { data: allHistory } = await supabase
            .from('daily_steps')
            .select('steps, date')
            .eq("user_id", (session.user as any).id)
            .order('date', { ascending: true }); // Ensure sorted for graph

        if (allHistory && allHistory.length > 0) {
            allHistoryData = allHistory;
            totalSteps = allHistory.reduce((acc, curr) => acc + curr.steps, 0);
            const best = allHistory.reduce((max, curr) => curr.steps > max.steps ? curr : max, { steps: 0, date: '' });
            bestDay = {
                date: new Date(best.date).toLocaleDateString(),
                steps: best.steps
            };
        }
    }

    if (!user) {
        return <div>User not found</div>;
    }

    return (
        <main className="min-h-screen bg-[var(--theme-page-bg)]">
            {/* Rich Header */}
            <header className="bg-white/80 backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity">
                                {dashboardT('title')}
                            </h1>
                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20 group-hover:bg-[var(--theme-primary)]/10 transition-colors">
                                {dashboardT('beta')}
                            </span>
                        </Link>
                    </div>
                    <UserMenu user={{
                        ...session.user,
                        name: user?.name || session.user.name,
                        image: user?.image || session.user.image
                    }} />
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

                <div className="mb-6">
                    <Breadcrumbs items={[{ label: t('title') }]} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Profile Card */}
                    <div className="md:col-span-1 space-y-6 order-last md:order-none">
                        <h2 className="text-2xl font-bold text-gray-900">{t('title')}</h2>
                        <div>
                            <ProfileHeader user={user} badges={userBadges} />

                            <div className="mt-6">
                                <ProfileBadges badges={userBadges} />
                            </div>

                            <div className="mt-4">
                                <Link
                                    href="/settings"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 hover:border-[var(--theme-primary)]/30 hover:text-[var(--theme-primary)] transition-all shadow-sm group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-400 group-hover:text-[var(--theme-primary)] transition-colors">
                                        <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
                                    </svg>
                                    {t('goToSettings')}
                                </Link>
                            </div>
                        </div>
                    </div>


                    {/* Right Column: Stats & Achievements */}
                    <div className="md:col-span-2 space-y-6 order-first md:order-none">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-gray-900">{t('activityTitle')}</h2>
                            <SyncHistoryButton />
                        </div>


                        {/* Stats Calculation Logic */}
                        {(() => {
                            // JST Logic setup
                            const now = new Date();
                            const formatter = new Intl.DateTimeFormat('en-CA', {
                                timeZone: 'Asia/Tokyo',
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit'
                            });
                            const todayStr = formatter.format(now); // YYYY-MM-DD

                            // Weekly Start (Mon)
                            const currentDate = new Date(`${todayStr}T00:00:00Z`);
                            const utcDay = currentDate.getUTCDay();
                            const daysToSubtract = (utcDay + 6) % 7;
                            const monday = new Date(currentDate);
                            monday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
                            const weeklyStartStr = monday.toISOString().split('T')[0];

                            // Monthly Start
                            const [year, month] = todayStr.split('-');
                            const monthlyStartStr = `${year}-${month}-01`;

                            // Calculate Stats
                            const dailySteps = allHistoryData.find((r: any) => r.date === todayStr)?.steps || 0;
                            const weeklySteps = allHistoryData.filter((r: any) => r.date >= weeklyStartStr).reduce((acc: number, curr: any) => acc + curr.steps, 0);
                            const monthlySteps = allHistoryData.filter((r: any) => r.date >= monthlyStartStr).reduce((acc: number, curr: any) => acc + curr.steps, 0);

                            return (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                    {/* Daily */}
                                    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('daily')}</p>
                                        <div className="mt-2">
                                            <p className="text-3xl font-black text-gray-900">{dailySteps.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* Weekly */}
                                    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('weekly')}</p>
                                        <div className="mt-2">
                                            <p className="text-3xl font-black text-gray-900">{weeklySteps.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* Monthly */}
                                    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('monthly')}</p>
                                        <div className="mt-2">
                                            <p className="text-3xl font-black text-gray-900">{monthlySteps.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Activity Graph */}
                        <ActivityGraph data={allHistoryData} stepGoal={user.step_goal || 10000} />


                    </div>
                </div>
            </div>
        </main>
    );
}

export const runtime = 'edge';
