'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

import type { ReactNode } from 'react';

interface QuickActionsProps {
  className?: string;
}

type QuickActionIcon = 'leaderboard' | 'challenges' | 'groups' | 'profile' | 'shop';
type QuickActionTone = 'primary' | 'success' | 'competition' | 'reward' | 'neutral';

export default function QuickActions({ className = '' }: QuickActionsProps): ReactNode {
  const t = useTranslations('Dashboard');
  const navT = useTranslations('BottomNav');
  const pt = useTranslations('Portal');

  // クイックアクション定義
  const quickActions = useMemo(() => [
    { href: '/leaderboard' as const, icon: 'leaderboard' as const, label: navT('ranking'), tone: 'competition' as const },
    { href: '/challenges' as const, icon: 'challenges' as const, label: t('challenges'), tone: 'competition' as const },
    { href: '/groups' as const, icon: 'groups' as const, label: t('groups'), tone: 'neutral' as const },
    { href: '/shop' as const, icon: 'shop' as const, label: t('shop'), tone: 'reward' as const },
  ], [navT, t]);

  return (
    <section className={`px-2.5 sm:px-4 py-2 ${className}`} aria-label={pt('quickActions')}>
      <h2 className="sr-only">{pt('quickActions')}</h2>
      <div className="mx-auto grid w-full max-w-sm grid-cols-4 gap-1.5 md:max-w-3xl md:gap-2">
        {quickActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`group relative flex min-h-[52px] flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border px-1.5 py-1.5 shadow-sm transition-colors duration-200 sm:min-h-[60px] sm:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 ${getActionToneClasses(action.tone).card}`}
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${getActionToneClasses(action.tone).icon}`} aria-hidden="true">
              <ActionIcon name={action.icon} />
            </span>
            <span className={`text-xs font-bold transition-colors duration-200 ${getActionToneClasses(action.tone).label}`}>{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function getActionToneClasses(tone: QuickActionTone): { card: string; icon: string; label: string } {
  if (tone === 'competition') {
    return {
      card: 'border-[var(--color-competition)]/30 bg-[var(--color-competition-soft)] hover:border-[var(--color-competition)]',
      icon: 'bg-[var(--color-competition-solid)] text-white',
      label: 'text-[var(--color-competition-strong)]',
    };
  }
  if (tone === 'success') {
    return {
      card: 'border-[var(--color-success)]/30 bg-[var(--color-success-soft)] hover:border-[var(--color-success)]',
      icon: 'bg-[var(--color-success-soft)] text-[var(--color-success-strong)]',
      label: 'text-[var(--color-success-strong)]',
    };
  }
  if (tone === 'reward') {
    return {
      card: 'border-[var(--color-reward)]/30 bg-[var(--color-reward-soft)] hover:border-[var(--color-reward)]',
      icon: 'bg-[var(--color-reward-soft)] text-[var(--color-reward-strong)]',
      label: 'text-[var(--color-reward-strong)]',
    };
  }
  if (tone === 'neutral') {
    return {
      card: 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]',
      icon: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
      label: 'text-[var(--color-text)]',
    };
  }
  return {
    card: 'border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] hover:border-[var(--color-primary)]',
    icon: 'bg-[var(--color-primary-solid)] text-white',
    label: 'text-[var(--color-primary-strong)]',
  };
}

function ActionIcon({ name }: { name: QuickActionIcon }) {
  if (name === 'groups') {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20c0-2.2-2.7-4-6-4s-6 1.8-6 4M11 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 1a3 3 0 0 0 0-6" />
      </svg>
    );
  }
  if (name === 'challenges') {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v4m0 8v4m8-8h-4M8 12H4m12.95-4.95-2.83 2.83M9.88 14.12l-2.83 2.83m9.9 0-2.83-2.83M9.88 9.88 7.05 7.05" />
      </svg>
    );
  }
  if (name === 'leaderboard') {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 15l3-3 3 2 5-7" />
      </svg>
    );
  }
  if (name === 'shop') {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 8h12l1 12H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
    </svg>
  );
}
