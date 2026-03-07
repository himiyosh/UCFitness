'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

interface QuickActionsProps {
  className?: string;
}

export default function QuickActions({ className = '' }: QuickActionsProps) {
  const t = useTranslations('Dashboard');
  const pt = useTranslations('Portal');

  // クイックアクション定義
  const quickActions = useMemo(() => [
    { href: '/groups' as const, emoji: '👥', label: t('groups'), color: 'from-blue-500 to-blue-600' },
    { href: '/challenges' as const, emoji: '🏆', label: t('challenges'), color: 'from-amber-500 to-orange-500' },
    { href: '/wallet' as const, emoji: '💰', label: t('wallet'), color: 'from-emerald-500 to-green-600' },
    { href: '/shop' as const, emoji: '🛍️', label: t('shop'), color: 'from-pink-500 to-rose-500' },
  ], [t]);

  return (
    <section className={`px-4 sm:px-6 py-3 sm:py-4 glass-card rounded-2xl ${className}`} aria-label={pt('quickActions')}>
      <div className="grid grid-cols-4 gap-2.5 sm:gap-3 max-w-lg mx-auto w-full">
        {quickActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group relative flex flex-col items-center justify-center gap-2 py-3.5 sm:py-4 rounded-2xl bg-white/60 hover:bg-white transition-all duration-200 min-h-[76px] sm:min-h-[88px]"
          >
            {/* M3 State Layer */}
            <span className="absolute inset-0 rounded-2xl bg-[var(--theme-primary)] opacity-0 group-hover:opacity-[0.08] group-active:opacity-[0.12] transition-opacity duration-200 pointer-events-none" aria-hidden="true" />
            <span className="text-2xl sm:text-3xl transition-transform duration-300 group-hover:scale-110 group-active:scale-95 spring-transition">{action.emoji}</span>
            <span className="text-[11px] sm:text-xs font-semibold text-gray-600 group-hover:text-gray-900 transition-colors duration-200">{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
