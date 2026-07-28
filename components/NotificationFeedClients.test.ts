import { existsSync } from 'node:fs';

import tailwindcss from '@tailwindcss/postcss';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Browser } from 'playwright';

let browser: Browser;
let bundleText: string;
let stylesText: string;

beforeAll(async () => {
    const styles = await postcss([tailwindcss()]).process(
        '@import "tailwindcss" source(none); @source "./components/ActivityFeed.tsx"; @source "./components/layout/NotificationBell.tsx";',
        { from: `${process.cwd()}/notification-feed-clients-test.css` },
    );
    const bundle = await build({
        stdin: {
            contents: `
                import React, {Component} from 'react';
                import {createRoot} from 'react-dom/client';
                import ActivityFeed from './components/ActivityFeed';
                import NotificationBell from './components/layout/NotificationBell';

                const validItem = {
                    id: 'valid-item',
                    type: 'REACTION_RECEIVED',
                    userId: 'user-1',
                    userName: 'Runner One',
                    userImage: null,
                    username: null,
                    timestamp: '2026-07-28T12:00:00.000Z',
                    data: {
                        emoji: '👏',
                        groupId: 'group-1',
                        period: 'DAILY',
                    },
                };
                const invalidItem = {
                    ...validItem,
                    id: 'invalid-item',
                    timestamp: '2026-07-28T12:01:00',
                };
                const mergedItem = {
                    ...validItem,
                    id: 'merged-item',
                    timestamp: '2026-07-28T12:05:00.000Z',
                    data: {
                        ...validItem.data,
                        emoji: '🔥',
                    },
                };
                const thirdItem = {
                    ...validItem,
                    id: 'third-item',
                    type: 'STREAK_RECORD',
                    userId: 'user-3',
                    userName: 'Runner Three',
                    timestamp: '2026-07-28T12:10:00.000Z',
                    data: {currentStreak: 3},
                };
                const freshItem = {
                    ...thirdItem,
                    id: 'fresh-item',
                    userName: 'Runner Fresh',
                };
                const scenario = document.body.dataset.scenario ?? 'invalid';
                let feedPage = 0;

                globalThis.fetch = async (input, init = {}) => {
                    const url = String(input);
                    if (url.includes('/api/user/feed/unread-count')) {
                        return {
                            ok: true,
                            json: async () => ({
                                unreadCount: scenario === 'multiple' ? 2 : 0,
                                notificationPreferencesAvailable: true,
                            }),
                        };
                    }
                    if (url.includes('/api/user/feed?')) {
                        feedPage += 1;
                        document.body.dataset.feedRequestCount = String(feedPage);
                        if (scenario === 'unmount') {
                            return new Promise((_resolve, reject) => {
                                const abort = () => {
                                    document.body.dataset.abortCount = String(
                                        Number(document.body.dataset.abortCount ?? '0') + 1,
                                    );
                                    reject(new DOMException('Aborted', 'AbortError'));
                                };
                                if (init.signal?.aborted) abort();
                                else init.signal?.addEventListener('abort', abort, {once: true});
                            });
                        }
                        if (scenario === 'stale' && feedPage === 1) {
                            return new Promise((resolve) => {
                                globalThis.resolveStaleFeed = () => resolve({
                                    ok: true,
                                    json: async () => {
                                        document.body.dataset.staleFeedSettled = 'true';
                                        return {
                                            feed: [invalidItem],
                                            hasMore: false,
                                            notificationPreferencesAvailable: true,
                                        };
                                    },
                                });
                            });
                        }
                        return {
                            ok: true,
                            json: async () => {
                                if (scenario === 'stale') {
                                    return {
                                        feed: [freshItem],
                                        hasMore: false,
                                        notificationPreferencesAvailable: true,
                                    };
                                }
                                if (feedPage === 1) {
                                    return {
                                        feed: [validItem],
                                        hasMore: true,
                                        nextCursor: 'cursor-2',
                                        notificationPreferencesAvailable: true,
                                    };
                                }
                                if (scenario === 'multiple' && feedPage === 2) {
                                    return {
                                        feed: [mergedItem],
                                        hasMore: true,
                                        nextCursor: 'cursor-3',
                                        notificationPreferencesAvailable: true,
                                    };
                                }
                                if (scenario === 'multiple') {
                                    return {
                                        feed: [thirdItem],
                                        hasMore: false,
                                        notificationPreferencesAvailable: true,
                                    };
                                }
                                return {
                                    feed: [invalidItem],
                                    hasMore: false,
                                    notificationPreferencesAvailable: true,
                                };
                            },
                        };
                    }
                    return {ok: true, json: async () => ({})};
                };

                class FeedErrorBoundary extends Component {
                    constructor(props) {
                        super(props);
                        this.state = {hasError: false};
                    }

                    static getDerivedStateFromError() {
                        return {hasError: true};
                    }

                    render() {
                        return this.state.hasError
                            ? <p role="alert" data-feed-boundary="true">Unexpected error boundary</p>
                            : this.props.children;
                    }
                }

                const Client = document.body.dataset.component === 'bell'
                    ? NotificationBell
                    : ActivityFeed;
                globalThis.feedRoot = createRoot(document.getElementById('root'));
                globalThis.feedRoot.render(
                    <FeedErrorBoundary><Client /></FeedErrorBoundary>,
                );
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
            name: 'notification-feed-client-mocks',
            setup(context) {
                context.onResolve({ filter: /^next-intl$/ }, () => ({
                    path: 'next-intl',
                    namespace: 'notification-feed-mock',
                }));
                context.onResolve({ filter: /^@\/navigation$/ }, () => ({
                    path: '@/navigation',
                    namespace: 'notification-feed-mock',
                }));
                context.onResolve({ filter: /^@\/components\/UserAvatar$/ }, () => ({
                    path: '@/components/UserAvatar',
                    namespace: 'notification-feed-mock',
                }));
                context.onLoad(
                    { filter: /.*/, namespace: 'notification-feed-mock' },
                    ({ path }) => {
                        if (path === 'next-intl') {
                            return {
                                loader: 'js',
                                resolveDir: process.cwd(),
                                contents: `
                                    const messages = {
                                        en: {
                                            title: 'Notifications',
                                            notificationsUnread: '{count} unread notifications',
                                            errorMessage: 'Failed to load feed',
                                            retry: 'Retry',
                                            loadMore: 'Load More',
                                            loading: 'Loading',
                                            streakRecord: 'reached a {days}-day streak',
                                            reactedToYou: 'reacted {emoji} to you',
                                            reactedMultipleToYou: 'reacted to you {count} times with {emojis}',
                                            justNow: 'Just now',
                                            minutesAgo: '{count} minutes ago',
                                            hoursAgo: '{count} hours ago',
                                            daysAgo: '{count} days ago',
                                            close: 'Close',
                                        },
                                        ja: {
                                            title: 'アクティビティ',
                                            notificationsUnread: '未読{count}件の通知',
                                            errorMessage: 'フィードの読み込みに失敗しました',
                                            retry: '再試行',
                                            loadMore: 'もっと見る',
                                            loading: '読み込み中...',
                                            streakRecord: '{days}日連続記録を達成',
                                            reactedToYou: '{emoji}でリアクション',
                                            reactedMultipleToYou: '{emojis}で{count}件リアクション',
                                            justNow: 'たった今',
                                            minutesAgo: '{count}分前',
                                            hoursAgo: '{count}時間前',
                                            daysAgo: '{count}日前',
                                            close: '閉じる',
                                        },
                                    };
                                    export function useTranslations() {
                                        const translate = (key, values = {}) => {
                                            const locale = document.documentElement.lang === 'ja'
                                                ? 'ja'
                                                : 'en';
                                            const template = messages[locale][key] ?? key;
                                            return template.replace(
                                                /\\{(\\w+)\\}/g,
                                                (_match, name) => String(values[name] ?? ''),
                                            );
                                        };
                                        translate.has = () => false;
                                        return translate;
                                    }
                                `,
                            };
                        }
                        if (path === '@/navigation') {
                            return {
                                loader: 'jsx',
                                resolveDir: process.cwd(),
                                contents: `
                                    import React from 'react';
                                    export function Link({children, href, ...props}) {
                                        return <a href={href} {...props}>{children}</a>;
                                    }
                                `,
                            };
                        }
                        return {
                            loader: 'jsx',
                            resolveDir: process.cwd(),
                            contents: `
                                import React from 'react';
                                export default function UserAvatar() {
                                    return <span aria-hidden="true" />;
                                }
                            `,
                        };
                    },
                );
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

    bundleText = bundle.outputFiles[0].text;
    stylesText = styles.css;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => {
    await browser?.close();
});

async function assertInvalidAppendUsesFeedError(
    component: 'activity' | 'bell',
    width: 375 | 1280,
    locale: 'en' | 'ja',
): Promise<void> {
    const labels = locale === 'ja'
        ? {
            title: 'アクティビティ',
            close: '閉じる',
            loadMore: 'もっと見る',
            error: 'フィードの読み込みに失敗しました',
            retry: '再試行',
        }
        : {
            title: 'Notifications',
            close: 'Close',
            loadMore: 'Load More',
            error: 'Failed to load feed',
            retry: 'Retry',
        };
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    page.setDefaultTimeout(5_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
        await page.setContent(
            `<html lang="${locale}"><body data-component="${component}" data-scenario="invalid"><div id="root"></div></body></html>`,
        );
        await page.addStyleTag({ content: stylesText });
        await page.addScriptTag({ content: bundleText });

        if (component === 'bell') {
            await page.getByRole('button', { name: labels.title }).click();
            await page.waitForFunction(
                (closeLabel) => document.activeElement?.getAttribute('aria-label') === closeLabel,
                labels.close,
            );
        }

        const loadMoreButton = page.getByRole('button', { name: labels.loadMore });
        await loadMoreButton.waitFor();
        await loadMoreButton.click();
        await page.waitForFunction((expectedError) => (
            document.querySelector('[data-feed-boundary="true"]')
            || document.body.textContent?.includes(expectedError)
        ), labels.error);

        expect(await page.locator('[data-feed-boundary="true"]').count()).toBe(0);
        const errorAlert = page.getByRole('alert').filter({ hasText: labels.error });
        await errorAlert.waitFor();
        await page.waitForFunction(
            (retryLabel) => document.activeElement?.textContent?.trim() === retryLabel,
            labels.retry,
        );
        const retryBox = await page.getByRole('button', { name: labels.retry }).boundingBox();
        expect(retryBox?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(retryBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(pageErrors).toEqual([]);
    } finally {
        await page.close();
    }
}

async function assertMultipleAppendPreservesFeed(
    component: 'activity' | 'bell',
): Promise<void> {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    page.setDefaultTimeout(5_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
        await page.setContent(
            `<body data-component="${component}" data-scenario="multiple"><div id="root"></div></body>`,
        );
        await page.addStyleTag({ content: stylesText });
        await page.addScriptTag({ content: bundleText });

        if (component === 'bell') {
            await page.getByRole('button', { name: '2 unread notifications' }).click();
            await page.waitForFunction(
                () => document.activeElement?.getAttribute('aria-label') === 'Close',
            );
        }

        const loadMoreButton = page.getByRole('button', { name: 'Load More' });
        await loadMoreButton.waitFor();
        await loadMoreButton.click();
        await page.getByText('reacted to you 2 times with 🔥 👏', { exact: true }).waitFor();
        expect(await page.getByText('Runner One', { exact: true }).count()).toBe(1);

        await page.waitForFunction(() => {
            const button = Array.from(document.querySelectorAll('button')).find(
                (candidate) => candidate.textContent?.trim() === 'Load More',
            );
            return button instanceof HTMLButtonElement && !button.disabled;
        });
        await loadMoreButton.click();
        await page.getByText('Runner Three', { exact: true }).waitFor();

        expect(await page.locator('[data-feed-boundary="true"]').count()).toBe(0);
        expect(await page.getByText('Failed to load feed', { exact: true }).count()).toBe(0);
        expect(pageErrors).toEqual([]);
    } finally {
        await page.close();
    }
}

async function assertUnmountAbortsFeedRequest(
    component: 'activity' | 'bell',
): Promise<void> {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    page.setDefaultTimeout(5_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
        await page.setContent(
            `<body data-component="${component}" data-scenario="unmount"><div id="root"></div></body>`,
        );
        await page.addStyleTag({ content: stylesText });
        await page.addScriptTag({ content: bundleText });
        if (component === 'bell') {
            await page.getByRole('button', { name: 'Notifications' }).click();
        }
        await page.waitForFunction(() => document.body.dataset.feedRequestCount === '1');
        await page.evaluate(() => Reflect.get(globalThis, 'feedRoot').unmount());
        await page.waitForFunction(() => document.body.dataset.abortCount === '1');

        expect(await page.locator('[data-feed-boundary="true"]').count()).toBe(0);
        expect(pageErrors).toEqual([]);
    } finally {
        await page.close();
    }
}

async function assertStaleFeedCannotOverwrite(): Promise<void> {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    page.setDefaultTimeout(5_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
        await page.setContent(
            '<body data-component="bell" data-scenario="stale"><div id="root"></div></body>',
        );
        await page.addStyleTag({ content: stylesText });
        await page.addScriptTag({ content: bundleText });
        const bellButton = page.getByRole('button', { name: 'Notifications' });
        await bellButton.click();
        await page.waitForFunction(() => document.body.dataset.feedRequestCount === '1');
        await page.getByRole('button', { name: 'Close' }).click();
        await bellButton.click();
        await page.getByText('Runner Fresh', { exact: true }).waitFor();

        await page.evaluate(() => Reflect.get(globalThis, 'resolveStaleFeed')());
        await page.waitForFunction(() => document.body.dataset.staleFeedSettled === 'true');

        expect(await page.getByText('Runner Fresh', { exact: true }).count()).toBe(1);
        expect(await page.getByText('Failed to load feed', { exact: true }).count()).toBe(0);
        expect(await page.locator('[data-feed-boundary="true"]').count()).toBe(0);
        expect(pageErrors).toEqual([]);
    } finally {
        await page.close();
    }
}

describe('notification feed client append', () => {
    it('ActivityFeedで追加ページのtimestampが不正な場合、既存エラー表示へ遷移する', async () => {
        for (const width of [375, 1280] as const) {
            for (const locale of ['ja', 'en'] as const) {
                await assertInvalidAppendUsesFeedError('activity', width, locale);
            }
        }
    }, 25_000);

    it('NotificationBellで追加ページのtimestampが不正な場合、既存エラー表示へ遷移する', async () => {
        for (const width of [375, 1280] as const) {
            for (const locale of ['ja', 'en'] as const) {
                await assertInvalidAppendUsesFeedError('bell', width, locale);
            }
        }
    }, 25_000);

    it('複数ページを追加した場合、重複集約とページングと未読表示を維持する', async () => {
        await assertMultipleAppendPreservesFeed('activity');
        await assertMultipleAppendPreservesFeed('bell');
    }, 20_000);

    it('取得中にunmountした場合、両クライアントがリクエストを中断する', async () => {
        await assertUnmountAbortsFeedRequest('activity');
        await assertUnmountAbortsFeedRequest('bell');
    }, 15_000);

    it('NotificationBellを再度開いた場合、古い取得が新しいFeedを上書きしない', async () => {
        await assertStaleFeedCannotOverwrite();
    }, 15_000);
});
