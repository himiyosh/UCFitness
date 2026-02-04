'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/navigation';

interface User {
    language?: string | null;
}

export default function LanguageSyncer({ user }: { user: User | undefined }) {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const syncedRef = useRef(false);

    useEffect(() => {
        if (!user || !user.language) return;
        if (syncedRef.current) return;

        // If the user's preferred language (from DB/Session) doesn't match the current locale
        // We redirect them. This ensures consistency on login / new device.
        if (user.language !== locale && ['ja', 'en'].includes(user.language)) {
            console.log(`[LanguageSyncer] Syncing language from ${locale} to ${user.language}`);
            syncedRef.current = true; // Prevent loop
            router.replace(pathname, { locale: user.language });
        }
    }, [user, locale, pathname, router]);

    return null;
}
