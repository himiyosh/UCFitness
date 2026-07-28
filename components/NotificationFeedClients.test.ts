import { existsSync } from 'node:fs';

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Browser } from 'playwright';

let browser: Browser;
let bundleText: string;

beforeAll(async () => {
    const bundle = await build({
        stdin: {
            contents: `
                import React, {Component} from 'react';
                import {createRoot} from 'react-dom/client';
                import ActivityFeed from './components/ActivityFeed';
                import NotificationBell from './components/layout/NotificationBell';

                const validItem = {
                    id: 'valid-item',
                    type: 'STREAK_RECORD',
                    userId: 'user-1',
                    userName: 'Runner',
                    userImage: null,
                    username: null,
                    timestamp: '2026-07-28T12:00:00.000Z',
                    data: {currentStreak: 3},
                };
                const invalidItem = {
                    ...validItem,
                    id: 'invalid-item',
                    timestamp: '2026-07-28T12:01:00',
                };
                let feedPage = 0;

                globalThis.fetch = async (input) => {
                    const url = String(input);
                    if (url.includes('/api/user/feed/unread-count')) {
                        return {
                            ok: true,
                            json: async () => ({
                                unreadCount: 0,
                                notificationPreferencesAvailable: true,
                            }),
                        };
                    }
                    if (url.includes('/api/user/feed?')) {
                        feedPage += 1;
                        return {
                            ok: true,
                            json: async () => feedPage === 1
                                ? {
                                    feed: [validItem],
                                    hasMore: true,
                                    nextCursor: 'cursor-2',
                                    notificationPreferencesAvailable: true,
                                }
                                : {
                                    feed: [invalidItem],
                                    hasMore: false,
                                    notificationPreferencesAvailable: true,
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
                createRoot(document.getElementById('root')).render(
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
                                        title: 'Notifications',
                                        notificationsUnread: '{count} unread notifications',
                                        errorMessage: 'Failed to load feed',
                                        retry: 'Retry',
                                        loadMore: 'Load More',
                                        loading: 'Loading',
                                        streakRecord: 'reached a {days}-day streak',
                                        justNow: 'Just now',
                                        minutesAgo: '{count} minutes ago',
                                        hoursAgo: '{count} hours ago',
                                        daysAgo: '{count} days ago',
                                        close: 'Close',
                                    };
                                    export function useTranslations() {
                                        const translate = (key, values = {}) => {
                                            const template = messages[key] ?? key;
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
    browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => {
    await browser?.close();
});

async function assertInvalidAppendUsesFeedError(
    component: 'activity' | 'bell',
): Promise<void> {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    page.setDefaultTimeout(5_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
        await page.setContent(`<body data-component="${component}"><div id="root"></div></body>`);
        await page.addScriptTag({ content: bundleText });

        if (component === 'bell') {
            await page.getByRole('button', { name: 'Notifications' }).click();
        }

        const loadMoreButton = page.getByRole('button', { name: 'Load More' });
        await loadMoreButton.waitFor();
        await loadMoreButton.click();
        await page.waitForFunction(() => (
            document.querySelector('[data-feed-boundary="true"]')
            || document.body.textContent?.includes('Failed to load feed')
        ));

        expect(await page.locator('[data-feed-boundary="true"]').count()).toBe(0);
        await page.getByText('Failed to load feed', { exact: true }).waitFor();
        expect(pageErrors).toEqual([]);
    } finally {
        await page.close();
    }
}

describe('notification feed client append', () => {
    it('ActivityFeedで追加ページのtimestampが不正な場合、既存エラー表示へ遷移する', async () => {
        await assertInvalidAppendUsesFeedError('activity');
    }, 15_000);

    it('NotificationBellで追加ページのtimestampが不正な場合、既存エラー表示へ遷移する', async () => {
        await assertInvalidAppendUsesFeedError('bell');
    }, 15_000);
});
