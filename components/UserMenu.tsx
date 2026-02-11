'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { Link } from '@/navigation';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';

interface UserMenuProps {
    user: {
        username?: string | null;
        id?: string | null;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
}

export default function UserMenu({ user }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const t = useTranslations('UserMenu');
    const commonT = useTranslations('Common');

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        function handleEscapeKey(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscapeKey);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscapeKey);
        };
    }, []);

    return (
        <div className="relative ml-3 flex-shrink-0" ref={menuRef}>
            <div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="relative flex flex-shrink-0 rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:ring-offset-2"
                    id="user-menu-button"
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                >
                    <span className="sr-only">{t('signedInAs')}</span>
                    <UserAvatar src={user.image} name={user.name} size="md" borderClass="border-gray-200" />
                </button>
            </div>

            {/* Dropdown menu */}
            {isOpen && (
                <div
                    className="absolute right-0 z-10 mt-2 w-64 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu-button"
                    tabIndex={-1}
                >
                    <Link
                        href={user.username ? `/user/${user.username}` : '/profile'}
                        className="block px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors group"
                        onClick={() => setIsOpen(false)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                                <UserAvatar src={user.image} name={user.name} size="md" borderClass="border-gray-200" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="block text-xs text-gray-500 mb-0.5 font-medium">{t('signedInAs')}</span>
                                <p className="text-sm font-bold text-gray-900 truncate group-hover:text-[var(--theme-primary)] transition-colors">
                                    {user.username || user.name || user.email}
                                </p>
                            </div>
                        </div>
                    </Link>

                    <Link
                        href="/groups"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => setIsOpen(false)}
                    >
                        👥 {t('myGroups')}
                    </Link>

                    <Link
                        href="/wallet"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => setIsOpen(false)}
                    >
                        👛 {t('undouBank')}
                    </Link>

                    <Link
                        href="/shop"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => setIsOpen(false)}
                    >
                        🛍️ {t('ucShop')}
                    </Link>

                    <Link
                        href="/settings"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => setIsOpen(false)}
                    >
                        ⚙️ {commonT('settings')}
                    </Link>

                    <button
                        onClick={() => signOut()}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                        role="menuitem"
                        tabIndex={-1}
                    >
                        🚪 {commonT('logout')}
                    </button>
                </div>
            )}
        </div>
    );
}

