'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { Link } from '@/navigation';
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
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuId = useId();
    const triggerId = `${menuId}-trigger`;
    const t = useTranslations('UserMenu');
    const commonT = useTranslations('Common');
    const accountName = user.username || user.name || user.email || t('signedInAs');

    useEffect(() => {
        if (!isOpen) return;

        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        function handleEscapeKey(event: KeyboardEvent) {
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
    }, [isOpen]);

    const toggleMenu = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    const handleSignOut = useCallback(() => {
        setIsOpen(false);
        signOut();
    }, []);

    const handleMenuBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
        if (event.relatedTarget instanceof Node && menuRef.current?.contains(event.relatedTarget)) {
            return;
        }
        setIsOpen(false);
    }, []);

    return (
        <div className="relative flex-shrink-0" ref={menuRef} onBlur={handleMenuBlur}>
            <div>
                <button
                    ref={triggerRef}
                    onClick={toggleMenu}
                    className="relative flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center overflow-visible rounded-full text-sm transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
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
                    <Link
                        href={user.username ? `/user/${user.username}` : '/profile'}
                        className="group flex min-h-[56px] items-center border-b border-[var(--color-border)] px-4 py-3 transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        onClick={() => setIsOpen(false)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                                <UserAvatar src={user.image} name={user.name} size="md" borderClass="border-[var(--color-border)]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="mb-0.5 block text-xs font-medium text-[var(--color-text-muted)]">{t('signedInAs')}</span>
                                <p className="truncate text-sm font-bold text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]">
                                    {user.username || user.name || user.email}
                                </p>
                            </div>
                        </div>
                    </Link>

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
                        className="flex min-h-[44px] w-full items-center px-4 py-2 text-left text-sm text-[var(--color-danger)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                    >
                        🚪 {commonT('logout')}
                    </button>
                </div>
            )}
        </div>
    );
}
