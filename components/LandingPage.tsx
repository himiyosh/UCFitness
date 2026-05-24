'use client';

import { useEffect, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/navigation';

import AuthButtons from '@/components/auth/AuthButtons';

interface BenefitItem {
    metric: string;
    title: string;
    description: string;
}

export default function LandingPage() {
    const t = useTranslations('Landing');
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [switching, setSwitching] = useState(false);

    useEffect(() => {
        setSwitching(false);
    }, [locale]);

    useEffect(() => {
        if (!switching) return;
        const timer = setTimeout(() => setSwitching(false), 5000);
        return () => clearTimeout(timer);
    }, [switching]);

    const toggleLocale = () => {
        if (switching) return;
        const next = locale === 'ja' ? 'en' : 'ja';
        setSwitching(true);
        router.replace(pathname, { locale: next });
    };

    const benefits: BenefitItem[] = [
        {
            metric: t('benefits.habit.metric'),
            title: t('benefits.habit.title'),
            description: t('benefits.habit.desc'),
        },
        {
            metric: t('benefits.compete.metric'),
            title: t('benefits.compete.title'),
            description: t('benefits.compete.desc'),
        },
        {
            metric: t('benefits.reward.metric'),
            title: t('benefits.reward.title'),
            description: t('benefits.reward.desc'),
        },
    ];

    return (
        <main className="relative min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
            {/* ページ背景グラデーション装飾 */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[var(--theme-primary)]/12 via-[var(--theme-gradient-to)]/8 to-transparent blur-3xl" />
                <div className="absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-[var(--theme-gradient-to)]/6 blur-3xl" />
            </div>

            <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-gradient-to)] text-white shadow-md">
                        <BrandMark />
                    </div>
                    <div>
                        <p className="text-base font-bold tracking-tight bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">{t('title')}</p>
                        <p className="text-xs font-medium text-[var(--color-text-muted)]">{t('headerTagline')}</p>
                    </div>
                </div>

                <button
                    onClick={toggleLocale}
                    disabled={switching}
                    aria-label={locale === 'ja' ? 'Switch to English' : '日本語に切り替え'}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] shadow-sm transition-colors hover:border-[var(--theme-primary)] hover:text-[var(--theme-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2"
                >
                    {switching && (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    )}
                    {locale === 'ja' ? 'English' : '日本語'}
                </button>
            </header>

            <section className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-12 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.98fr)] lg:px-8 lg:pb-20 lg:pt-14">
                <div className="max-w-3xl">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/8 px-3 py-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-primary)] animate-pulse" aria-hidden="true" />
                        <p className="text-xs font-semibold text-[var(--theme-primary)]">{t('eyebrow')}</p>
                    </div>
                    <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-[-0.03em] sm:text-5xl lg:text-5xl xl:text-6xl">
                        <span className="text-[var(--color-text)]">{t('headlinePart1')}</span>
                        <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent"> {t('headlinePart2')}</span>
                    </h1>
                    <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--color-text-muted)] sm:text-lg">
                        {t('heroDesc')}
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <AuthButtons />
                        <p className="text-sm font-medium text-[var(--color-text-muted)]">{t('connectFitbit')}</p>
                    </div>

                    <div className="mt-8 flex flex-wrap gap-2" aria-label={t('trustLabel')}>
                        <TrustItem label={t('trust.fitbit')} />
                        <TrustItem label={t('trust.pwa')} />
                        <TrustItem label={t('trust.privacy')} />
                        <TrustItem label={t('trust.i18n')} />
                    </div>
                </div>

                <div className="relative mx-auto w-full max-w-[440px]">
                    <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-[var(--theme-primary)]/20 to-[var(--theme-gradient-to)]/15 blur-2xl" aria-hidden="true" />
                    <div className="relative rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl">
                        <ProductPreview t={t} />
                    </div>
                </div>
            </section>

            {/* 統計バー */}
            <section className="relative mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8" aria-label={t('statsLabel')}>
                <div className="rounded-2xl border border-[var(--color-border)] bg-gradient-to-r from-[var(--theme-primary)]/5 via-[var(--color-surface)] to-[var(--theme-gradient-to)]/5 px-6 py-5">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <StatItem value={t('stats.users.value')} label={t('stats.users.label')} />
                        <StatItem value={t('stats.steps.value')} label={t('stats.steps.label')} />
                        <StatItem value={t('stats.challenges.value')} label={t('stats.challenges.label')} />
                        <StatItem value={t('stats.groups.value')} label={t('stats.groups.label')} />
                    </div>
                </div>
            </section>

            <section className="relative mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
                <div className="grid gap-3 md:grid-cols-3">
                    {benefits.map((benefit, i) => (
                        <article
                            key={benefit.metric}
                            className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-shadow hover:shadow-md"
                        >
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--theme-primary)]/12 to-[var(--theme-gradient-to)]/8">
                                    <BenefitIcon index={i} />
                                </div>
                                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--theme-primary)]">
                                    {benefit.metric}
                                </p>
                            </div>
                            <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">
                                {benefit.title}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                                {benefit.description}
                            </p>
                        </article>
                    ))}
                </div>
            </section>

            <footer className="relative mx-auto w-full max-w-7xl px-4 pb-8 text-xs text-[var(--color-text-muted)] sm:px-6 lg:px-8">
                <div className="border-t border-[var(--color-border)] pt-6">
                    &copy; {new Date().getFullYear()} {t('copyright')}
                </div>
            </footer>
        </main>
    );
}

function TrustItem({ label }: { label: string }) {
    return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 shadow-sm">
            <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-xs font-medium text-[var(--color-text)]">{label}</span>
        </div>
    );
}

function StatItem({ value, label }: { value: string; label: string }) {
    return (
        <div className="text-center">
            <p className="text-2xl font-bold tracking-[-0.02em] bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent sm:text-3xl">
                {value}
            </p>
            <p className="mt-0.5 text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
        </div>
    );
}

function BenefitIcon({ index }: { index: number }) {
    if (index === 0) {
        return (
            <svg className="h-5 w-5 text-[var(--theme-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
        );
    }
    if (index === 1) {
        return (
            <svg className="h-5 w-5 text-[var(--theme-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
        );
    }
    return (
        <svg className="h-5 w-5 text-[var(--theme-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
        </svg>
    );
}

function ProductPreview({ t }: { t: ReturnType<typeof useTranslations<'Landing'>> }) {
    return (
        <div className="rounded-[1.55rem] bg-[#0f172a] p-4 text-white">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-medium text-slate-300">{t('preview.today')}</p>
                    <p className="mt-1 text-4xl font-semibold tracking-[-0.04em] tabular-nums">{t('preview.steps')}</p>
                </div>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                    {t('preview.sync')}
                </span>
            </div>

            <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>{t('preview.goal')}</span>
                    <span>{t('preview.percent')}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div className="h-full w-[78%] rounded-full bg-blue-400" />
                </div>
                <p className="mt-3 text-sm font-semibold text-blue-100">{t('preview.remaining')}</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
                <PreviewMetric label={t('preview.rankLabel')} value={t('preview.rankValue')} />
                <PreviewMetric label={t('preview.rewardLabel')} value={t('preview.rewardValue')} />
            </div>
        </div>
    );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white/8 p-3">
            <p className="text-xs text-slate-300">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        </div>
    );
}

function BrandMark() {
    return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 15.5 8.5 11l3 3L20 5.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 19h14" />
        </svg>
    );
}
