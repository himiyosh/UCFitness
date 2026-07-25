'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { runAfterPushRecipientClear } from '@/lib/push-recipient-state';
import { Link } from '@/navigation';

import Spinner from '@/components/ui/Spinner';
import UserAvatar from '@/components/UserAvatar';

import type { FocusEvent, ReactNode } from 'react';

interface UserMenuProps {
    user: {
        username?: string | null;
        id?: string | null;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
}

export default function UserMenu({ user }: UserMenuProps): ReactNode {
    const [isOpen, setIsOpen] = useState(false);
    const [signOutState, setSignOutState] = useState<'idle' | 'clearing' | 'error'>('idle');
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuId = useId();
    const triggerId = `${menuId}-trigger`;
    const t = useTranslations('UserMenu');
    const commonT = useTranslations('Common');
    const accountName = user.username || user.name || user.email || t('signedInAs');
    const profileHref = user.username
        ? `/user/${encodeURIComponent(user.username)}`
        : null;
    const accountSummary = (
        <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
                <UserAvatar src={user.image} name={user.name} size="md" borderClass="border-[var(--color-border)]" />
            </div>
            <div className="min-w-0 flex-1">
                <span className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">{t('signedInAs')}</span>
                <p className="truncate text-sm font-bold text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]">
                    {user.username || user.name || user.email}
                </p>
            </div>
        </div>
    );

    useEffect(() => {
        if (!isOpen) return;

        function handleClickOutside(event: MouseEvent) {
            if (signOutState === 'clearing') return;
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        function handleEscapeKey(event: KeyboardEvent) {
            if (signOutState === 'clearing') return;
            if (event.key === 'Escape') {
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscapeKey);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscapeKey);
        };
    }, [isOpen, signOutState]);

    const toggleMenu = useCallback(() => {
        if (signOutState === 'clearing') return;
        setSignOutState('idle');
        setIsOpen(prev => !prev);
    }, [signOutState]);

    const handleSignOut = useCallback(async (): Promise<void> => {
        if (signOutState === 'clearing') return;
        setSignOutState('clearing');
        try {
            await runAfterPushRecipientClear(
                () => signOut({ redirect: false }),
                (result) => {
                setIsOpen(false);
                    window.location.assign(result.url);
                },
            );
        } catch {
            setSignOutState('error');
        }
    }, [signOutState]);

    const handleMenuBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
        if (signOutState === 'clearing') return;
        if (event.relatedTarget instanceof Node && menuRef.current?.contains(event.relatedTarget)) {
            return;
        }
        setIsOpen(false);
    }, [signOutState]);

    return (
        <div className="relative flex-shrink-0" ref={menuRef} onBlur={handleMenuBlur}>
            <div>
                <button
                    ref={triggerRef}
                    onClick={toggleMenu}
                    className="user-menu-trigger relative flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center overflow-visible rounded-full text-sm transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                    id={triggerId}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? menuId : undefined}
                    aria-label={t('accountMenu', { name: accountName })}
                >
                    <span className="sr-only">{t('accountMenu', { name: accountName })}</span>
                    <UserAvatar
                        src={user.image}
                        name={user.name}
                        size="sm"
                        borderClass="border-[var(--color-primary)]"
                        className="rounded-full ring-2 ring-[var(--color-primary-soft)]"
                    />
                </button>
            </div>

            {/* Dropdown menu */}
            {isOpen && (
                <div
                    id={menuId}
                    className="user-dropdown-menu absolute right-0 z-[70] mt-2 w-64 origin-top-right rounded-xl bg-[var(--color-surface)] py-1 shadow-lg ring-1 ring-[var(--color-border)] animate-fade-in"
                >
                    {profileHref ? (
                        <Link
                            href={profileHref}
                            className="group flex min-h-[56px] items-center border-b border-[var(--color-border)] px-4 py-3 transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                            onClick={() => setIsOpen(false)}
                        >
                            {accountSummary}
                        </Link>
                    ) : (
                        <div className="flex min-h-[56px] items-center border-b border-[var(--color-border)] px-4 py-3" aria-disabled="true">
                            {accountSummary}
                        </div>
                    )}

                    <Link
                        href="/groups"
                        className="flex min-h-[44px] items-center px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        onClick={() => setIsOpen(false)}
                    >
                        👥 {t('myGroups')}
                    </Link>

                    <Link
                        href="/wallet"
                        className="flex min-h-[44px] items-center px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        onClick={() => setIsOpen(false)}
                    >
                        👛 {t('undouBank')}
                    </Link>

                    <Link
                        href="/shop"
                        className="flex min-h-[44px] items-center px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        onClick={() => setIsOpen(false)}
                    >
                        🛍️ {t('ucShop')}
                    </Link>

                    <Link
                        href="/challenges"
                        className="flex min-h-[44px] items-center px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        onClick={() => setIsOpen(false)}
                    >
                        🎯 {t('challenges')}
                    </Link>

                    <Link
                        href="/analytics"
                        className="flex min-h-[44px] items-center px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        onClick={() => setIsOpen(false)}
                    >
                        📊 {t('analytics')}
                    </Link>

                    <Link
                        href="/settings"
                        className="flex min-h-[44px] items-center px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        onClick={() => setIsOpen(false)}
                    >
                        ⚙️ {commonT('settings')}
                    </Link>

                    <button
                        onClick={handleSignOut}
                        aria-busy={signOutState === 'clearing'}
                        aria-disabled={signOutState === 'clearing'}
                        aria-describedby={signOutState === 'error' ? `${menuId}-signout-error` : undefined}
                        className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left text-sm text-[var(--color-danger)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] aria-disabled:cursor-wait aria-disabled:opacity-70"
                    >
                        {signOutState === 'clearing' ? <span aria-hidden="true"><Spinner size="xs" /></span> : <span aria-hidden="true">🚪</span>}
                        {signOutState === 'clearing' ? t('signingOut') : signOutState === 'error' ? t('retrySignOut') : commonT('logout')}
                    </button>
                    {signOutState === 'error' && (
                        <p id={`${menuId}-signout-error`} className="px-4 py-2 text-xs font-medium text-[var(--color-danger)]">{t('signOutProtectionError')}</p>
                    )}
                </div>
            )}
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{signOutState === 'clearing' ? t('signingOut') : ''}</span>
            <span className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{signOutState === 'error' ? t('signOutProtectionError') : ''}</span>
        </div>
    );
}
