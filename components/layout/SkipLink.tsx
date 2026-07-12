'use client';

import type { MouseEvent } from 'react';

interface SkipLinkProps {
  label: string;
  targetId: string;
}

export default function SkipLink({ label, targetId }: SkipLinkProps) {
  const handleSkip = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    const shellContent = document.getElementById('main-page-content');
    const pageMain = shellContent?.querySelector<HTMLElement>('main') ?? null;
    const visibleHeaders = pageMain
      ? Array.from(pageMain.querySelectorAll<HTMLElement>('header')).filter(
          (header) => header.getClientRects().length > 0,
        )
      : [];
    const lastVisibleHeader = visibleHeaders[visibleHeaders.length - 1];
    const target = lastVisibleHeader?.nextElementSibling instanceof HTMLElement
      ? lastVisibleHeader.nextElementSibling
      : pageMain ?? shellContent;
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus();
    target.scrollIntoView({ block: 'start' });
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleSkip}
      className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-lg focus:bg-[var(--color-primary-solid)] focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
    >
      {label}
    </a>
  );
}
