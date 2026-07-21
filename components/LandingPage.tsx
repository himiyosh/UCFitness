import { getTranslations } from 'next-intl/server';

import {
    getAuthErrorMessageKey,
    getSafeAuthCallbackPath,
} from '@/lib/auth-flow';
import { Link } from '@/navigation';

import AuthButtons from '@/components/auth/AuthButtons';
import {
    EscapeClosableDetails,
    LandingHeaderControls,
    LandingProofScroller,
} from '@/components/landing/LandingInteractions';
import StoredCallbackAuthButtons from '@/components/landing/StoredCallbackAuthButtons';

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

interface BenefitListProps {
    benefits: BenefitItem[];
    compact?: boolean;
}

interface TrustItemProps {
    label: string;
    className?: string;
    inverse?: boolean;
}

interface AuthContext {
    title: string;
    description: string;
    callbackUrl: string;
}

interface AuthErrorContext {
    title: string;
    description: string;
    action: string;
}

type LandingTranslations = Awaited<ReturnType<typeof getTranslations<'Landing'>>>;

interface LandingPageProps {
    locale: string;
    searchParams: Record<string, string | string[] | undefined>;
}

export default async function LandingPage({ locale, searchParams }: LandingPageProps) {
    const [t, footerT] = await Promise.all([
        getTranslations('Landing'),
        getTranslations('Footer'),
    ]);

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

    const navItems = [
        { href: '#how-it-works', label: t('nav.how') },
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
            label: t('heroHighlights.rank'),
            value: t('floating.rank.value'),
            tone: 'violet',
        },
        {
            label: t('preview.bonusLabel'),
            value: t('floating.reward.value'),
            tone: 'amber',
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
    const authParam = getSearchParam(searchParams.auth);
    const nextParam = getSearchParam(searchParams.next);
    const errorParam = getSearchParam(searchParams.error);
    const authContext = authParam === 'required'
        ? getAuthContext(nextParam, locale, t)
        : null;
    const authErrorKey = getAuthErrorMessageKey(errorParam);
    const authErrorContext = authErrorKey
        ? {
            title: t(`authError.${authErrorKey}.title`),
            description: t(`authError.${authErrorKey}.desc`),
            action: t('authError.action'),
        }
        : null;

    return (
        <div className="min-h-screen overflow-x-clip bg-[var(--color-bg)] pt-14 text-[var(--color-text)] sm:pt-16">
            <div className="landing-scroll-progress" aria-hidden="true" />
            <header className="fixed inset-x-0 top-0 z-50 h-14 border-b border-[var(--color-border)] bg-[var(--color-surface)] sm:h-16">
                <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-solid)] text-white shadow-sm">
                            <BrandMark />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-base font-black tracking-tight text-[var(--color-text)] sm:text-lg">
                                {t('title')}
                            </p>
                            <p className="hidden truncate text-xs font-medium text-[var(--color-text-muted)] sm:block">
                                {t('headerTagline')}
                            </p>
                        </div>
                    </div>

                    <LandingHeaderControls
                        locale={locale}
                        navItems={navItems}
                        navLabel={t('nav.label')}
                        switchLabel={locale === 'ja' ? 'Switch to English' : '日本語に切り替え'}
                    />
                </div>
            </header>

            <main
                id="public-main-content"
                tabIndex={-1}
                className="scroll-mt-14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] sm:scroll-mt-[4.25rem]"
            >
                {authErrorContext && (
                    <AuthErrorNotice
                        context={authErrorContext}
                        callbackUrl={authContext?.callbackUrl}
                    />
                )}
                {authContext && <AuthGateNotice context={authContext} />}

                <section className="relative overflow-hidden border-b border-[var(--color-border)]" aria-labelledby="landing-headline">
                    <div className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 xl:py-24">
                        <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(30rem,1.1fr)] xl:gap-14">
                            <div className="landing-hero-copy min-w-0 max-w-2xl">
                                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-success-soft)] px-3 py-1.5 text-[var(--color-success-strong)]">
                                    <span className="landing-sync-dot h-2 w-2 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
                                    <p className="text-xs font-semibold sm:text-sm">{t('eyebrow')}</p>
                                </div>
                                <h1
                                    id="landing-headline"
                                    className="text-balance text-3xl font-black leading-[1.08] tracking-[-0.035em] text-[var(--color-text)] sm:text-4xl xl:text-5xl"
                                >
                                    <span className="block">{t('headlinePart1')}</span>
                                    <span className="block text-[var(--color-primary-strong)]">{t('headlinePart2')}</span>
                                </h1>
                                <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-[var(--color-text-muted)]">
                                    {t('heroDesc')}
                                </p>

                                {!authErrorContext && (
                                    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                        <AuthButtons callbackUrl={authContext?.callbackUrl} />
                                        <p className="max-w-sm text-sm font-medium leading-5 text-[var(--color-text-muted)] sm:max-w-56">
                                            {t('connectFitbit')}
                                        </p>
                                    </div>
                                )}

                                <ul aria-label={t('trustLabel')} className="mt-5 hidden min-w-0 flex-wrap gap-x-4 gap-y-2 sm:flex">
                                    <TrustItem label={t('trust.fitbit')} className="inline-flex" />
                                    <TrustItem label={t('trust.privacy')} className="inline-flex" />
                                    <TrustItem label={t('trust.pwa')} className="hidden sm:inline-flex" />
                                    <TrustItem label={t('trust.i18n')} className="hidden xl:inline-flex" />
                                </ul>
                            </div>

                            <div className="landing-hero-preview relative mx-auto w-full max-w-[560px] min-w-0">
                                <div>
                                    <ProductPreview t={t} />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="proof" tabIndex={-1} aria-label={t('statsLabel')} className="scroll-mt-16 bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] sm:scroll-mt-[4.25rem]">
                    <div className="relative mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 sm:py-10 lg:px-8">
                        <LandingProofScroller label={t('statsLabel')} hint={t('statsScrollHint')}>
                            {proofItems.map((item) => (
                                <ProofTile key={item.label} item={item} />
                            ))}
                        </LandingProofScroller>
                        <dl aria-label={t('statsLabel')} className="hidden w-full min-w-0 sm:grid sm:grid-cols-2 sm:gap-4">
                            {proofItems.map((item) => (
                                <ProofTile key={item.label} item={item} />
                            ))}
                        </dl>
                    </div>
                </section>

                <DeferredLandingSections
                    t={t}
                    journeyItems={journeyItems}
                    rewardPreviewItems={rewardPreviewItems}
                    benefits={benefits}
                    callbackUrl={authContext?.callbackUrl}
                    authAction={authErrorContext?.action}
                    restoreStoredCallback={Boolean(authErrorContext)}
                />
            </main>

            <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="mx-auto flex min-h-20 w-full max-w-7xl flex-col justify-center gap-2 px-4 py-4 text-sm text-[var(--color-text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                    <div className="flex items-center gap-2 font-bold text-[var(--color-text)]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
                            <BrandMark />
                        </span>
                        {t('title')}
                    </div>
                    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label={footerT('legalLinks')}>
                        <Link className="inline-flex min-h-[44px] items-center rounded-lg hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]" href="/legal/terms">{footerT('terms')}</Link>
                        <Link className="inline-flex min-h-[44px] items-center rounded-lg hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]" href="/legal/privacy">{footerT('privacy')}</Link>
                        <a className="inline-flex min-h-[44px] items-center rounded-lg hover:text-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]" href="https://studio344.net/contact" target="_blank" rel="noopener noreferrer">{footerT('contact')}</a>
                    </nav>
                    <p>&copy; {new Date().getFullYear()} {t('copyright')}</p>
                </div>
            </footer>
        </div>
    );
}

interface DeferredLandingSectionsProps {
    t: LandingTranslations;
    journeyItems: JourneyItem[];
    rewardPreviewItems: RewardPreviewItem[];
    benefits: BenefitItem[];
    callbackUrl?: string;
    authAction?: string;
    restoreStoredCallback: boolean;
}

function DeferredLandingSections({
    t,
    journeyItems,
    rewardPreviewItems,
    benefits,
    callbackUrl,
    authAction,
    restoreStoredCallback,
}: DeferredLandingSectionsProps) {
    return (
        <>
            <section
                id="how-it-works"
                tabIndex={-1}
                aria-labelledby="landing-journey-title"
                className="scroll-mt-16 border-y border-[var(--color-border)] bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] sm:scroll-mt-[4.25rem]"
            >
                <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-14 lg:px-8 lg:py-16">
                    <div className="max-w-xl lg:sticky lg:top-28">
                        <h2 id="landing-journey-title" className="text-balance text-2xl font-black tracking-tight text-[var(--color-text)] sm:text-3xl">
                            {t('journeyTitle')}
                        </h2>
                        <p className="mt-3 max-w-lg text-pretty text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
                            {t('journeyDesc')}
                        </p>
                    </div>
                    <ol className="grid gap-x-5 sm:grid-cols-2">
                        {journeyItems.map((item, index) => (
                            <JourneyCard key={item.label} item={item} index={index} />
                        ))}
                    </ol>
                </div>
            </section>

            <section className="bg-[var(--color-surface)]">
                <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14 lg:px-8 lg:py-16">
                    <div className="min-w-0">
                        <h2 className="text-balance text-2xl font-black tracking-tight text-[var(--color-text)] sm:text-3xl">
                            {t('showcaseTitle')}
                        </h2>
                        <p className="mt-3 max-w-xl text-pretty text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
                            {t('showcaseDesc')}
                        </p>
                        <div className="mt-6 space-y-4">
                            <ShowcaseCard title={t('showcase.today.title')} description={t('showcase.today.desc')} index={0} />
                            <ShowcaseCard title={t('showcase.league.title')} description={t('showcase.league.desc')} index={1} />
                        </div>
                    </div>
                    <div className="landing-showcase-stage relative grid grid-cols-[1.15fr_0.85fr] gap-3 overflow-hidden rounded-[2rem] bg-[var(--color-primary-soft)] p-4 lg:block lg:min-h-80 lg:p-6">
                        <div className="h-40 lg:h-52 lg:w-[72%]">
                            <MiniDashboardGraphic t={t} />
                        </div>
                        <div className="h-40 lg:absolute lg:bottom-6 lg:right-6 lg:h-36 lg:w-[48%]">
                            <MiniLeagueGraphic />
                        </div>
                    </div>
                </div>
            </section>

            <section
                id="rewards"
                tabIndex={-1}
                aria-labelledby="landing-rewards-title"
                className="scroll-mt-16 bg-[var(--color-reward-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] sm:scroll-mt-[4.25rem]"
            >
                <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-16">
                    <div className="max-w-2xl">
                        <p className="text-sm font-bold text-[var(--color-reward-strong)]">{t('rewardPreview.label')}</p>
                        <h2 id="landing-rewards-title" className="mt-2 text-balance text-2xl font-black tracking-tight text-[var(--color-text)] sm:text-3xl">
                            {t('rewardPreview.title')}
                        </h2>
                        <p className="mt-3 max-w-xl text-pretty text-sm leading-6 text-[var(--color-reward-strong)] sm:text-base">
                            {t('rewardPreview.desc')}
                        </p>
                    </div>
                    <ol className="mt-6 grid gap-4 sm:grid-cols-3 lg:mt-8 lg:gap-8">
                        {rewardPreviewItems.map((item, index) => (
                            <RewardPreviewCard key={item.label} item={item} index={index} />
                        ))}
                    </ol>
                </div>
            </section>

            <section className="relative overflow-hidden bg-[var(--color-primary-solid)] text-[var(--color-inverse-text)]">
                <div className="pointer-events-none absolute -right-16 -top-20 hidden h-56 w-56 rounded-full bg-white/10 lg:block" aria-hidden="true" />
                <div className="relative mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8 xl:py-12">
                    <EscapeClosableDetails className="group xl:hidden">
                        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-primary-solid)] [&::-webkit-details-marker]:hidden">
                            <h2 className="text-balance text-lg font-black tracking-tight text-white">
                                {t('benefitsTitle')}
                            </h2>
                            <svg className="h-5 w-5 shrink-0 text-white transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                            </svg>
                        </summary>
                        <BenefitList benefits={benefits} compact />
                        <div className="mt-5 border-t border-white/30 pt-4">
                            <p className="text-sm font-bold text-white">{t('trustLabel')}</p>
                            <ul className="mt-3 grid gap-2">
                                <TrustItem label={t('trust.fitbit')} className="flex" inverse />
                                <TrustItem label={t('trust.privacy')} className="flex" inverse />
                                <TrustItem label={t('trust.pwa')} className="flex" inverse />
                                <TrustItem label={t('trust.i18n')} className="flex" inverse />
                            </ul>
                        </div>
                    </EscapeClosableDetails>
                    <div className="hidden xl:block">
                        <h2 className="max-w-2xl text-balance text-2xl font-black tracking-tight sm:text-3xl">
                            {t('benefitsTitle')}
                        </h2>
                        <BenefitList benefits={benefits} />
                    </div>
                </div>
            </section>

            <section id="start" className="scroll-mt-16 bg-[var(--color-play-soft)] sm:scroll-mt-[4.25rem]">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 md:flex-row md:items-center md:justify-between lg:px-8">
                    <div className="max-w-3xl">
                        <h2 className="text-balance text-2xl font-black tracking-tight text-[var(--color-text)] sm:text-3xl">
                            {t('finalCta.title')}
                        </h2>
                        <p className="mt-3 text-pretty text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
                            {t('finalCta.desc')}
                        </p>
                    </div>
                    <div className="shrink-0">
                        <StoredCallbackAuthButtons
                            callbackUrl={callbackUrl}
                            label={authAction}
                            restoreStoredCallback={restoreStoredCallback}
                        />
                    </div>
                </div>
            </section>
        </>
    );
}

function getAuthContext(nextPath: string | null, locale: string, t: LandingTranslations): AuthContext | null {
    const safeNextPath = getSafeAuthCallbackPath(nextPath, locale);
    if (!nextPath) return null;

    const contextKey = getAuthContextKey(safeNextPath);
    return {
        title: t(`authGate.${contextKey}.title`),
        description: t(`authGate.${contextKey}.desc`),
        callbackUrl: safeNextPath,
    };
}

function getSearchParam(value: string | string[] | undefined): string | null {
    return typeof value === 'string' ? value : null;
}

function getAuthContextKey(nextPath: string): string {
    if (nextPath.includes('/settings')) return 'settings';
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
        <div className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
            <div
                role="status"
                aria-live="polite"
                className="rounded-2xl border border-[var(--color-reward)] bg-[var(--color-reward-soft)] px-4 py-3 text-[var(--color-reward-strong)]"
            >
                <p className="text-sm font-bold">{context.title}</p>
                <p className="mt-1 text-sm leading-6">{context.description}</p>
            </div>
        </div>
    );
}

function AuthErrorNotice({
    context,
    callbackUrl,
}: {
    context: AuthErrorContext;
    callbackUrl?: string;
}) {
    return (
        <section className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6 lg:px-8" aria-label={context.title}>
            <div className="rounded-xl border border-[var(--color-danger)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
                <div role="alert" aria-atomic="true">
                    <p className="text-sm font-bold text-[var(--color-danger-strong)]">{context.title}</p>
                    <p className="mt-1 max-w-prose text-sm leading-6 text-[var(--color-text)]">
                        {context.description}
                    </p>
                </div>
                <div className="mt-3">
                    <StoredCallbackAuthButtons
                        callbackUrl={callbackUrl}
                        label={context.action}
                        restoreStoredCallback
                    />
                </div>
            </div>
        </section>
    );
}

function TrustItem({ label, className = '', inverse = false }: TrustItemProps) {
    const textClass = inverse ? 'text-white' : 'text-[var(--color-text-muted)]';
    const iconClass = inverse ? 'text-white' : 'text-[var(--color-success-strong)]';

    return (
        <li className={`shrink-0 items-center gap-1.5 ${textClass} ${className}`}>
            <svg className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-xs font-medium">{label}</span>
        </li>
    );
}

function BenefitList({ benefits, compact = false }: BenefitListProps) {
    return (
        <div className={compact ? 'mt-4 grid gap-4' : 'mt-8 grid gap-7 xl:grid-cols-3 xl:gap-8'}>
            {benefits.map((benefit, index) => (
                <article
                    key={benefit.metric}
                    className="min-w-0 border-t border-white/30 pt-4"
                >
                    <div className="flex items-center gap-3">
                        <div className={getBenefitIconClass(index)}>
                            <BenefitIcon index={index} />
                        </div>
                        <p className="text-sm font-bold text-white">{benefit.metric}</p>
                    </div>
                    <h3 className="mt-3 text-lg font-bold tracking-tight text-white">
                        {benefit.title}
                    </h3>
                    <p className={`${compact ? 'mt-2 text-sm leading-6 text-white/90' : 'sr-only sm:not-sr-only sm:mt-2 sm:text-sm sm:leading-6 sm:text-white/90'}`}>
                        {benefit.description}
                    </p>
                </article>
            ))}
        </div>
    );
}

function RewardPreviewCard({ item, index }: { item: RewardPreviewItem; index: number }) {
    return (
        <li className="min-w-0 border-t border-[var(--color-reward)]/40 pt-5">
            <div className={`landing-reward-node inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-bold ${getRewardPreviewCardClass(index)}`}>
                {item.label}
            </div>
            <p className="mt-3 text-xl font-black tabular-nums text-[var(--color-text)]">{item.value}</p>
            <h3 className="mt-2 text-base font-bold text-[var(--color-text)]">{item.title}</h3>
            <p className="sr-only xl:not-sr-only xl:mt-2 xl:max-w-sm xl:text-sm xl:leading-6 xl:text-[var(--color-text-muted)]">
                {item.description}
            </p>
        </li>
    );
}

function ProofTile({ item }: { item: ProofItem }) {
    const toneClass = getProofToneClass(item.tone);

    return (
        <div className="landing-proof-tile flex w-[min(19.5rem,calc(100%_-_3rem))] shrink-0 snap-start items-center justify-between gap-2.5 rounded-2xl bg-[var(--color-bg)] p-3 sm:w-auto sm:min-w-0 sm:gap-3 sm:p-4">
            <StatItem value={item.value} label={item.label} tone={item.tone} toneClass={toneClass} />
        </div>
    );
}

function getProofToneClass(tone: ProofItem['tone']): string {
    if (tone === 'emerald') return 'bg-[var(--color-success)]';
    if (tone === 'amber') return 'bg-[var(--color-reward)]';
    if (tone === 'violet') return 'bg-[var(--color-competition)]';
    return 'bg-[var(--color-primary)]';
}

function getProofValueClass(tone: ProofItem['tone']): string {
    if (tone === 'emerald') return 'text-[var(--color-success-strong)]';
    if (tone === 'amber') return 'text-[var(--color-reward-strong)]';
    if (tone === 'violet') return 'text-[var(--color-competition-strong)]';
    return 'text-[var(--color-primary-strong)]';
}

function HighlightChip({ label, tone, toneClass }: { label: string; tone: ProofItem['tone']; toneClass: string }) {
    return (
        <dt className={`inline-flex min-w-0 max-w-full items-start gap-2 whitespace-normal rounded-xl px-3 py-1.5 text-left text-xs font-semibold leading-5 ${getHighlightClass(tone)}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneClass}`} aria-hidden="true" />
            <span className="min-w-0 break-words">{label}</span>
        </dt>
    );
}

function StatItem({
    value,
    label,
    tone,
    toneClass,
}: {
    value: string;
    label: string;
    tone: ProofItem['tone'];
    toneClass: string;
}) {
    return (
        <>
            <HighlightChip label={label} tone={tone} toneClass={toneClass} />
            <dd className={`shrink-0 break-words text-left text-base font-black leading-6 sm:text-right sm:text-lg ${getProofValueClass(tone)}`}>{value}</dd>
        </>
    );
}

function JourneyCard({ item, index }: { item: JourneyItem; index: number }) {
    return (
        <li className="min-w-0 border-t border-[var(--color-border)] py-4 sm:py-5">
            <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${getJourneyCardClass(index)}`}>
                    <JourneyIcon index={index} />
                </div>
                <div className="min-w-0">
                    <p className={`text-xs font-bold ${getJourneyTextClass(index)}`}>{item.label}</p>
                    <h3 className="mt-1.5 text-base font-bold tracking-tight text-[var(--color-text)]">{item.title}</h3>
                </div>
            </div>
            <p className="sr-only xl:not-sr-only xl:mt-3 xl:text-sm xl:leading-6 xl:text-[var(--color-text-muted)]">{item.description}</p>
        </li>
    );
}

function ShowcaseCard({ title, description, index }: { title: string; description: string; index: number }) {
    return (
        <article className="flex min-w-0 gap-3 border-t border-[var(--color-border)] pt-4">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${getJourneyCardClass(index === 0 ? 0 : 2)}`}>
                {index === 0 ? <BrandMark /> : <JourneyIcon index={2} />}
            </div>
            <div className="min-w-0">
                <h3 className="text-base font-bold tracking-tight text-[var(--color-text)]">{title}</h3>
                <p className="sr-only xl:not-sr-only xl:mt-1.5 xl:text-sm xl:leading-6 xl:text-[var(--color-text-muted)]">{description}</p>
            </div>
        </article>
    );
}

function BenefitIcon({ index }: { index: number }) {
    if (index === 0) {
        return (
            <svg className="h-5 w-5 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
        );
    }
    if (index === 1) {
        return (
            <svg className="h-5 w-5 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
        );
    }
    return (
        <svg className="h-5 w-5 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
        </svg>
    );
}

function ProductPreview({ t }: { t: LandingTranslations }) {
    return (
        <figure
            aria-label={t('showcase.today.title')}
            className="landing-preview-card overflow-hidden rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg sm:p-4"
        >
            <div className="rounded-3xl bg-[var(--color-primary-soft)] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-[var(--color-text-muted)]">{t('preview.today')}</p>
                        <p className="mt-1 text-4xl font-black tracking-[-0.04em] tabular-nums text-[var(--color-text)] sm:text-5xl">
                            {t('preview.steps')}
                        </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-xs font-bold text-[var(--color-success-strong)]">
                        <span className="landing-sync-dot h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
                        {t('preview.sync')}
                    </span>
                </div>

                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_72px] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_88px]">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text-muted)]">{t('preview.goal')}</p>
                        <p className="mt-1 text-base font-black leading-6 text-[var(--color-primary-strong)]">
                            {t('preview.remaining')}
                        </p>
                        <p className="mt-1.5 text-xs font-bold leading-5 text-[var(--color-success-strong)]">
                            {t('preview.nextAction')}
                        </p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface)]">
                            <div className="landing-dashboard-progress h-full w-[78%] rounded-full bg-[var(--color-primary)]" />
                        </div>
                    </div>
                    <div className="relative flex h-[72px] w-[72px] items-center justify-center sm:h-[88px] sm:w-[88px]">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
                            <circle cx="22" cy="22" r="17" fill="none" stroke="var(--color-surface)" strokeWidth="5" />
                            <circle
                                className="landing-step-ring"
                                cx="22"
                                cy="22"
                                r="17"
                                fill="none"
                                pathLength="100"
                                stroke="var(--color-primary)"
                                strokeDasharray="100"
                                strokeDashoffset="22"
                                strokeLinecap="round"
                                strokeWidth="5"
                            />
                        </svg>
                        <span className="absolute text-base font-black tabular-nums text-[var(--color-primary-strong)] sm:text-lg">
                            {t('preview.percent')}
                        </span>
                    </div>
                </div>

            </div>
        </figure>
    );
}

function getHighlightClass(tone: ProofItem['tone']): string {
    if (tone === 'emerald') return 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]';
    if (tone === 'amber') return 'border-[var(--color-reward)] bg-[var(--color-reward-soft)] text-[var(--color-reward-strong)]';
    if (tone === 'violet') return 'border-[var(--color-competition)] bg-[var(--color-competition-soft)] text-[var(--color-competition-strong)]';
    return 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]';
}

function getJourneyCardClass(index: number): string {
    if (index === 0) return 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]';
    if (index === 1) return 'bg-[var(--color-success-soft)] text-[var(--color-success-strong)]';
    if (index === 2) return 'bg-[var(--color-competition-soft)] text-[var(--color-competition-strong)]';
    return 'bg-[var(--color-reward-soft)] text-[var(--color-reward-strong)]';
}

function getJourneyTextClass(index: number): string {
    if (index === 0) return 'text-[var(--color-primary-strong)]';
    if (index === 1) return 'text-[var(--color-success-strong)]';
    if (index === 2) return 'text-[var(--color-competition-strong)]';
    return 'text-[var(--color-reward-strong)]';
}

function getRewardPreviewCardClass(index: number): string {
    if (index === 0) return 'bg-[var(--color-success-soft)] text-[var(--color-success-strong)]';
    if (index === 1) return 'bg-[var(--color-surface)] text-[var(--color-reward-strong)]';
    return 'bg-[var(--color-surface)] text-[var(--color-competition-strong)]';
}

function getBenefitIconClass(index: number): string {
    const baseClass = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white';
    if (index === 0) return `${baseClass} text-[var(--color-primary-solid)]`;
    if (index === 1) return `${baseClass} text-[var(--color-competition-solid)]`;
    return `${baseClass} text-[var(--color-reward-strong)]`;
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
        <svg className="h-5 w-5 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={paths[index] ?? paths[0]} />
        </svg>
    );
}

function MiniDashboardGraphic({ t }: { t: LandingTranslations }) {
    return (
        <div className="h-full rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--color-competition-strong)]">
                    {t('preview.challengeLabel')}
                </p>
                <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
            </div>
            <p className="mt-2 min-h-10 text-sm font-bold leading-5 text-[var(--color-text)]">
                {t('preview.challengeValue')}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                <div className="landing-dashboard-progress h-full w-4/5 rounded-full bg-[var(--color-competition)]" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2" aria-hidden="true">
                <div className="h-7 rounded-lg bg-[var(--color-primary-soft)]" />
                <div className="h-7 rounded-lg bg-[var(--color-success-soft)]" />
                <div className="h-7 rounded-lg bg-[var(--color-reward-soft)]" />
            </div>
        </div>
    );
}

function MiniLeagueGraphic() {
    return (
        <div className="h-full rounded-2xl bg-[var(--color-surface)] p-4 shadow-lg">
            <div className="flex h-full items-end gap-2">
                <div className="landing-league-bar h-12 flex-1 rounded-t-xl bg-[var(--color-primary-soft)]" />
                <div className="landing-league-bar h-24 flex-1 rounded-t-xl bg-[var(--color-primary)]" />
                <div className="landing-league-bar h-18 flex-1 rounded-t-xl bg-[var(--color-competition)]" />
                <div className="landing-league-bar h-10 flex-1 rounded-t-xl bg-[var(--color-reward)]" />
            </div>
        </div>
    );
}
