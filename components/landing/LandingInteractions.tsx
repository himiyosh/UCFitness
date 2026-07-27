'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode, UIEvent } from 'react';
import { useSearchParams } from 'next/navigation';

import { usePathname, useRouter } from '@/navigation';
import { getLocaleSwitchQuery } from '@/lib/auth-flow';

interface LandingNavItem {
    href: string;
    label: string;
}

interface LandingHeaderControlsProps {
    locale: string;
    navItems: LandingNavItem[];
    navLabel: string;
    switchLabel: string;
}

let pendingLocaleFocus: string | null = null;

export function LandingHeaderControls({
    locale,
    navItems,
    navLabel,
    switchLabel,
}: LandingHeaderControlsProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [switching, setSwitching] = useState(false);
    const localeSwitchButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        setSwitching(false);
        if (pendingLocaleFocus === locale) {
            pendingLocaleFocus = null;
            localeSwitchButtonRef.current?.focus();
        }
    }, [locale]);

    useEffect(() => {
        if (!switching) return;
        const timeoutId = window.setTimeout(() => {
            pendingLocaleFocus = null;
            setSwitching(false);
        }, 5000);
        return () => window.clearTimeout(timeoutId);
    }, [switching]);

    const toggleLocale = (): void => {
        if (switching) return;
        const next = locale === 'ja' ? 'en' : 'ja';
        const query = getLocaleSwitchQuery(searchParams.toString(), next);
        const href = query ? `${pathname}?${query}` : pathname;
        pendingLocaleFocus = next;
        setSwitching(true);
        router.replace(href, { locale: next });
    };

    const handleNavClick = (event: MouseEvent<HTMLAnchorElement>): void => {
        event.currentTarget.closest('details')?.removeAttribute('open');
        const targetId = event.currentTarget.hash.slice(1);
        window.requestAnimationFrame(() => {
            document.getElementById(targetId)?.focus({ preventScroll: true });
        });
    };

    const handleMobileNavKeyDown = (event: KeyboardEvent<HTMLDetailsElement>): void => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
    };

    return (
        <div className="flex shrink-0 items-center gap-3">
            <nav aria-label={navLabel} className="hidden lg:block">
                <ul className="flex items-center gap-5">
                    {navItems.map((item) => (
                        <li key={item.href}>
                            <a
                                href={item.href}
                                onClick={handleNavClick}
                                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-1 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary-strong)] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                            >
                                {item.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
            <details className="group relative lg:hidden" onKeyDown={handleMobileNavKeyDown}>
                <summary
                    data-landing-mobile-nav-trigger
                    className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
                >
                    <span className="sr-only">{navLabel}</span>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" d="M5 7h14M5 12h14M5 17h14" />
                    </svg>
                </summary>
                <nav
                    data-landing-mobile-nav
                    aria-label={navLabel}
                    className="fixed inset-x-4 top-16 z-30 hidden max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg group-open:block sm:left-auto sm:right-6 sm:top-[4.5rem] sm:w-72"
                >
                    <ul className="grid gap-1">
                        {navItems.map((item) => (
                            <li key={item.href}>
                                <a
                                    href={item.href}
                                    onClick={handleNavClick}
                                    className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                                >
                                    {item.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </details>
            <button
                ref={localeSwitchButtonRef}
                type="button"
                onClick={toggleLocale}
                disabled={switching}
                aria-label={switchLabel}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
            >
                {switching && (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                )}
                {locale === 'ja' ? 'English' : '日本語'}
            </button>
        </div>
    );
}

interface LandingProofScrollerProps {
    children: ReactNode;
    label: string;
    hint: string;
}

export function LandingProofScroller({ children, label, hint }: LandingProofScrollerProps) {
    const [showScrollCue, setShowScrollCue] = useState(true);

    const handleScroll = (event: UIEvent<HTMLDListElement>): void => {
        const { clientWidth, scrollLeft, scrollWidth } = event.currentTarget;
        const shouldShowCue = scrollLeft + clientWidth < scrollWidth - 1;
        setShowScrollCue((current) => current === shouldShowCue ? current : shouldShowCue);
    };

    return (
        <>
            <p id="landing-proof-scroll-hint" className="sr-only sm:hidden">{hint}</p>
            <dl
                tabIndex={0}
                aria-label={label}
                aria-describedby="landing-proof-scroll-hint"
                onScroll={handleScroll}
                className="flex w-full min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto pb-1 focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] sm:hidden"
            >
                {children}
            </dl>
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute right-1 top-1/2 flex h-8 w-4 -translate-y-1/2 items-center justify-center text-xl font-black text-[var(--color-reward-strong)] transition-opacity sm:hidden ${showScrollCue ? 'opacity-100' : 'opacity-0'}`}
            >
                →
            </span>
        </>
    );
}

interface EscapeClosableDetailsProps {
    children: ReactNode;
    className?: string;
}

export function EscapeClosableDetails({ children, className }: EscapeClosableDetailsProps) {
    const handleKeyDown = (event: KeyboardEvent<HTMLDetailsElement>): void => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
    };

    return (
        <details className={className} onKeyDown={handleKeyDown}>
            {children}
        </details>
    );
}
