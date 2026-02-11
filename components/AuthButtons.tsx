'use client';

import { signIn, signOut, useSession } from "next-auth/react";
import { useTranslations } from 'next-intl';

export default function AuthButtons() {
    const { data: session } = useSession();
    const t = useTranslations('Common');

    if (session) return null;


    return (
        <div className="flex gap-4">
            <button
                onClick={() => signIn('fitbit')}
                className="cursor-pointer rounded-lg bg-[var(--theme-primary)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 transition-all"
            >
                {t('signInWithFitbit')}
            </button>
        </div>
    );
}
