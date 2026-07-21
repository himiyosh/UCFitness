export const runtime = 'edge';

import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { createLoginRequiredRedirect } from '@/lib/auth-redirect';
import { supabaseAdmin } from '@/lib/supabase';
import GroupInviteJoinClient from '@/components/group/GroupInviteJoinClient';
import AuthenticatedPageHeader from '@/components/layout/AuthenticatedPageHeader';
import Footer from '@/components/layout/Footer';
import PageIntro from '@/components/layout/PageIntro';

export const dynamic = 'force-dynamic';

export default async function GroupInvitePage() {
    const [session, locale, dashboardT, groupsT, inviteT] = await Promise.all([
        auth(),
        getLocale(),
        getTranslations('Dashboard'),
        getTranslations('Groups'),
        getTranslations('GroupInvite'),
    ]);

    const signInHref = createLoginRequiredRedirect(locale, '/groups');

    if (!session?.user) {
        return (
            <main className="flex min-h-dvh flex-1 flex-col bg-[var(--theme-page-bg)]">
                <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 sm:px-6 lg:px-8">
                    <PageIntro
                        headingId="group-invite-page-title"
                        title={inviteT('title')}
                        description={inviteT('headerDesc')}
                        icon="groups"
                        tone="competition"
                        breadcrumbs={[{ label: inviteT('title') }]}
                    />
                    <GroupInviteJoinClient signInHref={signInHref} />
                </div>
                <Footer />
            </main>
        );
    }

    const userId = String(session.user.id);
    const { data: dbUser, error: userError } = await supabaseAdmin
        .from('users')
        .select('name, image, username')
        .eq('id', userId)
        .single();

    if (userError) {
        throw new Error(`Failed to load user for group invitation: ${userError.message}`);
    }
    if (!dbUser?.username) {
        redirect('/setup');
    }

    return (
        <main className="flex flex-1 flex-col bg-[var(--theme-page-bg)]">
            <AuthenticatedPageHeader
                appTitle={dashboardT('title')}
                betaLabel={dashboardT('beta')}
                contextLabel={inviteT('title')}
                user={{
                    id: userId,
                    name: dbUser.name ?? session.user.name,
                    email: session.user.email,
                    image: dbUser.image ?? session.user.image,
                    username: dbUser.username,
                }}
            />
            <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 sm:px-6 lg:px-8">
                <PageIntro
                    headingId="group-invite-page-title"
                    title={inviteT('title')}
                    description={inviteT('headerDesc')}
                    icon="groups"
                    tone="competition"
                    breadcrumbs={[
                        { label: groupsT('title'), href: '/groups' },
                        { label: inviteT('title') },
                    ]}
                />
                <GroupInviteJoinClient signInHref={signInHref} />
            </div>
            <Footer />
        </main>
    );
}
