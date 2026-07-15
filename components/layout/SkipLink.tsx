'use client';

import { useEffect } from 'react';

import type { MouseEvent, ReactElement, ReactNode } from 'react';

interface SkipLinkProps {
    label: string;
    targetId: string;
}

interface FocusAnchorLinkProps {
    children: ReactNode;
    className: string;
    targetId: string;
}

function focusAnchorTarget(targetId: string, behavior: ScrollBehavior): boolean {
    const target = document.getElementById(targetId);
    if (!target) return false;

    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.scrollIntoView({ behavior, block: 'start' });
    target.focus({ preventScroll: true });
    return true;
}

export function FocusAnchorLink({
    children,
    className,
    targetId,
}: FocusAnchorLinkProps): ReactElement {
    useEffect(() => {
        const hash = `#${targetId}`;
        const focusHashTarget = (): void => {
            if (window.location.hash === hash) {
                focusAnchorTarget(targetId, 'auto');
            }
        };

        focusHashTarget();
        window.addEventListener('hashchange', focusHashTarget);
        window.addEventListener('popstate', focusHashTarget);
        return () => {
            window.removeEventListener('hashchange', focusHashTarget);
            window.removeEventListener('popstate', focusHashTarget);
        };
    }, [targetId]);

    const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
        if (
            event.button !== 0
            || event.metaKey
            || event.altKey
            || event.ctrlKey
            || event.shiftKey
            || !document.getElementById(targetId)
        ) {
            return;
        }

        event.preventDefault();
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth';
        focusAnchorTarget(targetId, behavior);

        const hash = `#${targetId}`;
        if (window.location.hash !== hash) {
            window.history.pushState(null, '', hash);
        }
    };

    return (
        <a href={`#${targetId}`} onClick={handleClick} className={className}>
            {children}
        </a>
    );
}

export default function SkipLink({ label, targetId }: SkipLinkProps): ReactElement {
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
