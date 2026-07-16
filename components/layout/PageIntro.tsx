import Breadcrumbs from '@/components/layout/Breadcrumbs';

import type { ReactNode } from 'react';

type PageIntroTone = 'primary' | 'reward' | 'competition' | 'success';
type PageIntroIcon =
  | 'analytics'
  | 'wallet'
  | 'shop'
  | 'challenges'
  | 'groups'
  | 'leaderboard'
  | 'recommendations'
  | 'settings'
  | 'profile';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageIntroProps {
  headingId: string;
  title: string;
  description: ReactNode;
  icon: PageIntroIcon;
  tone: PageIntroTone;
  breadcrumbs: BreadcrumbItem[];
  actions?: ReactNode;
}

const TONE_STYLES: Record<PageIntroTone, { icon: string; accent: string }> = {
  primary: {
    icon: 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]',
    accent: 'bg-[var(--color-primary)]',
  },
  reward: {
    icon: 'bg-[var(--color-reward-soft)] text-[var(--color-reward-strong)]',
    accent: 'bg-[var(--color-reward)]',
  },
  competition: {
    icon: 'bg-[var(--color-competition-soft)] text-[var(--color-competition-strong)]',
    accent: 'bg-[var(--color-competition)]',
  },
  success: {
    icon: 'bg-[var(--color-success-soft)] text-[var(--color-success-strong)]',
    accent: 'bg-[var(--color-success)]',
  },
};

export default function PageIntro({
  headingId,
  title,
  description,
  icon,
  tone,
  breadcrumbs,
  actions,
}: PageIntroProps): ReactNode {
  const styles = TONE_STYLES[tone];

  return (
    <div className="uc-page-intro">
      <Breadcrumbs items={breadcrumbs} />
      <section
        className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm sm:p-5"
        aria-labelledby={headingId}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`} aria-hidden="true">
              <PageIcon name={icon} />
            </span>
            <div className="min-w-0">
              <h1 id={headingId} className="text-2xl font-black tracking-tight text-[var(--color-text)] sm:text-3xl">
                {title}
              </h1>
              <div className="mt-1 max-w-prose text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
                {description}
              </div>
              <span className={`mt-3 block h-1 w-12 rounded-full ${styles.accent}`} aria-hidden="true" />
            </div>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </section>
    </div>
  );
}

function PageIcon({ name }: { name: PageIntroIcon }): ReactNode {
  const paths: Record<PageIntroIcon, ReactNode> = {
    analytics: <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />,
    wallet: <path d="M4 6h13a3 3 0 0 1 3 3v9H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h11v2m0 7h3" />,
    shop: <path d="m5 8 1-4h12l1 4m-14 0h14l-1 12H6L5 8Zm4 4h6" />,
    challenges: <path d="M12 3v4m0 10v4M3 12h4m10 0h4m-6.3-6.7-1.4 1.4m-6.6 6.6-1.4 1.4m13.4 0-1.4-1.4m-6.6-6.6L9.3 5.3M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />,
    groups: <path d="M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 20a5.5 5.5 0 0 1 11 0m1-6a4.5 4.5 0 0 1 7 3.7" />,
    leaderboard: <path d="M4 20v-6h4v6m4 0V7h4v13m4 0v-9h4v9M3 20h18" />,
    recommendations: <path d="m12 3 1.8 4.8L19 9.5l-4 3.2.2 5.3-4.2-3-4.2 3 .2-5.3-4-3.2 5.2-1.7L12 3Z" />,
    settings: <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-3.5 2-1-2-3-2.2.5-1.3-1.3.5-2.2-3-2-1 2-2.2.5-1.3 1.3L5 8l-2 3 2 1-.1 1.8L3.5 15l2 3 2.2-.5 1.3 1.3-.5 2.2h3l1-2 1.8-.1 1.2 1.6 3-2-.5-2.2 1.3-1.3 2.2.5 2-3-2-1 .1-1.8Z" />,
    profile: <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" />,
  };

  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
