'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';

interface UserMenuProps {
    user: {
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
        <div className="relative ml-3" ref={menuRef}>
            <div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="relative flex rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    id="user-menu-button"
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                >
                    <span className="sr-only">Open user menu</span>
                    {user.image ? (
                        <img
                            className="h-10 w-10 rounded-full border border-gray-200"
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
                    className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu-button"
                    tabIndex={-1}
                >
                    <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
                        Signed in as<br />
                        <strong className="text-gray-900 truncate block">{user.name || user.email}</strong>
                    </div>

                    <Link
                        href="/profile"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => setIsOpen(false)}
                    >
                        Edit Profile
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
