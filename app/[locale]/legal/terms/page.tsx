export const runtime = 'edge';

import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { getTranslations } from 'next-intl/server';

import PublicLegalPage from '@/components/layout/PublicLegalPage';

const SECTION_KEYS = [
  'agreement',
  'account',
  'health',
  'prohibited',
  'rewards',
  'external',
  'changes',
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Legal.terms');
  return { title: `${t('title')} - UCFitness`, description: t('description') };
}

export default async function TermsPage(): Promise<ReactNode> {
  const [t, commonT] = await Promise.all([
    getTranslations('Legal.terms'),
    getTranslations('Legal.common'),
  ]);

  return (
    <PublicLegalPage
      title={t('title')}
      description={t('description')}
      updatedLabel={commonT('updated')}
      homeLabel={commonT('home')}
      sections={SECTION_KEYS.map((key) => ({
        heading: t(`sections.${key}.heading`),
        body: t(`sections.${key}.body`),
      }))}
    />
  );
}
