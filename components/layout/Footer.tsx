import Link from 'next/link';

import { getTranslations } from 'next-intl/server';

export default async function Footer() {
  const t = await getTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto block">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm sm:px-6 sm:py-4">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          {/* リンク */}
          <nav
            aria-label={t('legalLinks')}
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)] sm:gap-x-6 sm:text-sm"
          >
            <a
              href="https://studio344.net"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-lg transition-colors hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              Studio344
            </a>
            <Link
              href="/legal/terms"
              target="_top"
              className="inline-flex min-h-[44px] items-center rounded-lg transition-colors hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              {t('terms')}
            </Link>
            <Link
              href="/legal/privacy"
              target="_top"
              className="inline-flex min-h-[44px] items-center rounded-lg transition-colors hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              {t('privacy')}
            </Link>
            <a
              href="https://studio344.net/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-lg transition-colors hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              {t('contact')}
            </a>
          </nav>

          {/* コピーライト */}
          <p className="text-xs text-[var(--color-text-muted)]">
            &copy; {year}{' '}
            <a
              href="https://studio344.net"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-lg transition-colors hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              Studio344
            </a>
            . {t('allRightsReserved')}
          </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
