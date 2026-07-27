import type { ReactNode } from 'react';
import Link from 'next/link';

import AppBrandMark from '@/components/layout/AppBrandMark';
import Footer from '@/components/layout/Footer';

interface LegalSection {
  heading: string;
  body: string;
}

interface PublicLegalPageProps {
  title: string;
  description: string;
  updatedLabel: string;
  homeLabel: string;
  sections: readonly LegalSection[];
}

export default function PublicLegalPage({
  title,
  description,
  updatedLabel,
  homeLabel,
  sections,
}: PublicLegalPageProps): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--theme-page-bg)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            target="_top"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl font-bold text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            <AppBrandMark />
            <span>UCFitness</span>
          </Link>
          <Link
            href="/"
            target="_top"
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            {homeLabel}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <article
          aria-labelledby="legal-page-title"
          className="mx-auto max-w-3xl rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm ring-1 ring-[var(--color-border)] sm:p-6"
        >
          <div className="border-b border-[var(--color-border)] pb-4">
            <h1
              id="legal-page-title"
              className="text-2xl font-bold text-[var(--color-text)] sm:text-3xl"
            >
              {title}
            </h1>
            <p className="mt-2 max-w-prose text-sm leading-7 text-[var(--color-text-muted)] sm:text-base">
              {description}
            </p>
            <p className="mt-2 text-xs text-[var(--color-text-muted)] sm:text-sm">
              {updatedLabel}
            </p>
          </div>

          <div className="space-y-4 pt-4 sm:space-y-5">
            {sections.map((section, index) => {
              const headingId = `legal-section-${index + 1}`;
              return (
                <section key={section.heading} aria-labelledby={headingId}>
                  <h2
                    id={headingId}
                    className="text-lg font-bold text-[var(--color-primary-strong)] sm:text-xl"
                  >
                    {section.heading}
                  </h2>
                  <p className="mt-1.5 max-w-prose whitespace-pre-line text-sm leading-7 text-[var(--color-text)] sm:text-base">
                    {section.body}
                  </p>
                </section>
              );
            })}
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
