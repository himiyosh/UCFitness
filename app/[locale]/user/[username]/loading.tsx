'use client';

import { useTranslations } from 'next-intl';

import AppBrandMark from '@/components/layout/AppBrandMark';

export default function ProfileLoading() {
    const t = useTranslations('Profile');
    const dashboardT = useTranslations('Dashboard');

    return (
        <main className="flex min-h-[70dvh] flex-1 flex-col bg-[var(--theme-page-bg)]" aria-busy="true">
            <header data-auth-header className="app-safe-top sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-4 sm:h-14 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 items-center gap-2" aria-hidden="true">
                        <AppBrandMark />
                        <span className="text-lg font-black text-[var(--color-text)] sm:text-xl">{dashboardT('title')}</span>
                    </div>
                    <div className="flex items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-0.5" aria-hidden="true">
                        <span className="h-11 w-11 animate-pulse rounded-full bg-[var(--color-surface)]" />
                        <span className="h-11 w-11 animate-pulse rounded-full bg-[var(--color-surface)]" />
                        <span className="h-11 w-11 animate-pulse rounded-full bg-[var(--color-surface)]" />
                    </div>
                </div>
            </header>
            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                <div className="mb-2 h-11 w-48 max-w-full animate-pulse rounded-lg bg-[var(--color-surface-muted)]" aria-hidden="true" />
                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-5">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 animate-pulse rounded-xl bg-[var(--color-primary-soft)]" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--color-text)]" role="status" aria-live="polite" aria-atomic="true">
                                {t('loading')}
                            </p>
                            <div className="h-6 w-40 animate-pulse rounded-full bg-[var(--color-surface-muted)]" />
                            <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded-full bg-[var(--color-surface-muted)]" />
                        </div>
                    </div>
                </section>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="h-80 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]" />
                    <div className="space-y-4 md:col-span-2">
                        <div className="h-32 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]" />
                        <div className="h-64 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]" />
                    </div>
                </div>
            </div>
        </main>
    );
}
