import { existsSync } from 'node:fs';

import tailwindcss from '@tailwindcss/postcss';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

import enMessages from '../../messages/en.json';
import jaMessages from '../../messages/ja.json';

const challengeMessages = {
    en: enMessages.Challenge,
    ja: jaMessages.Challenge,
};

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

    it('既存の取得・並び順を保ちつつキーボードと320/375/1280pxで履歴を表示する', async () => {
        const styles = await postcss([tailwindcss()]).process(
            [
                '@import "tailwindcss" source(none);',
                '@source "./components/challenge/ChallengeList.tsx";',
                '@source "./components/challenge/ChallengeCard.tsx";',
            ].join(' '),
            { from: `${process.cwd()}/challenge-list-test.css` },
        );
        const bundle = await build({
            stdin: {
                contents: `
                    import {createRoot} from 'react-dom/client';
                    import ChallengeList from './components/challenge/ChallengeList';
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
                        {...baseChallenge, id: 'active-unjoined', title: 'Active unjoined', end_date: '2099-01-03', is_joined: false},
                        {...baseChallenge, id: 'active-more', title: 'Active more remaining', end_date: '2099-01-02', is_joined: true},
                        {...baseChallenge, id: 'active-less', title: 'Active less remaining', end_date: '2099-01-01', is_joined: true},
                    ];
                    const endedChallenges = [
                        {...baseChallenge, id: 'history-unjoined', title: 'History unjoined', end_date: '2020-01-02', is_joined: false},
                        {...baseChallenge, id: 'history-achieved', title: 'History achieved', end_date: '2020-01-02', is_joined: true},
                        {...baseChallenge, id: 'history-incomplete', title: 'History incomplete', end_date: '2020-01-02', is_joined: true},
                    ];
                    const progressById = {
                        'active-more': 1000,
                        'active-less': 9000,
                        'history-achieved': 12000,
                        'history-incomplete': 5000,
                    };
                    globalThis.fetch = async (input) => {
                        const url = new URL(String(input), 'https://ucfitness.test');
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
                    globalThis.renderChallengeList = (locale) => {
                        document.documentElement.lang = locale;
                        root.render(<ChallengeList key={locale} currentUserId="viewer" />);
                    };
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
                            filter: /^@\/components\/challenge\/(?:ChallengeGearBanner|ChallengeDetailModal|EditChallengeModal)$/,
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
                        contents: 'export default function dynamic() { return function DynamicStub() { return null; }; }',
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
            const pageErrors: string[] = [];
            const consoleErrors: string[] = [];
            page.on('pageerror', (error) => pageErrors.push(error.message));
            page.on('console', (message) => {
                if (message.type() === 'error') consoleErrors.push(message.text());
            });
            await page.setContent(
                '<main style="padding-inline: 16px"><div id="root"></div></main>',
            );
            await page.addStyleTag({ content: styles.css });
            await page.addScriptTag({ content: bundle.outputFiles[0].text });

            for (const locale of ['ja', 'en'] as const) {
                const messages = challengeMessages[locale];
                await page.evaluate((nextLocale) => {
                    const render = Reflect.get(globalThis, 'renderChallengeList');
                    if (typeof render !== 'function') throw new Error('ChallengeList renderer missing');
                    render(nextLocale);
                }, locale);

                await page.waitForFunction(() => (
                    document.querySelector('[role="tabpanel"]')?.getAttribute('aria-busy') === 'false'
                ));
                expect(pageErrors).toEqual([]);
                expect(await page.locator('body').innerText()).not.toContain(messages.loadError);
                const activeHeading = page.locator('h3', { hasText: 'Active less remaining' });
                await activeHeading.waitFor();
                expect(await page.locator('[role="tabpanel"] h3').allTextContents()).toEqual([
                    'Active less remaining',
                    'Active more remaining',
                    'Active unjoined',
                ]);

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
            }

            expect(await page.locator('body').getAttribute('data-challenge-requests'))
                .toBe('active,completed,my,active,completed,my');
            expect(pageErrors).toEqual([]);
            expect(consoleErrors).toEqual([]);
        } finally {
            await browser.close();
        }
    }, 30_000);
});
