export const runtime = 'edge';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { createLoginRequiredRedirect } from '@/lib/auth-redirect';
import CreateGroupClient from '@/components/group/CreateGroupClient';
import Footer from '@/components/layout/Footer';

export const dynamic = 'force-dynamic';

export default async function CreateGroupPage() {
  const [session, locale] = await Promise.all([auth(), getLocale()]);

  if (!session?.user) {
    redirect(createLoginRequiredRedirect(locale, '/groups/create'));
  }

  return (
    <>
      <CreateGroupClient />
      <Footer />
    </>
  );
}
