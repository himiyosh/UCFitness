import AppBrandMark from '@/components/layout/AppBrandMark';
import NotificationBell from '@/components/layout/NotificationBell';
import RefreshButton from '@/components/layout/RefreshButton';
import UserMenu from '@/components/layout/UserMenu';
import { Link } from '@/navigation';

import type { ReactNode } from 'react';

interface HeaderUser {
  id?: string | null;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface AuthenticatedPageHeaderProps {
  appTitle: string;
  betaLabel: string;
  contextLabel: string;
  user: HeaderUser;
}

export default function AuthenticatedPageHeader({
  appTitle,
  betaLabel,
  contextLabel,
  user,
}: AuthenticatedPageHeaderProps): ReactNode {
  return (
    <header
      data-auth-header
      className="sticky top-0 z-50 overflow-visible border-b border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-4 sm:h-14 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label={appTitle}
          className="group flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 lg:hidden"
        >
          <AppBrandMark />
          <span className="text-lg font-black tracking-tight" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            <span className="text-[var(--color-primary-strong)]">UC</span>
            <span className="text-[var(--color-text)]">Fitness</span>
          </span>
          <span className="hidden rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--color-primary-strong)] sm:inline">
            {betaLabel}
          </span>
        </Link>

        <div className="hidden min-w-0 items-center gap-2 text-sm font-semibold text-[var(--color-text)] lg:flex">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-success)] shadow-[0_0_0_4px_var(--color-success-soft)]" aria-hidden="true" />
          <span className="truncate">{contextLabel}</span>
        </div>

        <div className="header-action-cluster flex shrink-0 items-center gap-0.5 overflow-visible rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-0.5">
          <RefreshButton />
          <NotificationBell />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
