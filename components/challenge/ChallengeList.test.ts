import { existsSync } from 'node:fs';

import tailwindcss from '@tailwindcss/postcss';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

import enMessages from '../../messages/en.json';
import jaMessages from '../../messages/ja.json';
import { MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS } from '../../lib/services/challenge-utils';

const challengeMessages = {
    en: enMessages.Challenge,
    ja: jaMessages.Challenge,
};
const ACTIVE_CHALLENGE_COUNT = 9;

describe('ChallengeList Hall of Fame', () => {
    it('終了イベント全体と個人達成をja/enで区別する', () => {
        expect(jaMessages.Challenge.completed).toBe('開催履歴');
        expect(jaMessages.Challenge.historyDescription).toContain('未参加・未達成');
        expect(jaMessages.Challenge.historyPersonalMarker).toContain('あなた自身');
        expect(jaMessages.Challenge.listEmptyCompleted).toContain('終了したチャレンジ');
        expect(jaMessages.Challenge.listEmptyCompleted).not.toContain('達成した履歴');

        expect(enMessages.Challenge.completed).toBe('History');
        expect(enMessages.Challenge.historyDescription).toContain('did not join or complete');
        expect(enMessages.Challenge.historyPersonalMarker).toContain('your own record');
        expect(enMessages.Challenge.listEmptyCompleted).toContain('ended challenges');
        expect(enMessages.Challenge.listEmptyCompleted).not.toContain('You have not completed');
    });

    it('開始前表示と既存履歴をキーボードと320/375/1280pxで正しく表示する', async () => {
        const styles = await postcss([tailwindcss()]).process(
            [
                '@import "tailwindcss" source(none);',
                '@source "./components/challenge/ChallengeList.tsx";',
                '@source "./components/challenge/ChallengeCard.tsx";',
                '@source "./components/challenge/EditChallengeModal.tsx";',
            ].join(' '),
            { from: `${process.cwd()}/challenge-list-test.css` },
        );
        const bundle = await build({
            stdin: {
                contents: `
                    import {StrictMode, useState} from 'react';
                    import {createRoot} from 'react-dom/client';
                    import ChallengeList from './components/challenge/ChallengeList';
                    import ChallengeCard from './components/challenge/ChallengeCard';
                    import EditChallengeModal from './components/challenge/EditChallengeModal';
                    import enMessages from './messages/en.json';
                    import jaMessages from './messages/ja.json';

                    globalThis.challengeMessages = {en: enMessages, ja: jaMessages};
                    const baseChallenge = {
                        description: null,
                        type: 'INDIVIDUAL',
                        target_steps: 10000,
                        start_date: '2020-01-01',
                        reward_uc: 500,
                        is_active: true,
                        participant_count: 0,
                        participant_avatars: [],
                    };
                    const activeChallenges = [
                        {...baseChallenge, id: 'active-unjoined', title: 'Active unjoined', end_date: '2099-01-05', is_joined: false},
                        {...baseChallenge, id: 'active-more', title: 'Active more remaining', end_date: '2099-01-04', is_joined: true},
                        {...baseChallenge, id: 'active-less', title: 'Active less remaining', end_date: '2099-01-03', is_joined: true},
                        {...baseChallenge, id: 'active-upcoming', title: 'Upcoming preview', start_date: '2099-01-02', end_date: '2099-01-06', is_joined: false},
                        {...baseChallenge, id: 'ending-unjoined', title: 'Ending unjoined', end_date: '2099-01-01', is_joined: false},
                        {...baseChallenge, id: 'ending-joined', title: 'Ending joined', end_date: '2099-01-01', is_joined: true},
                        {...baseChallenge, id: 'ending-creator', title: 'Ending creator', end_date: '2099-01-01', is_joined: true, created_by: 'viewer'},
                        {...baseChallenge, id: 'visibility-ending', title: 'Visibility ending', end_date: '2099-01-02', is_joined: false},
                        {...baseChallenge, id: 'long-upcoming', title: 'Long upcoming', start_date: '2099-02-20', end_date: '2099-02-25', is_joined: false},
                    ];
                    const endedChallenges = [
                        {...baseChallenge, id: 'history-unjoined', title: 'History unjoined', end_date: '2020-01-02', is_joined: false},
                        {...baseChallenge, id: 'history-achieved', title: 'History achieved', end_date: '2020-01-02', is_joined: true},
                        {...baseChallenge, id: 'history-incomplete', title: 'History incomplete', end_date: '2020-01-02', is_joined: true},
                    ];
                    const progressById = {
                        'active-more': 1000,
                        'active-less': 9000,
                        'ending-joined': 5000,
                        'ending-creator': 5000,
                        'history-achieved': 12000,
                        'history-incomplete': 5000,
                    };
                    globalThis.fetch = async (input, init = {}) => {
                        const url = new URL(String(input), 'https://ucfitness.test');
                        if (init.method === 'PUT' && url.pathname === '/api/challenge/edit-boundary') {
                            const count = Number(document.body.dataset.challengeEditPutCount ?? '0');
                            document.body.dataset.challengeEditPutCount = String(count + 1);
                            return {ok: true, json: async () => ({})};
                        }
                        if (url.pathname === '/api/challenge') {
                            const status = url.searchParams.get('status');
                            const previous = document.body.dataset.challengeRequests;
                            document.body.dataset.challengeRequests = previous
                                ? previous + ',' + status
                                : String(status);
                            return {
                                ok: true,
                                json: async () => ({
                                    challenges: status === 'active'
                                        ? activeChallenges
                                        : status === 'completed'
                                            ? endedChallenges
                                            : [],
                                }),
                            };
                        }
                        const progressMatch = url.pathname.match(/^\\/api\\/challenge\\/([^/]+)\\/progress$/);
                        if (progressMatch) {
                            const totalSteps = progressById[progressMatch[1]];
                            return {
                                ok: totalSteps !== undefined,
                                json: async () => ({progress: {total_steps: totalSteps}}),
                            };
                        }
                        return {ok: false, json: async () => ({})};
                    };

                    const root = createRoot(document.querySelector('#root'));
                    const strictCardRoot = createRoot(document.querySelector('#strict-card-root'));
                    const editModalRoot = createRoot(document.querySelector('#edit-modal-root'));
                    let editModalRevision = 0;
                    function EditModalHarness({endDate}) {
                        const [isOpen, setIsOpen] = useState(true);
                        return (
                            <EditChallengeModal
                                isOpen={isOpen}
                                challenge={{
                                    ...baseChallenge,
                                    id: 'edit-boundary',
                                    title: 'Edit boundary',
                                    start_date: '2099-02-01',
                                    end_date: endDate,
                                }}
                                onClose={() => {
                                    const count = Number(document.body.dataset.challengeEditCloseCount ?? '0');
                                    document.body.dataset.challengeEditCloseCount = String(count + 1);
                                    setIsOpen(false);
                                }}
                                onUpdated={() => {
                                    const count = Number(document.body.dataset.challengeEditUpdatedCount ?? '0');
                                    document.body.dataset.challengeEditUpdatedCount = String(count + 1);
                                }}
                            />
                        );
                    }
                    globalThis.renderChallengeList = (locale) => {
                        document.documentElement.lang = locale;
                        root.render(<ChallengeList key={locale} currentUserId="viewer" />);
                    };
                    globalThis.clearChallengeList = () => root.render(null);
                    globalThis.renderStrictChallengeCard = (startDate, endDate) => {
                        strictCardRoot.render(
                            <StrictMode>
                                <ChallengeCard
                                    key="strict-boundary-card"
                                    challenge={{
                                        ...baseChallenge,
                                        id: 'strict-boundary-card',
                                        title: 'Strict boundary card',
                                        start_date: startDate,
                                        end_date: endDate,
                                        is_joined: false,
                                    }}
                                />
                            </StrictMode>,
                        );
                    };
                    globalThis.clearStrictChallengeCard = () => strictCardRoot.render(null);
                    globalThis.renderEditChallengeModal = (endDate) => {
                        editModalRevision += 1;
                        editModalRoot.render(
                            <EditModalHarness key={editModalRevision} endDate={endDate} />,
                        );
                    };
                    globalThis.clearEditChallengeModal = () => editModalRoot.render(null);
                `,
                loader: 'tsx',
                resolveDir: process.cwd(),
            },
            bundle: true,
            format: 'iife',
            jsx: 'automatic',
            platform: 'browser',
            write: false,
            plugins: [{
                name: 'challenge-list-test-resolver',
                setup(context) {
                    context.onResolve(
                        {
                            filter: /^@\/components\/challenge\/(?:ChallengeGearBanner|ChallengeDetailModal)$/,
                        },
                        ({ path }) => ({ path, namespace: 'component-stub' }),
                    );
                    context.onLoad({ filter: /.*/, namespace: 'component-stub' }, () => ({
                        contents: 'export default function ComponentStub() { return null; }',
                    }));
                    context.onResolve({ filter: /^next\/dynamic$/ }, () => ({
                        path: 'next/dynamic',
                        namespace: 'dynamic-stub',
                    }));
                    context.onLoad({ filter: /.*/, namespace: 'dynamic-stub' }, () => ({
                        contents: `
                            export default function dynamic() {
                                return function DynamicStub(props) {
                                    if (props?.isOpen) {
                                        document.body.dataset.challengeDetailOpened = 'true';
                                    }
                                    return null;
                                };
                            }
                        `,
                    }));
                    context.onResolve({ filter: /^next-intl$/ }, () => ({
                        path: 'next-intl',
                        namespace: 'next-intl-stub',
                    }));
                    context.onLoad({ filter: /.*/, namespace: 'next-intl-stub' }, () => ({
                        contents: `
                            const translators = new Map();
                            export const useTranslations = (namespace) => {
                                const locale = document.documentElement.lang;
                                const cacheKey = locale + ':' + namespace;
                                if (!translators.has(cacheKey)) {
                                    translators.set(cacheKey, (key, values = {}) => {
                                        const message = globalThis.challengeMessages[locale]?.[namespace]?.[key] ?? key;
                                        return Object.entries(values).reduce(
                                            (text, [name, value]) => text.replaceAll('{' + name + '}', String(value)),
                                            message,
                                        );
                                    });
                                }
                                return translators.get(cacheKey);
                            };
                        `,
                    }));
                    context.onResolve({ filter: /^@\// }, ({ path: importPath }) => {
                        const basePath = `${process.cwd()}/${importPath.slice(2)}`;
                        const resolvedPath = ['.tsx', '.ts'].map(
                            (extension) => `${basePath}${extension}`,
                        ).find(existsSync);
                        return resolvedPath ? { path: resolvedPath } : undefined;
                    });
                },
            }],
        });

        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
            page.setDefaultTimeout(5_000);
            const beforeUpcomingStart = new Date('2099-01-01T14:59:59.800Z');
            await page.clock.install({ time: new Date('2099-01-01T14:59:50Z') });
            const pageErrors: string[] = [];
            const consoleErrors: string[] = [];
            page.on('pageerror', (error) => pageErrors.push(error.message));
            page.on('console', (message) => {
                if (message.type() === 'error') consoleErrors.push(message.text());
            });
            await page.setContent(
                '<button id="edit-modal-trigger" type="button" style="min-height:44px">Edit trigger</button><main style="padding-inline: 16px"><div id="root"></div><div id="strict-card-root"></div><div id="edit-modal-root"></div></main>',
            );
            await page.addStyleTag({ content: styles.css });
            await page.addScriptTag({ content: bundle.outputFiles[0].text });
            await page.evaluate(() => {
                const pendingTimers = new Map<number, number>();
                const timerDelays: number[] = [];
                const visibilityListeners = new Set<EventListenerOrEventListenerObject>();
                const nativeSetTimeout = window.setTimeout.bind(window);
                const nativeClearTimeout = window.clearTimeout.bind(window);
                const nativeAddEventListener = document.addEventListener.bind(document);
                const nativeRemoveEventListener = document.removeEventListener.bind(document);
                let simulatedVisibilityState = document.visibilityState;

                window.setTimeout = ((
                    handler: TimerHandler,
                    timeout = 0,
                    ...args: unknown[]
                ): number => {
                    let timerId = 0;
                    const trackedHandler = (...callbackArgs: unknown[]) => {
                        pendingTimers.delete(timerId);
                        if (typeof handler === 'function') {
                            handler(...callbackArgs);
                        }
                    };
                    timerId = nativeSetTimeout(trackedHandler, timeout, ...args);
                    pendingTimers.set(timerId, timeout);
                    timerDelays.push(timeout);
                    return timerId;
                }) as typeof window.setTimeout;
                window.clearTimeout = ((timerId?: number): void => {
                    if (typeof timerId === 'number') pendingTimers.delete(timerId);
                    nativeClearTimeout(timerId);
                }) as typeof window.clearTimeout;
                document.addEventListener = ((
                    type: string,
                    listener: EventListenerOrEventListenerObject,
                    options?: boolean | AddEventListenerOptions,
                ): void => {
                    if (type === 'visibilitychange') visibilityListeners.add(listener);
                    nativeAddEventListener(type, listener, options);
                }) as typeof document.addEventListener;
                document.removeEventListener = ((
                    type: string,
                    listener: EventListenerOrEventListenerObject,
                    options?: boolean | EventListenerOptions,
                ): void => {
                    if (type === 'visibilitychange') visibilityListeners.delete(listener);
                    nativeRemoveEventListener(type, listener, options);
                }) as typeof document.removeEventListener;
                Object.defineProperty(document, 'visibilityState', {
                    configurable: true,
                    get: () => simulatedVisibilityState,
                });
                Reflect.set(globalThis, 'getChallengeLifecycleMetrics', () => ({
                    pendingTimerDelays: [...pendingTimers.values()],
                    timerDelays: [...timerDelays],
                    visibilityListenerCount: visibilityListeners.size,
                }));
                Reflect.set(globalThis, 'resetChallengeTimerDelays', () => {
                    timerDelays.length = 0;
                });
                Reflect.set(globalThis, 'setChallengeVisibility', (state: DocumentVisibilityState) => {
                    simulatedVisibilityState = state;
                    document.dispatchEvent(new Event('visibilitychange'));
                });
            });
            await page.clock.pauseAt(beforeUpcomingStart);

            for (const locale of ['ja', 'en'] as const) {
                const messages = challengeMessages[locale];
                await page.clock.setSystemTime(beforeUpcomingStart);
                await page.evaluate((nextLocale) => {
                    const render = Reflect.get(globalThis, 'renderChallengeList');
                    if (typeof render !== 'function') throw new Error('ChallengeList renderer missing');
                    render(nextLocale);
                }, locale);

                await page.waitForFunction(() => (
                    document.querySelector('[role="tabpanel"]')?.getAttribute('aria-busy') === 'false'
                ));
                await page.waitForFunction((expectedCount) => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === expectedCount
                        && metrics.visibilityListenerCount === expectedCount;
                }, ACTIVE_CHALLENGE_COUNT);
                await page.evaluate(() => {
                    const clear = Reflect.get(globalThis, 'clearChallengeList');
                    if (typeof clear !== 'function') throw new Error('ChallengeList cleanup missing');
                    clear();
                });
                await page.waitForFunction(() => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === 0
                        && metrics.visibilityListenerCount === 0;
                });
                await page.evaluate(() => {
                    const render = Reflect.get(globalThis, 'renderStrictChallengeCard');
                    if (typeof render !== 'function') {
                        throw new Error('Strict challenge card renderer missing');
                    }
                    render('2099-02-20', '2099-02-25');
                });
                await page.waitForFunction((expectedDelay) => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === 1
                        && metrics.pendingTimerDelays[0] === expectedDelay
                        && metrics.visibilityListenerCount === 1;
                }, MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);
                await page.evaluate(() => {
                    const render = Reflect.get(globalThis, 'renderStrictChallengeCard');
                    if (typeof render !== 'function') {
                        throw new Error('Strict challenge card renderer missing');
                    }
                    render('2099-01-01', '2099-01-10');
                });
                const replacementLifecycle = await page.waitForFunction((maximumDelay) => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === 1
                        && metrics.pendingTimerDelays[0] > 0
                        && metrics.pendingTimerDelays[0] < maximumDelay
                        && metrics.visibilityListenerCount === 1
                        ? metrics
                        : false;
                }, MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);
                expect((await replacementLifecycle.jsonValue()).pendingTimerDelays)
                    .toHaveLength(1);
                await page.evaluate(() => {
                    const clear = Reflect.get(globalThis, 'clearStrictChallengeCard');
                    if (typeof clear !== 'function') {
                        throw new Error('Strict challenge card cleanup missing');
                    }
                    clear();
                });
                await page.waitForFunction(() => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === 0
                        && metrics.visibilityListenerCount === 0;
                });
                await page.evaluate((nextLocale) => {
                    const resetDelays = Reflect.get(globalThis, 'resetChallengeTimerDelays');
                    const render = Reflect.get(globalThis, 'renderChallengeList');
                    if (typeof resetDelays !== 'function' || typeof render !== 'function') {
                        throw new Error('ChallengeList rerender missing');
                    }
                    resetDelays();
                    render(nextLocale);
                }, locale);
                await page.waitForFunction(() => (
                    document.querySelector('[role="tabpanel"]')?.getAttribute('aria-busy') === 'false'
                ));
                await page.waitForFunction((expectedCount) => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === expectedCount
                        && metrics.visibilityListenerCount === expectedCount;
                }, ACTIVE_CHALLENGE_COUNT);
                expect(pageErrors).toEqual([]);
                expect(await page.locator('body').innerText()).not.toContain(messages.loadError);
                const activeHeading = page.locator('h3', { hasText: 'Active less remaining' });
                await activeHeading.waitFor();
                expect(await page.locator('[role="tabpanel"] h3').allTextContents()).toEqual([
                    'Active less remaining',
                    'Ending creator',
                    'Ending joined',
                    'Active more remaining',
                    'Ending unjoined',
                    'Visibility ending',
                    'Active unjoined',
                    'Upcoming preview',
                    'Long upcoming',
                ]);
                const startedCard = page.getByRole('button', {
                    name: `Active unjoined - ${messages.detailViewDetail}`,
                });
                const upcomingCard = page.getByRole('button', {
                    name: `Upcoming preview - ${messages.detailViewDetail}`,
                });
                const endingUnjoinedCard = page.getByRole('button', {
                    name: `Ending unjoined - ${messages.detailViewDetail}`,
                });
                const endingJoinedCard = page.getByRole('button', {
                    name: `Ending joined - ${messages.detailViewDetail}`,
                });
                const endingCreatorCard = page.getByRole('button', {
                    name: `Ending creator - ${messages.detailViewDetail}`,
                });
                const visibilityEndingCard = page.getByRole('button', {
                    name: `Visibility ending - ${messages.detailViewDetail}`,
                });
                const longUpcomingCard = page.getByRole('button', {
                    name: `Long upcoming - ${messages.detailViewDetail}`,
                });
                const startedJoin = startedCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                });
                const upcomingStatus = messages.upcomingStartsOn.replace(
                    '{date}',
                    '2099-01-02',
                );
                expect(await startedJoin.count()).toBe(1);
                expect(await upcomingCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                }).count())
                    .toBe(0);
                expect(await upcomingCard.innerText()).toContain(upcomingStatus);
                expect(await endingUnjoinedCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                }).count()).toBe(1);
                expect(await endingJoinedCard.getByRole('button', {
                    name: messages.leave,
                    exact: true,
                }).count()).toBe(1);
                expect(await endingCreatorCard.getByRole('button', {
                    name: messages.edit,
                    exact: true,
                }).count()).toBe(1);
                const lifecycleBeforeBoundary = await page.evaluate(() => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') {
                        throw new Error('Challenge lifecycle metrics missing');
                    }
                    return getMetrics();
                });
                expect(lifecycleBeforeBoundary.timerDelays)
                    .toContain(MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);

                for (const width of [320, 375, 1280]) {
                    await page.setViewportSize({ width, height: 800 });
                    const geometry = await page.evaluate(({
                        startedCardLabel,
                        upcomingCardLabel,
                        joinLabel,
                        statusText,
                    }) => {
                        const cards = [...document.querySelectorAll<HTMLElement>('[role="button"]')];
                        const startedCard = cards.find(
                            (element) => element.getAttribute('aria-label') === startedCardLabel,
                        );
                        const upcomingCard = cards.find(
                            (element) => element.getAttribute('aria-label') === upcomingCardLabel,
                        );
                        const join = [...(startedCard?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
                            .find((element) => element.getAttribute('aria-label') === joinLabel);
                        const status = [
                            ...(upcomingCard?.querySelectorAll<HTMLElement>('span') ?? []),
                        ]
                            .find((element) => element.textContent?.includes(statusText));
                        if (!upcomingCard || !join || !status) {
                            throw new Error('Upcoming challenge geometry missing');
                        }
                        const cardRect = upcomingCard.getBoundingClientRect();
                        const joinRect = join.getBoundingClientRect();
                        const statusRect = status.getBoundingClientRect();
                        return {
                            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
                            cardLeft: cardRect.left,
                            cardRight: cardRect.right,
                            joinHeight: joinRect.height,
                            statusLeft: statusRect.left,
                            statusRight: statusRect.right,
                            viewportWidth: window.innerWidth,
                        };
                    }, {
                        startedCardLabel: `Active unjoined - ${messages.detailViewDetail}`,
                        upcomingCardLabel: `Upcoming preview - ${messages.detailViewDetail}`,
                        joinLabel: messages.join,
                        statusText: upcomingStatus,
                    });
                    expect(geometry.horizontalOverflow).toBe(false);
                    expect(geometry.cardLeft).toBeGreaterThanOrEqual(0);
                    expect(geometry.cardRight).toBeLessThanOrEqual(geometry.viewportWidth);
                    expect(geometry.joinHeight).toBeGreaterThanOrEqual(44);
                    expect(geometry.statusLeft).toBeGreaterThanOrEqual(geometry.cardLeft);
                    expect(geometry.statusRight).toBeLessThanOrEqual(geometry.cardRight);
                }

                await startedJoin.focus();
                expect(await startedJoin.evaluate((element) => document.activeElement === element))
                    .toBe(true);
                await page.evaluate(() => {
                    delete document.body.dataset.challengeDetailOpened;
                });
                await upcomingCard.focus();
                await page.keyboard.press('Enter');
                await page.waitForFunction(() => (
                    document.body.dataset.challengeDetailOpened === 'true'
                ));
                await page.clock.fastForward(300);
                expect(await upcomingCard.innerText()).not.toContain(upcomingStatus);
                expect(await upcomingCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                }).count()).toBe(1);
                for (const endedCard of [
                    endingUnjoinedCard,
                    endingJoinedCard,
                    endingCreatorCard,
                ]) {
                    expect(await endedCard.innerText()).toContain(messages.ended);
                }
                expect(await endingUnjoinedCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                }).count()).toBe(0);
                expect(await endingJoinedCard.getByRole('button', {
                    name: messages.leave,
                    exact: true,
                }).count()).toBe(0);
                expect(await endingCreatorCard.getByRole('button', {
                    name: messages.edit,
                    exact: true,
                }).count()).toBe(0);

                await page.evaluate(() => {
                    const setVisibility = Reflect.get(globalThis, 'setChallengeVisibility');
                    if (typeof setVisibility !== 'function') {
                        throw new Error('Challenge visibility control missing');
                    }
                    setVisibility('hidden');
                });
                await page.clock.setSystemTime(new Date('2099-01-02T15:00:00.100Z'));
                expect(await visibilityEndingCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                }).count()).toBe(1);
                await page.evaluate(() => {
                    const setVisibility = Reflect.get(globalThis, 'setChallengeVisibility');
                    if (typeof setVisibility !== 'function') {
                        throw new Error('Challenge visibility control missing');
                    }
                    setVisibility('visible');
                });
                await page.waitForFunction(({ cardLabel, endedText, joinLabel }) => {
                    const card = [...document.querySelectorAll<HTMLElement>('[role="button"]')]
                        .find((element) => element.getAttribute('aria-label') === cardLabel);
                    const hasJoinButton = [
                        ...(card?.querySelectorAll<HTMLButtonElement>('button') ?? []),
                    ].some((button) => button.getAttribute('aria-label') === joinLabel);
                    return card?.textContent?.includes(endedText) && !hasJoinButton;
                }, {
                    cardLabel: `Visibility ending - ${messages.detailViewDetail}`,
                    endedText: messages.ended,
                    joinLabel: messages.join,
                });

                await page.clock.fastForward(MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS - 1);
                expect(await longUpcomingCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                }).count()).toBe(0);
                await page.clock.fastForward(101);
                expect(await longUpcomingCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                }).count()).toBe(0);
                const lifecycleAfterLongTimerCap = await page.evaluate(() => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') {
                        throw new Error('Challenge lifecycle metrics missing');
                    }
                    return getMetrics();
                });
                expect(lifecycleAfterLongTimerCap.pendingTimerDelays).toHaveLength(1);
                expect(lifecycleAfterLongTimerCap.pendingTimerDelays[0])
                    .toBeGreaterThan(0);
                expect(lifecycleAfterLongTimerCap.pendingTimerDelays[0])
                    .toBeLessThan(MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);
                expect(lifecycleAfterLongTimerCap.visibilityListenerCount).toBe(1);
                const millisecondsUntilLongStart = await page.evaluate(() => (
                    Date.parse('2099-02-20T00:00:00+09:00') - Date.now()
                ));
                expect(millisecondsUntilLongStart).toBeGreaterThan(0);
                await page.clock.fastForward(millisecondsUntilLongStart + 100);
                expect(await longUpcomingCard.getByRole('button', {
                    name: messages.join,
                    exact: true,
                }).count()).toBe(1);

                const activeTab = page.getByRole('tab', { name: messages.active });
                const historyTab = page.getByRole('tab', { name: messages.completed });
                await activeTab.focus();
                await page.keyboard.press('ArrowRight');
                expect(await historyTab.getAttribute('aria-selected')).toBe('true');
                expect(await historyTab.evaluate((element) => document.activeElement === element))
                    .toBe(true);

                const historyPanel = page.getByRole('tabpanel', { name: messages.completed });
                await page.locator('#challenge-history-title').waitFor();
                await page.locator('h3', { hasText: 'History incomplete' }).waitFor();
                await page.waitForFunction(() => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === 0
                        && metrics.visibilityListenerCount === 0;
                });
                const historyText = await historyPanel.innerText();
                expect(historyText).toContain(messages.historyTitle);
                expect(historyText).toContain(messages.historyDescription);
                expect(historyText).toContain(messages.historyEndedMarker);
                expect(historyText).toContain(messages.historyPersonalMarker);
                expect(await historyPanel.locator('h3').allTextContents()).toEqual([
                    'History unjoined',
                    'History achieved',
                    'History incomplete',
                ]);

                const unjoinedCard = historyPanel
                    .locator('h3', { hasText: 'History unjoined' })
                    .locator('..');
                const achievedCard = historyPanel
                    .locator('h3', { hasText: 'History achieved' })
                    .locator('..');
                const incompleteCard = historyPanel
                    .locator('h3', { hasText: 'History incomplete' })
                    .locator('..');
                const unjoinedText = await unjoinedCard.innerText();
                const achievedText = await achievedCard.innerText();
                const incompleteText = await incompleteCard.innerText();
                expect(unjoinedText).toContain(messages.ended);
                expect(unjoinedText).not.toContain(messages.detailCompleted);
                expect(achievedText).toContain(messages.ended);
                expect(achievedText).toContain(messages.detailCompleted);
                expect(incompleteText).toContain(messages.ended);
                expect(incompleteText).toContain(messages.joined);
                expect(incompleteText).not.toContain(messages.detailCompleted);

                for (const width of [320, 375, 1280]) {
                    await page.setViewportSize({ width, height: 800 });
                    const geometry = await page.evaluate(() => {
                        const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
                        const history = document.getElementById('challenge-history-title')?.closest('section');
                        if (!history || tabs.length !== 3) {
                            throw new Error('Challenge history geometry missing');
                        }
                        const historyRect = history.getBoundingClientRect();
                        const historyTabText = document.createRange();
                        historyTabText.selectNodeContents(tabs[1]);
                        return {
                            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
                            minimumTabHeight: Math.min(
                                ...tabs.map((element) => element.getBoundingClientRect().height),
                            ),
                            historyLeft: historyRect.left,
                            historyRight: historyRect.right,
                            viewportWidth: window.innerWidth,
                            tabStops: tabs.filter((element) => element.tabIndex === 0).length,
                            historyTabTextLines: historyTabText.getClientRects().length,
                        };
                    });
                    expect(geometry.horizontalOverflow).toBe(false);
                    expect(geometry.minimumTabHeight).toBeGreaterThanOrEqual(44);
                    expect(geometry.historyTabTextLines).toBe(1);
                    expect(geometry.historyLeft).toBeGreaterThanOrEqual(0);
                    expect(geometry.historyRight).toBeLessThanOrEqual(geometry.viewportWidth);
                    expect(geometry.tabStops).toBe(1);
                }

                await page.setViewportSize({ width: 320, height: 800 });
                await historyTab.focus();
                await page.keyboard.press('ArrowRight');
                const myTab = page.getByRole('tab', { name: messages.myChallenges });
                expect(await myTab.getAttribute('aria-selected')).toBe('true');
                const myPanel = page.getByRole('tabpanel', { name: messages.myChallenges });
                await page.waitForFunction(() => (
                    document.querySelector('[role="tabpanel"]')?.getAttribute('aria-busy') === 'false'
                ));
                expect(await myPanel.innerText()).toContain(messages.listEmptyMy);

                await page.clock.setSystemTime(new Date('2099-03-01T14:59:59.800Z'));
                await page.evaluate(() => {
                    delete document.body.dataset.challengeEditCloseCount;
                    delete document.body.dataset.challengeEditPutCount;
                    delete document.body.dataset.challengeEditUpdatedCount;
                    document.getElementById('edit-modal-trigger')?.focus();
                    const render = Reflect.get(globalThis, 'renderEditChallengeModal');
                    if (typeof render !== 'function') {
                        throw new Error('Edit challenge modal renderer missing');
                    }
                    render('2099-03-01');
                });
                const editDialog = page.getByRole('dialog', { name: messages.edit });
                await editDialog.waitFor();
                await page.clock.setSystemTime(new Date('2099-03-01T15:00:00.001Z'));
                await editDialog.getByRole('button', { name: messages.save, exact: true }).click();
                await page.getByRole('alert').waitFor();
                expect(await page.getByRole('alert').innerText()).toBe(messages.editExpired);
                expect(await editDialog.getByRole('button', {
                    name: messages.save,
                    exact: true,
                }).isDisabled()).toBe(true);
                expect(await editDialog.getByLabel(messages.titleLabel).isDisabled()).toBe(true);
                expect(await page.locator('body').getAttribute('data-challenge-edit-put-count'))
                    .toBeNull();
                expect(await page.locator('body').getAttribute('data-challenge-edit-updated-count'))
                    .toBeNull();
                for (const width of [320, 375, 1280]) {
                    await page.setViewportSize({ width, height: 800 });
                    const geometry = await editDialog.evaluate((dialog) => {
                        const dialogRect = dialog.getBoundingClientRect();
                        const controls = [
                            ...dialog.querySelectorAll<HTMLElement>(
                                'button, input:not([type="checkbox"]), textarea',
                            ),
                        ];
                        return {
                            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
                            dialogLeft: dialogRect.left,
                            dialogRight: dialogRect.right,
                            minimumControlHeight: Math.min(
                                ...controls.map((control) => control.getBoundingClientRect().height),
                            ),
                            viewportWidth: window.innerWidth,
                        };
                    });
                    expect(geometry.horizontalOverflow).toBe(false);
                    expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);
                    expect(geometry.dialogRight).toBeLessThanOrEqual(geometry.viewportWidth);
                    expect(geometry.minimumControlHeight).toBeGreaterThanOrEqual(44);
                }
                await editDialog.getByRole('button', {
                    name: messages.cancelEdit,
                    exact: true,
                }).click();
                await editDialog.waitFor({ state: 'detached' });
                expect(await page.locator('#edit-modal-trigger').evaluate(
                    (element) => document.activeElement === element,
                )).toBe(true);

                await page.clock.setSystemTime(new Date('2099-03-02T14:59:59.800Z'));
                await page.locator('#edit-modal-trigger').focus();
                await page.evaluate(() => {
                    const render = Reflect.get(globalThis, 'renderEditChallengeModal');
                    if (typeof render !== 'function') {
                        throw new Error('Edit challenge modal renderer missing');
                    }
                    render('2099-03-02');
                });
                await editDialog.waitFor();
                await page.clock.fastForward(300);
                await editDialog.waitFor({ state: 'detached' });
                expect(await page.locator('#edit-modal-trigger').evaluate(
                    (element) => document.activeElement === element,
                )).toBe(true);
                expect(await page.locator('body').getAttribute('data-challenge-edit-close-count'))
                    .toBe('2');
                await page.waitForFunction(() => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === 0
                        && metrics.visibilityListenerCount === 0;
                });
            }

            expect(await page.locator('body').getAttribute('data-challenge-requests'))
                .toBe('active,active,completed,my,active,active,completed,my');
            expect(pageErrors).toEqual([]);
            expect(consoleErrors).toEqual([]);
        } finally {
            await browser.close();
        }
    }, 30_000);
});
