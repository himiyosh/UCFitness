'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';

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

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className="relative ml-3 flex-shrink-0" ref={menuRef}>
            <div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="relative flex flex-shrink-0 rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    id="user-menu-button"
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                >
                    <span className="sr-only">Open user menu</span>
                    {user.image ? (
                        <img
                            className="h-10 w-10 rounded-full border border-gray-200 object-cover"
                            src={user.image}
                            alt=""
                        />
                    ) : (
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm border border-indigo-200">
                            {user.name?.[0] || 'U'}
                        </div>
                    )}
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
                        href="/profile"
                        className="block px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors group"
                        onClick={() => setIsOpen(false)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                                {user.image ? (
                                    <img
                                        className="h-10 w-10 rounded-full border border-gray-200 object-cover group-hover:border-indigo-300 transition-colors"
                                        src={user.image}
                                        alt=""
                                    />
                                ) : (
                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm border border-indigo-200 group-hover:border-indigo-300 transition-colors">
                                        {user.name?.[0] || 'U'}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="block text-xs text-gray-500 mb-0.5 font-medium">Signed in as</span>
                                <p className="text-sm font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
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
                        My Groups
                    </Link>

                    <button
                        onClick={() => signOut()}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                        role="menuitem"
                        tabIndex={-1}
                    >
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
