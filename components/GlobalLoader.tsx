'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function GlobalLoader() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);

    // パス変更時にローディングを停止
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [pathname, searchParams]);

    // リンククリックを検知してローダーを表示
    const handleClick = useCallback((e: MouseEvent) => {
        const target = (e.target as Element).closest('a');
        if (!target) return;

        const href = target.getAttribute('href');
        if (!href) return;

        // 外部リンク・新規タブ・修飾キー付きクリックは除外
        if (target.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        // ハッシュリンク・同一ページは除外
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;

        setIsLoading(true);
    }, []);

    useEffect(() => {
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [handleClick]);

    if (!isLoading) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in"
            role="status"
            aria-label="Loading"
        >
            <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-white/80 shadow-xl border border-white/50">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[var(--theme-primary)] border-[var(--theme-primary-light)]" aria-hidden="true" />
                <p className="text-gray-600 text-xs font-bold uppercase tracking-wider animate-pulse" aria-hidden="true">Loading...</p>
            </div>
        </div>
    );
}
