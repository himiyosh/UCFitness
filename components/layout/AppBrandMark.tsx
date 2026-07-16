import type { ReactNode } from 'react';

export default function AppBrandMark(): ReactNode {
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] ring-1 ring-[var(--color-primary)]/20">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 15.5 8.5 11l3 3L20 5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19h14" stroke="var(--color-reward)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="18.5" cy="5.5" r="2.25" fill="var(--color-success)" />
      </svg>
    </span>
  );
}
