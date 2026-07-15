'use client';

import { useCallback, useState } from 'react';

import { signIn, useSession } from "next-auth/react";
import { useLocale, useTranslations } from 'next-intl';

import {
    AUTH_CALLBACK_STORAGE_KEY,
    getSafeAuthCallbackPath,
} from '@/lib/auth-flow';

interface AuthButtonsProps {
    callbackUrl?: string;
    label?: string;
}

export default function AuthButtons({ callbackUrl, label }: AuthButtonsProps) {
    const { data: session } = useSession();
    const t = useTranslations('Common');
    const locale = useLocale();
    const [loading, setLoading] = useState(false);
    const safeCallbackUrl = callbackUrl
        ? getSafeAuthCallbackPath(callbackUrl, locale)
        : undefined;

    const handleSignIn = useCallback(async (): Promise<void> => {
        if (loading) return;
        setLoading(true);
        try {
            if (safeCallbackUrl) {
                window.sessionStorage.setItem(AUTH_CALLBACK_STORAGE_KEY, safeCallbackUrl);
            } else {
                window.sessionStorage.removeItem(AUTH_CALLBACK_STORAGE_KEY);
            }
            await signIn('fitbit', safeCallbackUrl ? { callbackUrl: safeCallbackUrl } : undefined);
        } finally {
            setLoading(false);
        }
    }, [loading, safeCallbackUrl]);

    if (session) return null;


    return (
        <div className="flex gap-4">
            <button
                onClick={handleSignIn}
                disabled={loading}
                aria-busy={loading}
                className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--color-primary-solid,#1d4ed8)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-professional-soft)] transition-colors hover:bg-[var(--color-inverse-surface,#111827)] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
            >
                {loading && (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                )}
                {loading ? t('loading') : (label ?? t('signInWithFitbit'))}
            </button>
        </div>
    );
}
