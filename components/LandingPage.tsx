'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useLocale, useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/navigation';

import AuthButtons from '@/components/auth/AuthButtons';

interface BenefitItem {
    metric: string;
    title: string;
    description: string;
}

interface JourneyItem {
    label: string;
    title: string;
    description: string;
}

interface RewardPreviewItem {
    label: string;
    title: string;
    description: string;
    value: string;
}

interface ProofItem {
    label: string;
    value: string;
    tone: 'blue' | 'emerald' | 'amber' | 'violet';
}

interface AuthContext {
    title: string;
    description: string;
    callbackUrl: string;
}

type LandingTranslations = ReturnType<typeof useTranslations<'Landing'>>;

export default function LandingPage() {
    const t = useTranslations('Landing');
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
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
        const query = searchParams.toString();
        const href = query ? `${pathname}?${query}` : pathname;
        setSwitching(true);
        router.replace(href, { locale: next });
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

    const heroHighlights = [
        t('heroHighlights.goal'),
        t('heroHighlights.rank'),
        t('heroHighlights.reward'),
    ];

    const navItems = [
        { href: '#rewards', label: t('nav.rewards') },
        { href: '#proof', label: t('nav.proof') },
    ];

    const rewardPreviewItems: RewardPreviewItem[] = [
        {
            label: t('rewardPreview.restart.label'),
            title: t('rewardPreview.restart.title'),
            description: t('rewardPreview.restart.desc'),
            value: t('rewardPreview.restart.value'),
        },
        {
            label: t('rewardPreview.earn.label'),
            title: t('rewardPreview.earn.title'),
            description: t('rewardPreview.earn.desc'),
            value: t('rewardPreview.earn.value'),
        },
        {
            label: t('rewardPreview.spend.label'),
            title: t('rewardPreview.spend.title'),
            description: t('rewardPreview.spend.desc'),
            value: t('rewardPreview.spend.value'),
        },
    ];

    const proofItems: ProofItem[] = [
        {
            label: t('stats.steps.label'),
            value: t('stats.steps.value'),
            tone: 'blue',
        },
        {
            label: t('floating.rank.label'),
            value: t('floating.rank.value'),
            tone: 'emerald',
        },
        {
            label: t('floating.reward.label'),
            value: t('floating.reward.value'),
            tone: 'amber',
        },
        {
            label: t('preview.challengeLabel'),
            value: t('preview.challengeValue'),
            tone: 'violet',
        },
    ];

    const journeyItems: JourneyItem[] = [
        {
            label: t('journey.sync.label'),
            title: t('journey.sync.title'),
            description: t('journey.sync.desc'),
        },
        {
            label: t('journey.move.label'),
            title: t('journey.move.title'),
            description: t('journey.move.desc'),
        },
        {
            label: t('journey.compete.label'),
            title: t('journey.compete.title'),
            description: t('journey.compete.desc'),
        },
        {
            label: t('journey.reward.label'),
            title: t('journey.reward.title'),
            description: t('journey.reward.desc'),
        },
    ];
    const authContext = searchParams.get('auth') === 'required'
        ? getAuthContext(searchParams.get('next'), locale, t)
        : null;

    return (
        <main className="relative min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
            <div className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--color-inverse-surface)] text-[var(--color-inverse-text)]">
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                    <div className="animate-float absolute -top-48 left-1/2 h-[760px] w-[1120px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[var(--theme-primary)]/45 via-[var(--theme-gradient-to)]/28 to-transparent blur-3xl" />
                    <div className="animate-float-delayed absolute -right-32 top-20 h-[520px] w-[520px] rounded-full bg-[var(--theme-gradient-to)]/30 blur-3xl" />
                    <div className="animate-pulse-gentle absolute -bottom-40 left-0 h-[420px] w-[520px] rounded-full bg-[var(--theme-primary)]/25 blur-3xl" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:48px_48px] opacity-50" />
                </div>

            <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[var(--color-inverse-surface)] shadow-md">
                        <BrandMark />
                    </div>
                    <div>
                        <p className="text-base font-bold tracking-tight text-white">{t('title')}</p>
                        <p className="text-xs font-medium text-white/65">{t('headerTagline')}</p>
                    </div>
                </div>

                <button
                    onClick={toggleLocale}
                    disabled={switching}
                    aria-label={locale === 'ja' ? 'Switch to English' : '日本語に切り替え'}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-white/15 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-inverse-surface)]"
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

            <nav aria-label={t('nav.label')} className="hidden">
                <ul className="flex gap-1.5 overflow-x-auto pb-1">
                    {navItems.map((item) => (
                        <li key={item.href} className="shrink-0">
                            <a
                                href={item.href}
                                className="inline-flex min-h-[44px] items-center rounded-full border border-white/15 bg-white/10 px-3.5 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-inverse-surface)]"
                            >
                                {item.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>

            {authContext && <AuthGateNotice context={authContext} />}

            <section className="relative mx-auto grid w-full max-w-7xl flex-1 content-start gap-6 px-4 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] lg:px-8 lg:pt-20">
                <div className="max-w-3xl">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
                        <p className="text-xs font-semibold text-white">{t('eyebrow')}</p>
                    </div>
                    <h1 className="text-balance text-3xl font-bold leading-[1.08] tracking-[-0.03em] sm:text-4xl lg:text-5xl">
                        <span className="text-white">{t('headlinePart1')}</span>
                        <span className="bg-gradient-to-r from-white via-blue-100 to-emerald-100 bg-clip-text text-transparent"> {t('headlinePart2')}</span>
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72 sm:text-base sm:leading-7">
                        {t('heroDesc')}
                    </p>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <AuthButtons callbackUrl={authContext?.callbackUrl} />
                        <p className="text-sm font-medium text-white/65">{t('connectFitbit')}</p>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
                        {heroHighlights.map((highlight) => (
                            <HighlightChip key={highlight} label={highlight} />
                        ))}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:hidden" aria-label={t('mobileInsightsLabel')}>
                        <InlineInsightCard
                            label={t('floating.rank.label')}
                            value={t('floating.rank.value')}
                            tone="primary"
                        />
                        <InlineInsightCard
                            label={t('floating.reward.label')}
                            value={t('floating.reward.value')}
                            tone="reward"
                        />
                    </div>

                    <div className="mt-3 hidden flex-wrap gap-2 sm:flex" aria-label={t('trustLabel')}>
                        <TrustItem label={t('trust.fitbit')} />
                        <TrustItem label={t('trust.pwa')} />
                        <TrustItem label={t('trust.privacy')} />
                        <TrustItem label={t('trust.i18n')} />
                    </div>

                    <div className="mt-3 hidden max-w-2xl grid-cols-2 gap-2 sm:grid lg:grid-cols-4" aria-label={t('statsLabel')}>
                        {proofItems.map((item) => (
                            <ProofTile key={item.label} item={item} />
                        ))}
                    </div>
                </div>

                <div className="relative mx-auto hidden w-full max-w-[430px] self-start sm:block lg:mt-4">
                    <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-[var(--theme-primary)]/25 via-[var(--theme-gradient-to)]/20 to-[var(--color-surface)] blur-2xl" aria-hidden="true" />
                    <div className="relative rounded-[1.75rem] border border-white/70 bg-white/90 p-2.5 shadow-2xl backdrop-blur-xl">
                        <ProductPreview t={t} />
                    </div>
                    <FloatingInsightCard
                        className="-left-2 top-10 hidden sm:block"
                        label={t('floating.rank.label')}
                        value={t('floating.rank.value')}
                        tone="primary"
                    />
                    <FloatingInsightCard
                        className="-right-2 bottom-16 hidden sm:block"
                        label={t('floating.reward.label')}
                        value={t('floating.reward.value')}
                        tone="reward"
                    />
                </div>
            </section>
            </div>

            <section id="proof" className="hidden" aria-label={t('statsLabel')}>
                <div className="rounded-2xl border border-white/15 bg-gradient-to-br from-[var(--color-primary-solid)] to-[var(--color-inverse-surface)] px-4 py-4 text-white shadow-xl sm:px-6">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatItem value={t('stats.users.value')} label={t('stats.users.label')} />
                        <StatItem value={t('stats.steps.value')} label={t('stats.steps.label')} />
                        <StatItem value={t('stats.challenges.value')} label={t('stats.challenges.label')} />
                        <StatItem value={t('stats.groups.value')} label={t('stats.groups.label')} />
                    </div>
                </div>
            </section>

            <section id="rewards" className="hidden">
                <div className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm md:grid-cols-[0.82fr_1.18fr] md:p-4">
                    <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-[var(--theme-primary)] p-4 text-white">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">{t('rewardPreview.label')}</p>
                        <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{t('rewardPreview.title')}</h2>
                        <p className="mt-2 text-sm leading-6 text-white/80">{t('rewardPreview.desc')}</p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
                        {rewardPreviewItems.map((item) => (
                            <RewardPreviewCard key={item.label} item={item} />
                        ))}
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="hidden">
                <div className="mb-4 max-w-2xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">{t('journeyLabel')}</p>
                    <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--color-text)] sm:text-2xl">
                        {t('journeyTitle')}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                        {t('journeyDesc')}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                    {journeyItems.map((item, index) => (
                        <JourneyCard key={item.label} item={item} index={index} />
                    ))}
                </div>
            </section>

            <section className="hidden">
                <div className="grid gap-3 lg:grid-cols-[0.82fr_1.18fr]">
                    <div className="rounded-2xl bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-gradient-to)] p-5 text-white shadow-xl sm:p-6">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">{t('showcaseLabel')}</p>
                        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                            {t('showcaseTitle')}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-white/80">
                            {t('showcaseDesc')}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <ShowcaseCard title={t('showcase.today.title')} description={t('showcase.today.desc')} index={0} />
                        <ShowcaseCard title={t('showcase.league.title')} description={t('showcase.league.desc')} index={1} />
                    </div>
                </div>
            </section>

            <section className="hidden">
                <div className="grid gap-3 md:grid-cols-3">
                    {benefits.map((benefit, i) => (
                        <article
                            key={benefit.metric}
                            className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-sm transition-shadow hover:shadow-md sm:p-4"
                        >
                            <div className="mb-3 flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--theme-primary)]/10 to-[var(--theme-gradient-to)]/10">
                                    <BenefitIcon index={i} />
                                </div>
                                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-primary)]">
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

            <section id="start" className="hidden">
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-5">
                    <div className="max-w-2xl">
                        <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)] sm:text-2xl">
                            {t('finalCta.title')}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
                            {t('finalCta.desc')}
                        </p>
                    </div>
                    <div className="mt-5 shrink-0 sm:mt-0">
                        <AuthButtons callbackUrl={authContext?.callbackUrl} />
                    </div>
                </div>
            </section>

            <footer className="hidden">
                <div className="border-t border-[var(--color-border)] pt-6">
                    &copy; {new Date().getFullYear()} {t('copyright')}
                </div>
            </footer>
        </main>
    );
}

function getAuthContext(nextPath: string | null, locale: string, t: LandingTranslations): AuthContext | null {
    const safeNextPath = getSafeNextPath(nextPath, locale);
    if (!nextPath) return null;

    const contextKey = getAuthContextKey(safeNextPath);
    return {
        title: t(`authGate.${contextKey}.title`),
        description: t(`authGate.${contextKey}.desc`),
        callbackUrl: safeNextPath,
    };
}

function getSafeNextPath(nextPath: string | null, locale: string): string {
    if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
        return `/${locale}`;
    }
    return nextPath;
}

function getAuthContextKey(nextPath: string): string {
    if (nextPath.includes('/shop')) return 'shop';
    if (nextPath.includes('/wallet')) return 'wallet';
    if (nextPath.includes('/profile') || nextPath.includes('/user/')) return 'profile';
    if (nextPath.includes('/groups')) return 'groups';
    if (nextPath.includes('/leaderboard')) return 'leaderboard';
    if (nextPath.includes('/challenges')) return 'challenges';
    return 'default';
}

function AuthGateNotice({ context }: { context: AuthContext }) {
    return (
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-3 sm:px-6 lg:px-8">
            <div role="status" aria-live="polite" className="rounded-2xl border border-amber-200/70 bg-amber-100 px-4 py-3 text-amber-950 shadow-lg">
                <p className="text-sm font-bold">{context.title}</p>
                <p className="mt-1 text-sm leading-6">{context.description}</p>
            </div>
        </div>
    );
}

function TrustItem({ label }: { label: string }) {
    return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 shadow-sm backdrop-blur-md">
            <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-xs font-medium text-white">{label}</span>
        </div>
    );
}

function InlineInsightCard({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'reward' }) {
    const toneClass = tone === 'primary'
        ? 'text-[var(--color-primary)] bg-[var(--color-primary-soft)]'
        : 'text-amber-700 bg-amber-100';

    return (
        <div className="rounded-2xl border border-white/15 bg-white/10 p-3 shadow-sm backdrop-blur-md">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/65">{label}</p>
            <p className={`mt-2 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${toneClass}`}>{value}</p>
        </div>
    );
}

function RewardPreviewCard({ item }: { item: RewardPreviewItem }) {
    return (
        <article className="w-56 shrink-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5 sm:w-auto sm:p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">{item.label}</p>
            <p className="mt-2 text-lg font-black tabular-nums text-[var(--color-text)]">{item.value}</p>
            <h3 className="mt-2 text-sm font-bold text-[var(--color-text)]">{item.title}</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{item.description}</p>
        </article>
    );
}

function ProofTile({ item }: { item: ProofItem }) {
    const toneClass = getProofToneClass(item.tone);

    return (
        <div className="rounded-xl border border-white/10 bg-white/10 px-2.5 py-2 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${toneClass} animate-pulse-gentle`} aria-hidden="true" />
                <p className="truncate text-xs font-bold tracking-[0.04em] text-white/58">{item.label}</p>
            </div>
            <p className="mt-1 truncate text-sm font-black text-white">{item.value}</p>
        </div>
    );
}

function getProofToneClass(tone: ProofItem['tone']): string {
    if (tone === 'emerald') return 'bg-emerald-300';
    if (tone === 'amber') return 'bg-amber-300';
    if (tone === 'violet') return 'bg-violet-300';
    return 'bg-blue-300';
}

function HighlightChip({ label }: { label: string }) {
    return (
        <div className="rounded-xl border border-white/15 bg-white/10 px-2 py-2 shadow-sm backdrop-blur-md sm:rounded-2xl sm:px-3 sm:py-3">
            <p className="text-xs font-semibold leading-4 text-white sm:text-sm sm:leading-5">{label}</p>
        </div>
    );
}

function StatItem({ value, label }: { value: string; label: string }) {
    return (
        <div className="text-center">
            <p className="text-xl font-bold tracking-[-0.02em] text-white sm:text-2xl">
                {value}
            </p>
            <p className="mt-0.5 text-xs font-medium text-white/70">{label}</p>
        </div>
    );
}

function JourneyCard({ item, index }: { item: JourneyItem; index: number }) {
    return (
        <article className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm sm:p-4">
            <div className="absolute -right-8 -top-8 h-16 w-16 rounded-full bg-[var(--theme-primary)]/10 sm:h-20 sm:w-20" aria-hidden="true" />
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--theme-primary)]/10 to-[var(--theme-gradient-to)]/10 sm:h-9 sm:w-9">
                <JourneyIcon index={index} />
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)] sm:mt-4">{item.label}</p>
            <h3 className="mt-1.5 text-sm font-semibold tracking-tight text-[var(--color-text)] sm:text-base">{item.title}</h3>
            <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-muted)] sm:mt-2 sm:text-sm sm:leading-6">{item.description}</p>
        </article>
    );
}

function ShowcaseCard({ title, description, index }: { title: string; description: string; index: number }) {
    return (
        <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm sm:p-4">
            <div className="mb-3 h-16 rounded-xl bg-[var(--color-surface-muted)] p-2.5 sm:mb-4 sm:h-24 sm:p-3">
                {index === 0 ? <MiniDashboardGraphic /> : <MiniLeagueGraphic />}
            </div>
            <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)] sm:text-base">{title}</h3>
            <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-muted)] sm:mt-2 sm:text-sm sm:leading-6">{description}</p>
        </article>
    );
}

function FloatingInsightCard({
    label,
    value,
    tone,
    className,
}: {
    label: string;
    value: string;
    tone: 'primary' | 'reward';
    className: string;
}) {
    const toneClass = tone === 'primary'
        ? 'text-[var(--color-primary)] bg-[var(--color-primary-soft)]'
        : 'text-amber-700 bg-amber-100';

    return (
        <div className={`absolute rounded-2xl border border-white/70 bg-white/90 px-3 py-2.5 shadow-xl backdrop-blur-md ${className}`}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
            <p className={`mt-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${toneClass}`}>{value}</p>
        </div>
    );
}

function BenefitIcon({ index }: { index: number }) {
    if (index === 0) {
        return (
            <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
        );
    }
    if (index === 1) {
        return (
            <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
        );
    }
    return (
        <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
        </svg>
    );
}

function ProductPreview({ t }: { t: ReturnType<typeof useTranslations<'Landing'>> }) {
    return (
        <div className="overflow-hidden rounded-[1.4rem] bg-[var(--color-inverse-surface)] p-3 text-[var(--color-inverse-text)]">
            <div className="rounded-[1.1rem] bg-white/10 p-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-medium text-white/60">{t('preview.today')}</p>
                        <p className="mt-1 text-3xl font-bold tracking-[-0.04em] tabular-nums">{t('preview.steps')}</p>
                    </div>
                    <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                        {t('preview.sync')}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'conic-gradient(var(--theme-primary) 78%, rgba(255,255,255,0.12) 0)' }}>
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-inverse-surface)]">
                            <span className="text-lg font-bold tabular-nums">{t('preview.percent')}</span>
                        </div>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-white/60">{t('preview.goal')}</p>
                        <p className="mt-1 text-sm font-semibold leading-6 text-blue-100">{t('preview.remaining')}</p>
                    </div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
                <PreviewMetric label={t('preview.rankLabel')} value={t('preview.rankValue')} />
                <PreviewMetric label={t('preview.rewardLabel')} value={t('preview.rewardValue')} />
            </div>

            <div className="mt-3 rounded-xl bg-white p-3 text-[var(--color-text)]">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-[var(--color-text-muted)]">{t('preview.challengeLabel')}</p>
                        <p className="mt-1 text-sm font-bold">{t('preview.challengeValue')}</p>
                    </div>
                    <div className="flex -space-x-2" aria-hidden="true">
                        <span className="h-8 w-8 rounded-full border-2 border-white bg-[var(--theme-primary)]/80" />
                        <span className="h-8 w-8 rounded-full border-2 border-white bg-[var(--theme-gradient-to)]/80" />
                        <span className="h-8 w-8 rounded-full border-2 border-white bg-amber-400" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-white/10 p-2.5">
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

function JourneyIcon({ index }: { index: number }) {
    const paths = [
        'M8 7h8M8 12h8M8 17h5',
        'M4 15.5 8.5 11l3 3L20 5.5M5 19h14',
        'M7.5 21H3V11h4.5v10Zm6.75 0H9.75V5h4.5v16ZM21 21h-4.5v-7H21v7Z',
        'M12 3l2.6 5.3 5.9.9-4.25 4.14 1 5.85L12 16.43 6.75 19.2l1-5.85L3.5 9.2l5.9-.9L12 3Z',
    ];

    return (
        <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={paths[index] ?? paths[0]} />
        </svg>
    );
}

function MiniDashboardGraphic() {
    return (
        <div className="h-full rounded-xl bg-white p-3">
            <div className="flex items-center justify-between">
                <div className="h-3 w-20 rounded-full bg-[var(--color-surface-muted)]" />
                <div className="h-6 w-12 rounded-full bg-[var(--color-primary-soft)]" />
            </div>
            <div className="mt-4 h-4 w-28 rounded-full bg-[var(--color-inverse-surface)]" />
            <div className="mt-3 h-2 rounded-full bg-[var(--color-surface-muted)]">
                <div className="h-full w-4/5 rounded-full bg-[var(--theme-primary)]" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="h-8 rounded-xl bg-[var(--color-primary-soft)]" />
                <div className="h-8 rounded-xl bg-[var(--color-surface-muted)]" />
                <div className="h-8 rounded-xl bg-[var(--color-surface-muted)]" />
            </div>
        </div>
    );
}

function MiniLeagueGraphic() {
    return (
        <div className="h-full rounded-xl bg-white p-3">
            <div className="flex h-full items-end gap-2">
                <div className="h-12 flex-1 rounded-t-xl bg-[var(--color-primary-soft)]" />
                <div className="h-20 flex-1 rounded-t-xl bg-[var(--theme-primary)]" />
                <div className="h-16 flex-1 rounded-t-xl bg-[var(--theme-gradient-to)]/70" />
                <div className="h-9 flex-1 rounded-t-xl bg-amber-300" />
            </div>
        </div>
    );
}
