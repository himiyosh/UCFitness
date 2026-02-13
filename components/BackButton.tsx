'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface BackButtonProps {
    className?: string;
    children?: React.ReactNode;
}

/** デフォルトのクラス名（コンポーネント外に定数化） */
const DEFAULT_CLASS = "text-gray-500 hover:text-[var(--theme-primary)] font-medium flex items-center gap-1 w-fit transition-colors group cursor-pointer";

export default function BackButton({ className, children }: BackButtonProps) {
    const router = useRouter();
    const t = useTranslations('Common');

    const handleBack = useCallback(() => {
        router.back();
    }, [router]);

    return (
        <button
            type="button"
            onClick={handleBack}
            className={className || DEFAULT_CLASS}
            aria-label={t('back')}
        >
            {children || (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 group-hover:-translate-x-1 transition-transform" aria-hidden="true">
                        <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                    </svg>
                    {t('back')}
                </>
            )}
        </button>
    );
}
