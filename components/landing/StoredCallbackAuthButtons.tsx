'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';

import AuthButtons from '@/components/auth/AuthButtons';
import {
    AUTH_CALLBACK_STORAGE_KEY,
    getSafeAuthCallbackPath,
} from '@/lib/auth-flow';

interface StoredCallbackAuthButtonsProps {
    callbackUrl?: string;
    label?: string;
    restoreStoredCallback?: boolean;
}

export default function StoredCallbackAuthButtons({
    callbackUrl,
    label,
    restoreStoredCallback = false,
}: StoredCallbackAuthButtonsProps) {
    const locale = useLocale();
    const [storedCallbackUrl, setStoredCallbackUrl] = useState<string>();

    useEffect(() => {
        if (!restoreStoredCallback || callbackUrl) {
            setStoredCallbackUrl(undefined);
            return;
        }
        const storedPath = window.sessionStorage.getItem(AUTH_CALLBACK_STORAGE_KEY);
        setStoredCallbackUrl(
            storedPath ? getSafeAuthCallbackPath(storedPath, locale) : undefined,
        );
    }, [callbackUrl, locale, restoreStoredCallback]);

    return <AuthButtons callbackUrl={callbackUrl ?? storedCallbackUrl} label={label} />;
}
