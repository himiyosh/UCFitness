'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function GlobalLoader() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);

    // Stop loading when path changes
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [pathname, searchParams]);

    // Intercept clicks to show loader
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = (e.target as Element).closest('a');
            if (!target) return;

            const href = target.getAttribute('href');
            if (!href) return;

            // Ignore external links, new tabs, etc.
            if (target.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

            // Ignore hash links or same page
            const url = new URL(href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;

            // Trigger Loading
            setIsLoading(true);
        };

        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    if (!isLoading) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in">
            <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-white/80 shadow-xl border border-white/50">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 border-indigo-100"></div>
                <p className="text-gray-600 text-xs font-bold uppercase tracking-wider animate-pulse">Loading...</p>
            </div>
        </div>
    );
}
