'use client';

import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ reset }: ErrorPageProps): ReactNode {
  const t = useTranslations('Common');

  return (
    <main className="flex min-h-[60dvh] items-center justify-center bg-[var(--theme-page-bg)] px-4 py-8">
      <section className="w-full max-w-lg rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-surface)] p-5 text-center shadow-sm" role="alert" aria-labelledby="page-error-title">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-2xl text-[var(--color-danger)]" aria-hidden="true">!</span>
        <h1 id="page-error-title" className="mt-3 text-xl font-bold text-[var(--color-text)]">{t('pageErrorTitle')}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{t('pageErrorDescription')}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
        >
          {t('retry')}
        </button>
      </section>
    </main>
  );
}
