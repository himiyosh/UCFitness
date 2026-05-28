'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

interface QuickActionsProps {
  className?: string;
}

type QuickActionIcon = 'leaderboard' | 'challenges' | 'groups' | 'profile';
type QuickActionTone = 'blue' | 'amber' | 'emerald' | 'violet';

export default function QuickActions({ className = '' }: QuickActionsProps) {
  const t = useTranslations('Dashboard');
  const navT = useTranslations('BottomNav');
  const pt = useTranslations('Portal');

  // クイックアクション定義
  const quickActions = useMemo(() => [
    { href: '/leaderboard' as const, icon: 'leaderboard' as const, label: navT('ranking'), tone: 'blue' as const },
    { href: '/challenges' as const, icon: 'challenges' as const, label: t('challenges'), tone: 'amber' as const },
    { href: '/groups' as const, icon: 'groups' as const, label: t('groups'), tone: 'emerald' as const },
    { href: '/profile' as const, icon: 'profile' as const, label: t('profile'), tone: 'violet' as const },
  ], [navT, t]);

  return (
    <section className={`px-2.5 sm:px-4 py-2 ${className}`} aria-label={pt('quickActions')}>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 max-w-sm 2xl:max-w-md mx-auto w-full">
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
  if (tone === 'amber') {
    return {
      card: 'border-amber-200/70 bg-gradient-to-br from-amber-50 to-white hover:border-amber-300',
      icon: 'bg-amber-100 text-amber-700 group-hover:bg-amber-200',
      label: 'text-amber-800',
    };
  }
  if (tone === 'emerald') {
    return {
      card: 'border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white hover:border-emerald-300',
      icon: 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200',
      label: 'text-emerald-800',
    };
  }
  if (tone === 'violet') {
    return {
      card: 'border-violet-200/70 bg-gradient-to-br from-violet-50 to-white hover:border-violet-300',
      icon: 'bg-violet-100 text-violet-700 group-hover:bg-violet-200',
      label: 'text-violet-800',
    };
  }
  return {
    card: 'border-blue-200/70 bg-gradient-to-br from-blue-50 to-white hover:border-blue-300',
    icon: 'bg-blue-100 text-blue-700 group-hover:bg-blue-200',
    label: 'text-blue-800',
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
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
    </svg>
  );
}
