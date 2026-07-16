'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/navigation';

import type { ReactNode } from 'react';

interface QuickActionsProps {
  className?: string;
}

type QuickActionIcon = 'analytics' | 'group' | 'link' | 'settings';
type QuickActionTone = 'primary' | 'success' | 'competition' | 'reward' | 'neutral';

export default function QuickActions({ className = '' }: QuickActionsProps): ReactNode {
  const t = useTranslations('Dashboard');
  const pt = useTranslations('Portal');

  const quickActions = [
    { href: '/analytics' as const, icon: 'analytics' as const, label: t('analytics'), tone: 'success' as const },
    { href: '/recommendations' as const, icon: 'link' as const, label: t('linkBuilder'), tone: 'reward' as const },
    { href: '/groups/create' as const, icon: 'group' as const, label: t('createGroup'), tone: 'competition' as const },
    { href: '/settings' as const, icon: 'settings' as const, label: t('settings'), tone: 'primary' as const },
  ];

  return (
    <section className={`w-full ${className}`} aria-label={pt('quickActions')}>
      <h2 className="sr-only">{pt('quickActions')}</h2>
      <div className="home-action-dock grid w-full grid-cols-2 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm sm:grid-cols-4">
        {quickActions.map((action, index) => (
          <Link
            key={action.href}
            href={action.href}
            className={`home-action-dock-item group relative flex min-h-[64px] touch-manipulation items-center gap-2.5 px-3 py-2.5 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] sm:min-h-[72px] sm:flex-col sm:justify-center sm:gap-1.5 ${index % 2 === 0 ? 'border-r border-[var(--color-border)]' : ''} ${index < 2 ? 'border-b border-[var(--color-border)] sm:border-b-0' : ''} ${index < 3 ? 'sm:border-r sm:border-[var(--color-border)]' : 'sm:border-r-0'} ${getActionToneClasses(action.tone).card}`}
            data-tone={action.tone}
          >
            <span className={`home-action-icon flex h-8 w-8 items-center justify-center rounded-xl transition-transform duration-200 group-hover:-translate-y-0.5 ${getActionToneClasses(action.tone).icon}`} aria-hidden="true">
              <ActionIcon name={action.icon} />
            </span>
            <span className={`text-xs font-bold transition-colors duration-200 ${getActionToneClasses(action.tone).label}`}>{action.label}</span>
            <svg className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 sm:absolute sm:right-2.5 sm:top-2.5 ${getActionToneClasses(action.tone).label}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        ))}
      </div>
    </section>
  );
}

function getActionToneClasses(tone: QuickActionTone): { card: string; icon: string; label: string } {
  if (tone === 'competition') {
    return {
      card: 'hover:bg-[var(--color-competition-soft)]',
      icon: 'bg-[var(--color-competition-solid)] text-white',
      label: 'text-[var(--color-competition-strong)]',
    };
  }
  if (tone === 'success') {
    return {
      card: 'hover:bg-[var(--color-success-soft)]',
      icon: 'bg-[var(--color-success-soft)] text-[var(--color-success-strong)]',
      label: 'text-[var(--color-success-strong)]',
    };
  }
  if (tone === 'reward') {
    return {
      card: 'hover:bg-[var(--color-reward-soft)]',
      icon: 'bg-[var(--color-reward-soft)] text-[var(--color-reward-strong)]',
      label: 'text-[var(--color-reward-strong)]',
    };
  }
  if (tone === 'neutral') {
    return {
      card: 'hover:bg-[var(--color-surface-muted)]',
      icon: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
      label: 'text-[var(--color-text)]',
    };
  }
  return {
    card: 'hover:bg-[var(--color-primary-soft)]',
    icon: 'bg-[var(--color-primary-solid)] text-white',
    label: 'text-[var(--color-primary-strong)]',
  };
}

function ActionIcon({ name }: { name: QuickActionIcon }) {
  if (name === 'link') {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 13.5 13.5 10.5m-5.75 6.75-1 1a3.18 3.18 0 0 1-4.5-4.5l3-3a3.18 3.18 0 0 1 4.5 0m4.5 2.5a3.18 3.18 0 0 0 4.5 0l3-3a3.18 3.18 0 0 0-4.5-4.5l-1 1a3.18 3.18 0 0 0-.5 3.75" />
      </svg>
    );
  }
  if (name === 'analytics') {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V9m5 10V5m6 14v-7m5 7V3" />
      </svg>
    );
  }
  if (name === 'group') {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19a6 6 0 0 0-12 0m6-8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9-2v6m3-3h-6" />
      </svg>
    );
  }
  if (name === 'settings') {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-2.1-1.1.2-2.4-2.6-1.5-1.9 1.4L12 5.5 9.4 6.4 7.5 5 4.9 6.5l.2 2.4L3 10v3l2.1 1.1-.2 2.4L7.5 18l1.9-1.4 2.6.9 1.6-2.9 1.9 1.4 2.6-1.5-.2-2.4L20 15v-3Z" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
    </svg>
  );
}
