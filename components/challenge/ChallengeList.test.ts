import { existsSync } from 'node:fs';

import tailwindcss from '@tailwindcss/postcss';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

import enMessages from '../../messages/en.json';
import jaMessages from '../../messages/ja.json';
import {
    CHALLENGE_END_DATE_IN_PAST_CODE,
    CHALLENGE_NOT_EDITABLE_CODE,
    MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS,
} from '../../lib/services/challenge-utils';

const challengeMessages = {
    en: enMessages.Challenge,
    ja: jaMessages.Challenge,
};
const ACTIVE_CHALLENGE_COUNT = 9;
const CHALLENGE_IDS = {
    activeUnjoined: 'a0000000-0000-4000-8000-000000000001',
    activeMore: 'a0000000-0000-4000-8000-000000000002',
    activeLess: 'a0000000-0000-4000-8000-000000000003',
    activeUpcoming: 'a0000000-0000-4000-8000-000000000004',
    endingUnjoined: 'a0000000-0000-4000-8000-000000000005',
    endingJoined: 'a0000000-0000-4000-8000-000000000006',
    endingCreator: 'a0000000-0000-4000-8000-000000000007',
    visibilityEnding: 'a0000000-0000-4000-8000-000000000008',
    longUpcoming: 'a0000000-0000-4000-8000-000000000009',
    historyUnjoined: 'b0000000-0000-4000-8000-000000000001',
    historyAchieved: 'b0000000-0000-4000-8000-000000000002',
    historyIncomplete: 'b0000000-0000-4000-8000-000000000003',
    historyUnavailable: 'b0000000-0000-4000-8000-000000000004',
} as const;

interface SurfaceTimezoneSnapshot {
    detailText: string;
    dashboardText: string;
}

function getContrastRatio(first: number[], second: number[]): number {
    const luminance = (channels: number[]): number => {
        if (channels.length !== 3) throw new Error('Invalid sRGB color');
        const linear = channels.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
    };
    const firstLuminance = luminance(first);
    const secondLuminance = luminance(second);
    return (Math.max(firstLuminance, secondLuminance) + 0.05)
        / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

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
                '@source "./components/challenge/ChallengeDetailModal.tsx";',
                '@source "./components/challenge/EditChallengeModal.tsx";',
                '@source "./components/dashboard/DashboardChallenges.tsx";',
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
                    import ChallengeDetailModal from './components/challenge/ChallengeDetailModal';
                    import EditChallengeModal from './components/challenge/EditChallengeModal';
                    import DashboardChallenges from './components/dashboard/DashboardChallenges';
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
                        {...baseChallenge, id: '${CHALLENGE_IDS.activeUnjoined}', title: 'Active unjoined', end_date: '2099-01-05', is_joined: false},
                        {...baseChallenge, id: '${CHALLENGE_IDS.activeMore}', title: 'Active more remaining', end_date: '2099-01-04', is_joined: true},
                        {...baseChallenge, id: '${CHALLENGE_IDS.activeLess}', title: 'Active less remaining', end_date: '2099-01-03', is_joined: true},
                        {...baseChallenge, id: '${CHALLENGE_IDS.activeUpcoming}', title: 'Upcoming preview', start_date: '2099-01-02', end_date: '2099-01-06', is_joined: false},
                        {...baseChallenge, id: '${CHALLENGE_IDS.endingUnjoined}', title: 'Ending unjoined', end_date: '2099-01-01', is_joined: false},
                        {...baseChallenge, id: '${CHALLENGE_IDS.endingJoined}', title: 'Ending joined', end_date: '2099-01-01', is_joined: true},
                        {...baseChallenge, id: '${CHALLENGE_IDS.endingCreator}', title: 'Ending creator', end_date: '2099-01-01', is_joined: true, created_by: 'viewer'},
                        {...baseChallenge, id: '${CHALLENGE_IDS.visibilityEnding}', title: 'Visibility ending', end_date: '2099-01-02', is_joined: false},
                        {...baseChallenge, id: '${CHALLENGE_IDS.longUpcoming}', title: 'Long upcoming', start_date: '2099-02-20', end_date: '2099-02-25', is_joined: false},
                    ];
                    const endedChallenges = [
                        {...baseChallenge, id: '${CHALLENGE_IDS.historyUnjoined}', title: 'History unjoined', end_date: '2020-01-02', is_joined: false},
                        {...baseChallenge, id: '${CHALLENGE_IDS.historyAchieved}', title: 'History achieved', end_date: '2020-01-02', is_joined: true},
                        {...baseChallenge, id: '${CHALLENGE_IDS.historyIncomplete}', title: 'History incomplete', end_date: '2020-01-02', is_joined: true},
                        {...baseChallenge, id: '${CHALLENGE_IDS.historyUnavailable}', title: 'History unavailable', end_date: '2020-01-02', is_joined: true},
                    ];
                    const progressById = {
                        '${CHALLENGE_IDS.activeMore}': 1000,
                        '${CHALLENGE_IDS.activeLess}': 9000,
                        '${CHALLENGE_IDS.endingJoined}': 5000,
                        '${CHALLENGE_IDS.endingCreator}': 0,
                        '${CHALLENGE_IDS.historyAchieved}': 12000,
                        '${CHALLENGE_IDS.historyIncomplete}': 0,
                    };
                    const progressRecordStatusById = {
                        '${CHALLENGE_IDS.endingCreator}': 'not_recorded',
                    };
                    const endedChallengeIds = new Set([
                        '${CHALLENGE_IDS.historyAchieved}',
                        '${CHALLENGE_IDS.historyIncomplete}',
                        '${CHALLENGE_IDS.historyUnavailable}',
                    ]);
                    const detailChallenges = new Map();
                    let dashboardChallenges = [];
                    let resolveDelayedEditPut = null;
                    globalThis.fetch = async (input, init = {}) => {
                        const url = new URL(String(input), 'https://ucfitness.test');
                        if (init.method === 'PUT' && url.pathname === '/api/challenge/edit-boundary') {
                            const count = Number(document.body.dataset.challengeEditPutCount ?? '0');
                            document.body.dataset.challengeEditPutCount = String(count + 1);
                            const outcome = document.body.dataset.challengeEditPutOutcome;
                            if (
                                outcome === 'delayed-conflict'
                                || outcome === 'delayed-past-end-date'
                                || outcome === 'delayed-failure'
                                || outcome === 'delayed-success'
                            ) {
                                return new Promise((resolve) => {
                                    resolveDelayedEditPut = () => {
                                        resolveDelayedEditPut = null;
                                        resolve({
                                            ok: outcome === 'delayed-success',
                                            status: outcome === 'delayed-conflict'
                                                ? 409
                                                : outcome === 'delayed-past-end-date'
                                                    ? 400
                                                : outcome === 'delayed-success' ? 200 : 500,
                                            json: async () => outcome === 'delayed-conflict'
                                                ? {
                                                    error: 'Sensitive server conflict details',
                                                    code: '${CHALLENGE_NOT_EDITABLE_CODE}',
                                                }
                                                : outcome === 'delayed-past-end-date'
                                                    ? {
                                                        error: 'Sensitive past date details',
                                                        code: '${CHALLENGE_END_DATE_IN_PAST_CODE}',
                                                    }
                                                : {
                                                    error: 'Sensitive server failure details',
                                                },
                                        });
                                    };
                                });
                            }
                            return {ok: true, status: 200, json: async () => ({})};
                        }
                        if (url.pathname === '/api/challenge') {
                            const status = url.searchParams.get('status');
                            if (document.body.dataset.dashboardMode !== 'true') {
                                const previous = document.body.dataset.challengeRequests;
                                document.body.dataset.challengeRequests = previous
                                    ? previous + ',' + status
                                    : String(status);
                            }
                            return {
                                ok: true,
                                json: async () => ({
                                    challenges: document.body.dataset.dashboardMode === 'true'
                                        ? dashboardChallenges
                                        : status === 'active'
                                        ? activeChallenges
                                        : status === 'completed'
                                            ? endedChallenges
                                            : [],
                                }),
                            };
                        }
                        if (url.pathname === '/api/challenge/progress' && init.method === 'POST') {
                            const count = Number(
                                document.body.dataset.challengeProgressBatchCount ?? '0',
                            );
                            document.body.dataset.challengeProgressBatchCount = String(count + 1);
                            const body = typeof init.body === 'string'
                                ? JSON.parse(init.body)
                                : {};
                            const challengeIds = Array.isArray(body.challengeIds)
                                ? body.challengeIds
                                : [];
                            const bodies = JSON.parse(
                                document.body.dataset.challengeProgressBatchBodies ?? '[]',
                            );
                            bodies.push(challengeIds);
                            document.body.dataset.challengeProgressBatchBodies =
                                JSON.stringify(bodies);
                            const buildResponse = () => ({
                                ok: true,
                                json: async () => ({
                                    results: challengeIds.map((challengeId) => {
                                        const totalSteps = progressById[challengeId];
                                        if (totalSteps === undefined) {
                                            return {
                                                challenge_id: challengeId,
                                                status: 'not_participating',
                                                progress: null,
                                            };
                                        }
                                        const recordStatus =
                                            progressRecordStatusById[challengeId] ?? 'recorded';
                                        return {
                                            challenge_id: challengeId,
                                            status: 'ok',
                                            progress: {
                                                total_steps: totalSteps,
                                                target_steps: 10000,
                                                progress_percent: Math.min(
                                                    100,
                                                    Math.round((totalSteps / 10000) * 100),
                                                ),
                                                is_completed: totalSteps >= 10000,
                                                completed_at: null,
                                                reward_uc: 500,
                                                type: 'INDIVIDUAL',
                                                record_status: recordStatus,
                                                schedule_status: endedChallengeIds.has(challengeId)
                                                    ? 'ended'
                                                    : 'active',
                                            },
                                        };
                                    }),
                                }),
                            });
                            if (document.body.dataset.delayNextChallengeProgress === 'true') {
                                delete document.body.dataset.delayNextChallengeProgress;
                                const started = Number(
                                    document.body.dataset.challengeDelayedProgressStarted ?? '0',
                                );
                                document.body.dataset.challengeDelayedProgressStarted =
                                    String(started + 1);
                                return new Promise((resolve, reject) => {
                                    let settled = false;
                                    const handleAbort = () => {
                                        if (settled) return;
                                        settled = true;
                                        const abortCount = Number(
                                            document.body.dataset.challengeProgressAbortCount ?? '0',
                                        );
                                        document.body.dataset.challengeProgressAbortCount =
                                            String(abortCount + 1);
                                        reject(new DOMException('Aborted', 'AbortError'));
                                    };
                                    init.signal?.addEventListener('abort', handleAbort, {
                                        once: true,
                                    });
                                    globalThis.resolveDelayedChallengeProgress = () => {
                                        if (settled) return;
                                        settled = true;
                                        init.signal?.removeEventListener('abort', handleAbort);
                                        resolve(buildResponse());
                                    };
                                });
                            }
                            return buildResponse();
                        }
                        const actionMatch = url.pathname.match(
                            /^\\/api\\/challenge\\/([^/]+)\\/(join|leave)$/,
                        );
                        if (actionMatch) {
                            const [, challengeId, action] = actionMatch;
                            const challenge = activeChallenges.find(
                                (candidate) => candidate.id === challengeId,
                            );
                            if (!challenge) {
                                return {ok: false, status: 404, json: async () => ({})};
                            }
                            if (action === 'join' && init.method === 'POST') {
                                challenge.is_joined = true;
                                challenge.participant_count += 1;
                                progressById[challengeId] = 0;
                                const count = Number(
                                    document.body.dataset.challengeJoinCount ?? '0',
                                );
                                document.body.dataset.challengeJoinCount = String(count + 1);
                                return {ok: true, status: 200, json: async () => ({success: true})};
                            }
                            if (action === 'leave' && init.method === 'DELETE') {
                                challenge.is_joined = false;
                                challenge.participant_count = Math.max(
                                    0,
                                    challenge.participant_count - 1,
                                );
                                delete progressById[challengeId];
                                const count = Number(
                                    document.body.dataset.challengeLeaveCount ?? '0',
                                );
                                document.body.dataset.challengeLeaveCount = String(count + 1);
                                return {ok: true, status: 200, json: async () => ({success: true})};
                            }
                        }
                        const detailMatch = url.pathname.match(/^\\/api\\/challenge\\/(detail-[^/]+)$/);
                        if (detailMatch) {
                            const challenge = detailChallenges.get(detailMatch[1]);
                            return {
                                ok: challenge !== undefined,
                                json: async () => ({challenge}),
                            };
                        }
                        const progressMatch = url.pathname.match(/^\\/api\\/challenge\\/([^/]+)\\/progress$/);
                        if (progressMatch) {
                            const count = Number(
                                document.body.dataset.challengeProgressSingleCount ?? '0',
                            );
                            document.body.dataset.challengeProgressSingleCount = String(count + 1);
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
                    const detailModalRoot = createRoot(document.querySelector('#detail-modal-root'));
                    const dashboardRoot = createRoot(document.querySelector('#dashboard-root'));
                    let editModalRevision = 0;
                    let detailModalRevision = 0;
                    let dashboardRevision = 0;
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
                    function DetailModalHarness({challengeId}) {
                        const [isOpen, setIsOpen] = useState(true);
                        return (
                            <ChallengeDetailModal
                                challengeId={challengeId}
                                isOpen={isOpen}
                                onClose={() => {
                                    const count = Number(
                                        document.body.dataset.challengeDetailCloseCount ?? '0',
                                    );
                                    document.body.dataset.challengeDetailCloseCount = String(count + 1);
                                    setIsOpen(false);
                                }}
                            />
                        );
                    }
                    globalThis.renderChallengeList = (locale) => {
                        delete document.body.dataset.dashboardMode;
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
                    globalThis.renderChallengeDetailModal = (
                        locale,
                        challengeId,
                        startDate,
                        endDate,
                        remount = false,
                    ) => {
                        document.documentElement.lang = locale;
                        detailChallenges.set(challengeId, {
                            ...baseChallenge,
                            id: challengeId,
                            title: 'Schedule detail',
                            start_date: startDate,
                            end_date: endDate,
                            challenge_participants: [],
                        });
                        if (remount) detailModalRevision += 1;
                        detailModalRoot.render(
                            <StrictMode>
                                <DetailModalHarness
                                    key={detailModalRevision}
                                    challengeId={challengeId}
                                />
                            </StrictMode>,
                        );
                    };
                    globalThis.clearChallengeDetailModal = () => detailModalRoot.render(null);
                    globalThis.renderDashboardChallenges = (
                        locale,
                        items,
                        remount = true,
                    ) => {
                        document.documentElement.lang = locale;
                        dashboardChallenges = items.map((item) => ({
                            ...baseChallenge,
                            is_joined: false,
                            participant_count: 0,
                            participant_avatars: [],
                            ...item,
                        }));
                        document.body.dataset.dashboardMode = 'true';
                        if (remount) dashboardRevision += 1;
                        dashboardRoot.render(
                            <StrictMode>
                                <DashboardChallenges key={dashboardRevision} />
                            </StrictMode>,
                        );
                    };
                    globalThis.clearDashboardChallenges = () => {
                        dashboardRoot.render(null);
                        delete document.body.dataset.dashboardMode;
                    };
                    globalThis.resolveDelayedEditChallengePut = () => {
                        if (typeof resolveDelayedEditPut !== 'function') {
                            throw new Error('Delayed edit PUT resolver missing');
                        }
                        resolveDelayedEditPut();
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
                    context.onResolve({ filter: /^next\/navigation$/ }, () => ({
                        path: 'next/navigation',
                        namespace: 'next-navigation-stub',
                    }));
                    context.onLoad({ filter: /.*/, namespace: 'next-navigation-stub' }, () => ({
                        contents: 'export const useRouter = () => ({push() {}});',
                    }));
                    context.onResolve({ filter: /^@\/navigation$/ }, () => ({
                        path: '@/navigation',
                        namespace: 'navigation-stub',
                    }));
                    context.onLoad({ filter: /.*/, namespace: 'navigation-stub' }, () => ({
                        contents: `
                            import {createElement} from 'react';
                            export function Link({href, children, ...props}) {
                                return createElement('a', {href, ...props}, children);
                            }
                        `,
                        resolveDir: process.cwd(),
                    }));
                    context.onResolve({ filter: /^@\/components\/UserAvatar$/ }, () => ({
                        path: '@/components/UserAvatar',
                        namespace: 'user-avatar-stub',
                    }));
                    context.onLoad({ filter: /.*/, namespace: 'user-avatar-stub' }, () => ({
                        contents: 'export default function UserAvatar() { return null; }',
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
            const cdpSession = await page.context().newCDPSession(page);
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
                '<button id="edit-modal-trigger" type="button" style="min-height:44px">Edit trigger</button><button id="detail-modal-trigger" type="button" style="min-height:44px">Detail trigger</button><main style="padding-inline: 16px"><div id="root"></div><div id="strict-card-root"></div><div id="edit-modal-root"></div><div id="detail-modal-root"></div><div id="dashboard-root"></div></main>',
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
                await cdpSession.send('Emulation.setTimezoneOverride', {
                    timezoneId: 'Asia/Tokyo',
                });
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
                    'Ending joined',
                    'Active more remaining',
                    'Ending creator',
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
                expect(await endingCreatorCard.innerText()).toContain(
                    messages.progressNotRecorded,
                );
                const initialBatchBodies = await page.evaluate(() => JSON.parse(
                    document.body.dataset.challengeProgressBatchBodies ?? '[]',
                ));
                expect(initialBatchBodies.at(-1)).toEqual([
                    CHALLENGE_IDS.activeMore,
                    CHALLENGE_IDS.activeLess,
                    CHALLENGE_IDS.endingJoined,
                    CHALLENGE_IDS.endingCreator,
                ]);
                expect(await page.locator('body').getAttribute(
                    'data-challenge-progress-single-count',
                )).toBeNull();

                const joinCountBefore = Number(
                    await page.locator('body').getAttribute('data-challenge-join-count') ?? '0',
                );
                await startedJoin.click();
                const startedLeave = startedCard.getByRole('button', {
                    name: messages.leave,
                    exact: true,
                });
                await startedLeave.waitFor();
                expect(Number(
                    await page.locator('body').getAttribute('data-challenge-join-count'),
                )).toBe(joinCountBefore + 1);
                expect(await startedCard.innerText()).toContain('0 / 10,000');
                const afterJoinBodies = await page.evaluate(() => JSON.parse(
                    document.body.dataset.challengeProgressBatchBodies ?? '[]',
                ));
                expect(afterJoinBodies.at(-1)).toHaveLength(5);

                const leaveCountBefore = Number(
                    await page.locator('body').getAttribute('data-challenge-leave-count') ?? '0',
                );
                await startedLeave.click();
                const leaveDialog = page.getByRole('alertdialog');
                await leaveDialog.getByRole('button', {
                    name: messages.leave,
                    exact: true,
                }).click();
                await leaveDialog.waitFor({ state: 'detached' });
                await startedJoin.waitFor();
                expect(Number(
                    await page.locator('body').getAttribute('data-challenge-leave-count'),
                )).toBe(leaveCountBefore + 1);
                const afterLeaveBodies = await page.evaluate(() => JSON.parse(
                    document.body.dataset.challengeProgressBatchBodies ?? '[]',
                ));
                expect(afterLeaveBodies.at(-1)).toHaveLength(4);
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
                    'History unavailable',
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
                const unavailableCard = historyPanel
                    .locator('h3', { hasText: 'History unavailable' })
                    .locator('..');
                const unjoinedText = await unjoinedCard.innerText();
                const achievedText = await achievedCard.innerText();
                const incompleteText = await incompleteCard.innerText();
                const unavailableText = await unavailableCard.innerText();
                expect(unjoinedText).toContain(messages.ended);
                expect(unjoinedText).not.toContain(messages.detailCompleted);
                expect(achievedText).toContain(messages.ended);
                expect(achievedText).toContain(messages.detailCompleted);
                expect(incompleteText).toContain(messages.ended);
                expect(incompleteText).toContain(messages.joined);
                expect(incompleteText).not.toContain(messages.detailCompleted);
                expect(incompleteText).toContain('0 / 10,000');
                expect(incompleteText).not.toContain(messages.progressNotRecorded);
                expect(incompleteText).not.toContain(messages.progressUnavailable);
                expect(unavailableText).toContain(messages.progressUnavailable);
                expect(unavailableText).not.toContain('0 / 10,000');

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

                const raceCountsBefore = await page.evaluate(() => ({
                    aborts: Number(
                        document.body.dataset.challengeProgressAbortCount ?? '0',
                    ),
                    delayed: Number(
                        document.body.dataset.challengeDelayedProgressStarted ?? '0',
                    ),
                }));
                await page.evaluate(() => {
                    document.body.dataset.delayNextChallengeProgress = 'true';
                });
                await activeTab.click();
                await page.waitForFunction((expectedCount) => (
                    Number(document.body.dataset.challengeDelayedProgressStarted ?? '0')
                        === expectedCount
                ), raceCountsBefore.delayed + 1);
                await historyTab.click();
                await page.locator('h3', { hasText: 'History incomplete' }).waitFor();
                expect(Number(
                    await page.locator('body').getAttribute(
                        'data-challenge-progress-abort-count',
                    ),
                )).toBe(raceCountsBefore.aborts + 1);
                expect(await page.locator('h3', { hasText: 'Active less remaining' }).count())
                    .toBe(0);

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

                await page.clock.setSystemTime(new Date('2099-03-03T00:00:00.000Z'));
                await page.locator('#edit-modal-trigger').focus();
                await page.evaluate(() => {
                    document.body.dataset.challengeEditPutOutcome = 'delayed-conflict';
                    const render = Reflect.get(globalThis, 'renderEditChallengeModal');
                    if (typeof render !== 'function') {
                        throw new Error('Edit challenge modal renderer missing');
                    }
                    render('2099-03-10');
                });
                await editDialog.waitFor();
                const conflictTitle = editDialog.getByLabel(messages.titleLabel);
                const retainedDraft = `Retained ${locale} draft`;
                await conflictTitle.fill(retainedDraft);
                await editDialog.getByRole('button', {
                    name: messages.save,
                    exact: true,
                }).click();
                await page.waitForFunction(() => (
                    document.body.dataset.challengeEditPutCount === '1'
                ));
                await conflictTitle.press('Enter');
                expect(await page.locator('body').getAttribute('data-challenge-edit-put-count'))
                    .toBe('1');
                await page.evaluate(() => {
                    const resolve = Reflect.get(globalThis, 'resolveDelayedEditChallengePut');
                    if (typeof resolve !== 'function') {
                        throw new Error('Delayed edit PUT resolver missing');
                    }
                    resolve();
                });
                const conflictAlert = editDialog.getByRole('alert');
                await page.waitForFunction((conflictMessage) => (
                    document.querySelector('[role="dialog"] [role="alert"]')?.textContent
                        === conflictMessage
                ), messages.editNotEditable);
                expect(await conflictAlert.count()).toBe(1);
                expect(await conflictAlert.getAttribute('aria-atomic')).toBe('true');
                expect(await conflictAlert.innerText()).toBe(messages.editNotEditable);
                expect(await conflictAlert.innerText()).not.toContain('Sensitive server');
                const alertColors = await conflictAlert.evaluate((element) => {
                    const style = window.getComputedStyle(element);
                    const toRgb = (color: string): number[] => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 1;
                        canvas.height = 1;
                        const context = canvas.getContext('2d');
                        if (!context) throw new Error('Canvas color conversion unavailable');
                        context.fillStyle = color;
                        context.fillRect(0, 0, 1, 1);
                        return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
                    };
                    return {
                        backgroundColor: toRgb(style.backgroundColor),
                        color: toRgb(style.color),
                    };
                });
                expect(getContrastRatio(alertColors.color, alertColors.backgroundColor))
                    .toBeGreaterThanOrEqual(4.5);
                expect(await conflictTitle.inputValue()).toBe(retainedDraft);
                expect(await conflictTitle.isDisabled()).toBe(true);
                expect(await editDialog.getByRole('button', {
                    name: messages.save,
                    exact: true,
                }).isDisabled()).toBe(true);
                expect(await editDialog.getByRole('button', {
                    name: messages.closeAfterConflict,
                    exact: true,
                }).isEnabled()).toBe(true);
                expect(await editDialog.getByRole('button', {
                    name: messages.closeAfterConflict,
                    exact: true,
                }).evaluate((element) => document.activeElement === element)).toBe(true);
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
                            dialogLeft: dialogRect.left,
                            dialogRight: dialogRect.right,
                            horizontalOverflow:
                                document.documentElement.scrollWidth > window.innerWidth,
                            minimumControlHeight: Math.min(
                                ...controls.map(
                                    (control) => control.getBoundingClientRect().height,
                                ),
                            ),
                            viewportWidth: window.innerWidth,
                        };
                    });
                    expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);
                    expect(geometry.dialogRight).toBeLessThanOrEqual(
                        geometry.viewportWidth,
                    );
                    expect(geometry.horizontalOverflow).toBe(false);
                    expect(geometry.minimumControlHeight).toBeGreaterThanOrEqual(44);
                }
                await page.keyboard.press('Escape');
                await editDialog.waitFor({ state: 'detached' });
                expect(await page.locator('#edit-modal-trigger').evaluate(
                    (element) => document.activeElement === element,
                )).toBe(true);
                expect(await page.locator('body').getAttribute('data-challenge-edit-close-count'))
                    .toBe('3');

                await page.clock.setSystemTime(new Date('2099-03-03T14:59:59.800Z'));
                await page.locator('#edit-modal-trigger').focus();
                await page.evaluate(() => {
                    document.body.dataset.challengeEditPutOutcome = 'delayed-failure';
                    const render = Reflect.get(globalThis, 'renderEditChallengeModal');
                    if (typeof render !== 'function') {
                        throw new Error('Edit challenge modal renderer missing');
                    }
                    render('2099-03-03');
                });
                await editDialog.waitFor();
                const delayedFailureTitle = editDialog.getByLabel(messages.titleLabel);
                await editDialog.getByRole('button', {
                    name: messages.save,
                    exact: true,
                }).click();
                await page.waitForFunction(() => (
                    document.body.dataset.challengeEditPutCount === '2'
                ));
                expect(await editDialog.getByRole('button', {
                    name: messages.saving,
                    exact: true,
                }).isDisabled()).toBe(true);
                await delayedFailureTitle.press('Enter');
                expect(await page.locator('body').getAttribute('data-challenge-edit-put-count'))
                    .toBe('2');
                await page.keyboard.press('Escape');
                expect(await editDialog.count()).toBe(1);
                await page.clock.fastForward(300);
                await editDialog.getByRole('alert').waitFor();
                expect(await editDialog.getByRole('alert').innerText())
                    .toBe(messages.editExpiredPending);
                expect(await delayedFailureTitle.isDisabled()).toBe(true);
                expect(await page.locator('body').getAttribute('data-challenge-edit-close-count'))
                    .toBe('3');
                await page.evaluate(() => {
                    const resolve = Reflect.get(globalThis, 'resolveDelayedEditChallengePut');
                    if (typeof resolve !== 'function') {
                        throw new Error('Delayed edit PUT resolver missing');
                    }
                    resolve();
                });
                await page.waitForFunction((failureMessage) => (
                    document.querySelector('[role="dialog"] [role="alert"]')?.textContent
                        === failureMessage
                ), messages.updateFailed);
                expect(await delayedFailureTitle.inputValue()).toBe('Edit boundary');
                expect(await delayedFailureTitle.isDisabled()).toBe(true);
                expect(await editDialog.getByRole('button', {
                    name: messages.cancelEdit,
                    exact: true,
                }).isEnabled()).toBe(true);
                expect(await page.locator('body').getAttribute('data-challenge-edit-updated-count'))
                    .toBeNull();
                await page.keyboard.press('Escape');
                await editDialog.waitFor({ state: 'detached' });
                expect(await page.locator('#edit-modal-trigger').evaluate(
                    (element) => document.activeElement === element,
                )).toBe(true);

                await page.clock.setSystemTime(new Date('2099-03-04T14:59:59.800Z'));
                await page.locator('#edit-modal-trigger').focus();
                await page.evaluate(() => {
                    document.body.dataset.challengeEditPutOutcome = 'delayed-success';
                    const render = Reflect.get(globalThis, 'renderEditChallengeModal');
                    if (typeof render !== 'function') {
                        throw new Error('Edit challenge modal renderer missing');
                    }
                    render('2099-03-04');
                });
                await editDialog.waitFor();
                await editDialog.getByRole('button', {
                    name: messages.save,
                    exact: true,
                }).click();
                await page.waitForFunction(() => (
                    document.body.dataset.challengeEditPutCount === '3'
                ));
                await page.clock.fastForward(300);
                await editDialog.getByRole('alert').waitFor();
                expect(await editDialog.getByRole('alert').innerText())
                    .toBe(messages.editExpiredPending);
                expect(await editDialog.count()).toBe(1);
                await page.evaluate(() => {
                    const resolve = Reflect.get(globalThis, 'resolveDelayedEditChallengePut');
                    if (typeof resolve !== 'function') {
                        throw new Error('Delayed edit PUT resolver missing');
                    }
                    resolve();
                });
                await editDialog.waitFor({ state: 'detached' });
                expect(await page.locator('body').getAttribute('data-challenge-edit-updated-count'))
                    .toBe('1');
                expect(await page.locator('body').getAttribute('data-challenge-edit-close-count'))
                    .toBe('5');
                expect(await page.locator('body').getAttribute('data-challenge-edit-put-count'))
                    .toBe('3');
                expect(await page.locator('#edit-modal-trigger').evaluate(
                    (element) => document.activeElement === element,
                )).toBe(true);
                await page.waitForFunction(() => {
                    const getMetrics = Reflect.get(globalThis, 'getChallengeLifecycleMetrics');
                    if (typeof getMetrics !== 'function') return false;
                    const metrics = getMetrics();
                    return metrics.pendingTimerDelays.length === 0
                        && metrics.visibilityListenerCount === 0;
                });

                await page.clock.setSystemTime(new Date('2099-03-05T00:00:00.000Z'));
                await page.locator('#edit-modal-trigger').focus();
                await page.evaluate(() => {
                    document.body.dataset.challengeEditPutOutcome = 'delayed-past-end-date';
                    const render = Reflect.get(globalThis, 'renderEditChallengeModal');
                    if (typeof render !== 'function') {
                        throw new Error('Edit challenge modal renderer missing');
                    }
                    render('2099-03-10');
                });
                await editDialog.waitFor();
                const pastDateTitle = editDialog.getByLabel(messages.titleLabel);
                const pastDateInput = editDialog.getByLabel(messages.endDate);
                const pastDateDraft = `Past date ${locale} draft`;
                await pastDateTitle.fill(pastDateDraft);
                await pastDateInput.fill('2099-03-04');
                await editDialog.getByRole('button', {
                    name: messages.save,
                    exact: true,
                }).click();
                await page.waitForFunction(() => (
                    document.body.dataset.challengeEditPutCount === '4'
                ));
                await pastDateInput.press('Enter');
                expect(await page.locator('body').getAttribute('data-challenge-edit-put-count'))
                    .toBe('4');
                await page.evaluate(() => {
                    const resolve = Reflect.get(globalThis, 'resolveDelayedEditChallengePut');
                    if (typeof resolve !== 'function') {
                        throw new Error('Delayed edit PUT resolver missing');
                    }
                    resolve();
                });
                const pastDateAlert = editDialog.getByRole('alert');
                await page.waitForFunction((errorMessage) => (
                    document.querySelector('[role="dialog"] [role="alert"]')?.textContent
                        === errorMessage
                ), messages.editEndDateInPast);
                expect(await pastDateAlert.count()).toBe(1);
                expect(await pastDateAlert.getAttribute('aria-atomic')).toBe('true');
                expect(await pastDateAlert.innerText()).toBe(messages.editEndDateInPast);
                expect(await pastDateAlert.innerText()).not.toContain('Sensitive past date');
                expect(await pastDateTitle.inputValue()).toBe(pastDateDraft);
                expect(await pastDateInput.inputValue()).toBe('2099-03-04');
                expect(await pastDateInput.getAttribute('aria-invalid')).toBe('true');
                expect(await pastDateInput.getAttribute('aria-describedby'))
                    .toBe('edit-challenge-error');
                expect(await pastDateInput.isEnabled()).toBe(true);
                expect(await editDialog.getByRole('button', {
                    name: messages.save,
                    exact: true,
                }).isEnabled()).toBe(true);
                expect(await pastDateInput.evaluate(
                    (element) => document.activeElement === element,
                )).toBe(true);
                expect(await page.locator('body').getAttribute('data-challenge-edit-updated-count'))
                    .toBe('1');
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
                            dialogLeft: dialogRect.left,
                            dialogRight: dialogRect.right,
                            horizontalOverflow:
                                document.documentElement.scrollWidth > window.innerWidth,
                            minimumControlHeight: Math.min(
                                ...controls.map(
                                    (control) => control.getBoundingClientRect().height,
                                ),
                            ),
                            viewportWidth: window.innerWidth,
                        };
                    });
                    expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);
                    expect(geometry.dialogRight).toBeLessThanOrEqual(
                        geometry.viewportWidth,
                    );
                    expect(geometry.horizontalOverflow).toBe(false);
                    expect(geometry.minimumControlHeight).toBeGreaterThanOrEqual(44);
                }
                await pastDateInput.fill('2099-03-05');
                expect(await pastDateAlert.count()).toBe(0);
                expect(await pastDateInput.getAttribute('aria-invalid')).toBeNull();
                expect(await pastDateInput.getAttribute('aria-describedby')).toBeNull();
                expect(await pastDateTitle.inputValue()).toBe(pastDateDraft);
                await page.keyboard.press('Escape');
                await editDialog.waitFor({ state: 'detached' });
                expect(await page.locator('#edit-modal-trigger').evaluate(
                    (element) => document.activeElement === element,
                )).toBe(true);
                expect(await page.locator('body').getAttribute('data-challenge-edit-close-count'))
                    .toBe('6');

                let timezoneSnapshot: SurfaceTimezoneSnapshot | null = null;
                for (const timezoneId of [
                    'Asia/Tokyo',
                    'UTC',
                    'America/New_York',
                ]) {
                    await cdpSession.send('Emulation.setTimezoneOverride', { timezoneId });
                    await page.clock.setSystemTime(new Date('2099-04-01T14:59:59.800Z'));
                    await page.evaluate(({ nextLocale, timezone }) => {
                        const resetDelays = Reflect.get(globalThis, 'resetChallengeTimerDelays');
                        const renderDetail = Reflect.get(
                            globalThis,
                            'renderChallengeDetailModal',
                        );
                        const renderDashboard = Reflect.get(
                            globalThis,
                            'renderDashboardChallenges',
                        );
                        if (
                            typeof resetDelays !== 'function'
                            || typeof renderDetail !== 'function'
                            || typeof renderDashboard !== 'function'
                        ) {
                            throw new Error('Challenge schedule surface renderer missing');
                        }
                        resetDelays();
                        document.getElementById('detail-modal-trigger')?.focus();
                        renderDetail(
                            nextLocale,
                            `detail-${timezone}`,
                            '2099-04-02',
                            '2099-04-03',
                            true,
                        );
                        renderDashboard(nextLocale, [
                            {
                                id: `dashboard-near-${timezone}`,
                                title: 'Dashboard near',
                                start_date: '2099-04-02',
                                end_date: '2099-04-03',
                            },
                            {
                                id: `dashboard-later-${timezone}`,
                                title: 'Dashboard later',
                                start_date: '2099-04-03',
                                end_date: '2099-04-03',
                            },
                        ]);
                    }, { nextLocale: locale, timezone: timezoneId.replaceAll('/', '-') });

                    const detailDialog = page.getByRole('dialog', {
                        name: 'Schedule detail',
                    });
                    const dashboardCards = page.locator(
                        '#dashboard-root .home-challenge-card',
                    );
                    await detailDialog.getByText('Schedule detail').waitFor();
                    await dashboardCards.first().waitFor();
                    await page.waitForFunction(() => {
                        const getMetrics = Reflect.get(
                            globalThis,
                            'getChallengeLifecycleMetrics',
                        );
                        if (typeof getMetrics !== 'function') return false;
                        const metrics = getMetrics();
                        return metrics.pendingTimerDelays.length === 2
                            && metrics.visibilityListenerCount === 2;
                    });

                    const beforeStartText = messages.daysLeft.replace('{count}', '3');
                    expect(await detailDialog.innerText()).toContain(beforeStartText);
                    expect(await dashboardCards.first().innerText()).toContain(
                        beforeStartText,
                    );
                    await page.clock.setSystemTime(new Date('2099-04-01T15:00:00.000Z'));
                    await page.evaluate(() => {
                        const setVisibility = Reflect.get(
                            globalThis,
                            'setChallengeVisibility',
                        );
                        if (typeof setVisibility !== 'function') {
                            throw new Error('Challenge visibility control missing');
                        }
                        setVisibility('visible');
                    });
                    const afterStartText = messages.daysLeft.replace('{count}', '2');
                    await page.waitForFunction((expectedText) => (
                        document.querySelector('[role="dialog"]')?.textContent
                            ?.includes(expectedText)
                        && document.querySelector(
                            '#dashboard-root .home-challenge-card',
                        )?.textContent?.includes(expectedText)
                    ), afterStartText);
                    const nextSnapshot = {
                        detailText: await detailDialog.innerText(),
                        dashboardText: await page.locator('#dashboard-root').innerText(),
                    };
                    if (timezoneSnapshot === null) {
                        timezoneSnapshot = nextSnapshot;
                    } else {
                        expect(nextSnapshot).toEqual(timezoneSnapshot);
                    }

                    if (timezoneId === 'Asia/Tokyo') {
                        for (const width of [320, 375, 1280]) {
                            await page.setViewportSize({ width, height: 800 });
                            const geometry = await page.evaluate(() => {
                                const dialog = document.querySelector<HTMLElement>(
                                    '[role="dialog"]',
                                );
                                const closeButton = dialog?.querySelector<HTMLButtonElement>(
                                    'button',
                                );
                                const dashboardLinks = [
                                    ...document.querySelectorAll<HTMLElement>(
                                        '#dashboard-root a',
                                    ),
                                ];
                                if (!dialog || !closeButton || dashboardLinks.length === 0) {
                                    throw new Error('Challenge schedule surface geometry missing');
                                }
                                const dialogRect = dialog.getBoundingClientRect();
                                return {
                                    dialogLeft: dialogRect.left,
                                    dialogRight: dialogRect.right,
                                    horizontalOverflow:
                                        document.documentElement.scrollWidth
                                        > window.innerWidth,
                                    minimumActionHeight: Math.min(
                                        closeButton.getBoundingClientRect().height,
                                        ...dashboardLinks.map(
                                            (link) => link.getBoundingClientRect().height,
                                        ),
                                    ),
                                    viewportWidth: window.innerWidth,
                                };
                            });
                            expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);
                            expect(geometry.dialogRight).toBeLessThanOrEqual(
                                geometry.viewportWidth,
                            );
                            expect(geometry.horizontalOverflow).toBe(false);
                            expect(geometry.minimumActionHeight).toBeGreaterThanOrEqual(44);
                        }
                    }

                    await page.evaluate(() => {
                        const setVisibility = Reflect.get(
                            globalThis,
                            'setChallengeVisibility',
                        );
                        if (typeof setVisibility !== 'function') {
                            throw new Error('Challenge visibility control missing');
                        }
                        setVisibility('hidden');
                    });
                    await page.clock.setSystemTime(new Date('2099-04-03T15:00:00.000Z'));
                    expect(await detailDialog.innerText()).not.toContain(messages.ended);
                    expect(await dashboardCards.first().innerText()).not.toContain(
                        messages.daysLeft.replace('{count}', '0'),
                    );
                    await page.evaluate(() => {
                        const setVisibility = Reflect.get(
                            globalThis,
                            'setChallengeVisibility',
                        );
                        if (typeof setVisibility !== 'function') {
                            throw new Error('Challenge visibility control missing');
                        }
                        setVisibility('visible');
                    });
                    await page.waitForFunction(({ endedText, zeroDaysText }) => (
                        document.querySelector('[role="dialog"]')?.textContent
                            ?.includes(endedText)
                        && document.querySelector(
                            '#dashboard-root .home-challenge-card',
                        )?.textContent?.includes(zeroDaysText)
                    ), {
                        endedText: messages.ended,
                        zeroDaysText: messages.daysLeft.replace('{count}', '0'),
                    });
                    await page.waitForFunction(() => {
                        const getMetrics = Reflect.get(
                            globalThis,
                            'getChallengeLifecycleMetrics',
                        );
                        if (typeof getMetrics !== 'function') return false;
                        const metrics = getMetrics();
                        return metrics.pendingTimerDelays.length === 0
                            && metrics.visibilityListenerCount === 0;
                    });

                    await page.evaluate(() => {
                        const clearDetail = Reflect.get(
                            globalThis,
                            'clearChallengeDetailModal',
                        );
                        if (typeof clearDetail !== 'function') {
                            throw new Error('Challenge detail surface cleanup missing');
                        }
                        clearDetail();
                    });
                    await detailDialog.waitFor({ state: 'detached' });
                    const dashboardViewAll = page.locator(
                        '#dashboard-root a[href="/challenges"]',
                    ).first();
                    await dashboardViewAll.focus();
                    expect(await dashboardViewAll.evaluate(
                        (element) => document.activeElement === element,
                    )).toBe(true);
                    await page.evaluate(() => {
                        const clearDashboard = Reflect.get(
                            globalThis,
                            'clearDashboardChallenges',
                        );
                        if (typeof clearDashboard !== 'function') {
                            throw new Error('Challenge dashboard surface cleanup missing');
                        }
                        clearDashboard();
                    });

                    await page.evaluate(({ nextLocale, timezone }) => {
                        const renderDetail = Reflect.get(
                            globalThis,
                            'renderChallengeDetailModal',
                        );
                        const renderDashboard = Reflect.get(
                            globalThis,
                            'renderDashboardChallenges',
                        );
                        if (
                            typeof renderDetail !== 'function'
                            || typeof renderDashboard !== 'function'
                        ) {
                            throw new Error('Challenge invalid schedule renderer missing');
                        }
                        renderDetail(
                            nextLocale,
                            `detail-invalid-${timezone}`,
                            'not-a-date',
                            '2099-04-03',
                            true,
                        );
                        renderDashboard(nextLocale, [
                            {
                                id: `dashboard-invalid-${timezone}`,
                                title: 'Dashboard invalid',
                                start_date: 'not-a-date',
                                end_date: '2099-04-03',
                            },
                            {
                                id: `dashboard-reversed-${timezone}`,
                                title: 'Dashboard reversed',
                                start_date: '2099-04-05',
                                end_date: '2099-04-03',
                            },
                        ]);
                    }, { nextLocale: locale, timezone: timezoneId.replaceAll('/', '-') });
                    const invalidDialog = page.getByRole('dialog', {
                        name: 'Schedule detail',
                    });
                    const invalidDashboardCards = page.locator(
                        '#dashboard-root .home-challenge-card',
                    );
                    await invalidDialog.getByText(messages.ended).waitFor();
                    await invalidDashboardCards.first().waitFor();
                    expect(await invalidDashboardCards.first().innerText()).toContain(
                        messages.daysLeft.replace('{count}', '0'),
                    );
                    await page.waitForFunction(() => {
                        const getMetrics = Reflect.get(
                            globalThis,
                            'getChallengeLifecycleMetrics',
                        );
                        if (typeof getMetrics !== 'function') return false;
                        const metrics = getMetrics();
                        return metrics.pendingTimerDelays.length === 0
                            && metrics.visibilityListenerCount === 0;
                    });
                    await page.evaluate(() => {
                        const clearDetail = Reflect.get(
                            globalThis,
                            'clearChallengeDetailModal',
                        );
                        const clearDashboard = Reflect.get(
                            globalThis,
                            'clearDashboardChallenges',
                        );
                        if (
                            typeof clearDetail !== 'function'
                            || typeof clearDashboard !== 'function'
                        ) {
                            throw new Error('Challenge invalid schedule cleanup missing');
                        }
                        clearDetail();
                        clearDashboard();
                    });
                    await invalidDialog.waitFor({ state: 'detached' });

                    if (timezoneId === 'Asia/Tokyo') {
                        await page.clock.setSystemTime(new Date('2099-01-01T00:00:00.000Z'));
                        await page.evaluate((nextLocale) => {
                            const renderDetail = Reflect.get(
                                globalThis,
                                'renderChallengeDetailModal',
                            );
                            if (typeof renderDetail !== 'function') {
                                throw new Error('Challenge detail long timer renderer missing');
                            }
                            renderDetail(
                                nextLocale,
                                'detail-long',
                                '2099-02-10',
                                '2099-02-15',
                                true,
                            );
                        }, locale);
                        await page.getByRole('dialog', {
                            name: 'Schedule detail',
                        }).getByText('Schedule detail').waitFor();
                        await page.waitForFunction((maximumDelay) => {
                            const getMetrics = Reflect.get(
                                globalThis,
                                'getChallengeLifecycleMetrics',
                            );
                            if (typeof getMetrics !== 'function') return false;
                            const metrics = getMetrics();
                            return metrics.pendingTimerDelays.length === 1
                                && metrics.pendingTimerDelays[0] === maximumDelay
                                && metrics.visibilityListenerCount === 1;
                        }, MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);
                        await page.evaluate((nextLocale) => {
                            const renderDetail = Reflect.get(
                                globalThis,
                                'renderChallengeDetailModal',
                            );
                            if (typeof renderDetail !== 'function') {
                                throw new Error('Challenge detail replacement missing');
                            }
                            renderDetail(
                                nextLocale,
                                'detail-replacement',
                                '2099-01-02',
                                '2099-01-03',
                                false,
                            );
                        }, locale);
                        await page.waitForFunction((maximumDelay) => {
                            const getMetrics = Reflect.get(
                                globalThis,
                                'getChallengeLifecycleMetrics',
                            );
                            if (typeof getMetrics !== 'function') return false;
                            const metrics = getMetrics();
                            return metrics.pendingTimerDelays.length === 1
                                && metrics.pendingTimerDelays[0] > 0
                                && metrics.pendingTimerDelays[0] < maximumDelay
                                && metrics.visibilityListenerCount === 1;
                        }, MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);
                        await page.evaluate(() => {
                            const clearDetail = Reflect.get(
                                globalThis,
                                'clearChallengeDetailModal',
                            );
                            if (typeof clearDetail !== 'function') {
                                throw new Error('Challenge detail cleanup missing');
                            }
                            clearDetail();
                        });
                        await page.waitForFunction(() => {
                            const getMetrics = Reflect.get(
                                globalThis,
                                'getChallengeLifecycleMetrics',
                            );
                            if (typeof getMetrics !== 'function') return false;
                            const metrics = getMetrics();
                            return metrics.pendingTimerDelays.length === 0
                                && metrics.visibilityListenerCount === 0;
                        });

                        await page.evaluate((nextLocale) => {
                            const renderDashboard = Reflect.get(
                                globalThis,
                                'renderDashboardChallenges',
                            );
                            if (typeof renderDashboard !== 'function') {
                                throw new Error('Challenge dashboard long timer missing');
                            }
                            renderDashboard(nextLocale, [
                                {
                                    id: 'dashboard-long-near',
                                    title: 'Dashboard long near',
                                    start_date: '2099-02-10',
                                    end_date: '2099-02-15',
                                },
                                {
                                    id: 'dashboard-long-later',
                                    title: 'Dashboard long later',
                                    start_date: '2099-02-20',
                                    end_date: '2099-02-25',
                                },
                            ]);
                        }, locale);
                        await page.locator(
                            '#dashboard-root .home-challenge-card',
                        ).first().waitFor();
                        await page.waitForFunction((maximumDelay) => {
                            const getMetrics = Reflect.get(
                                globalThis,
                                'getChallengeLifecycleMetrics',
                            );
                            if (typeof getMetrics !== 'function') return false;
                            const metrics = getMetrics();
                            return metrics.pendingTimerDelays.length === 1
                                && metrics.pendingTimerDelays[0] === maximumDelay
                                && metrics.visibilityListenerCount === 1;
                        }, MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);
                        await page.clock.fastForward(
                            MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS - 1,
                        );
                        await page.clock.fastForward(101);
                        await page.waitForFunction((maximumDelay) => {
                            const getMetrics = Reflect.get(
                                globalThis,
                                'getChallengeLifecycleMetrics',
                            );
                            if (typeof getMetrics !== 'function') return false;
                            const metrics = getMetrics();
                            return metrics.pendingTimerDelays.length === 1
                                && metrics.pendingTimerDelays[0] > 0
                                && metrics.pendingTimerDelays[0] < maximumDelay
                                && metrics.visibilityListenerCount === 1;
                        }, MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);
                        await page.evaluate(() => {
                            const clearDashboard = Reflect.get(
                                globalThis,
                                'clearDashboardChallenges',
                            );
                            if (typeof clearDashboard !== 'function') {
                                throw new Error('Challenge dashboard cleanup missing');
                            }
                            clearDashboard();
                        });
                        await page.waitForFunction(() => {
                            const getMetrics = Reflect.get(
                                globalThis,
                                'getChallengeLifecycleMetrics',
                            );
                            if (typeof getMetrics !== 'function') return false;
                            const metrics = getMetrics();
                            return metrics.pendingTimerDelays.length === 0
                                && metrics.visibilityListenerCount === 0;
                        });

                        await page.clock.setSystemTime(
                            new Date('2099-04-01T15:00:00.000Z'),
                        );
                        await page.locator('#detail-modal-trigger').focus();
                        await page.evaluate((nextLocale) => {
                            const renderDetail = Reflect.get(
                                globalThis,
                                'renderChallengeDetailModal',
                            );
                            if (typeof renderDetail !== 'function') {
                                throw new Error('Challenge detail keyboard renderer missing');
                            }
                            renderDetail(
                                nextLocale,
                                'detail-keyboard',
                                '2099-04-02',
                                '2099-04-03',
                                true,
                            );
                        }, locale);
                        const keyboardDialog = page.getByRole('dialog', {
                            name: 'Schedule detail',
                        });
                        const closeDetailButton = keyboardDialog.getByRole('button', {
                            name: messages.closeDetailDialog,
                        });
                        await closeDetailButton.focus();
                        await page.keyboard.press('Escape');
                        await keyboardDialog.waitFor({ state: 'detached' });
                        expect(await page.locator('#detail-modal-trigger').evaluate(
                            (element) => document.activeElement === element,
                        )).toBe(true);
                    }
                }
                expect(timezoneSnapshot).not.toBeNull();
            }

            expect(await page.locator('body').getAttribute('data-challenge-requests'))
                .toBe(
                    'active,active,active,active,completed,my,active,completed,'
                    + 'active,active,active,active,completed,my,active,completed',
                );
            expect(await page.locator('body').getAttribute(
                'data-challenge-progress-batch-count',
            )).toBe('14');
            expect(await page.evaluate(() => JSON.parse(
                document.body.dataset.challengeProgressBatchBodies ?? '[]',
            ).map((challengeIds: unknown[]) => challengeIds.length))).toEqual([
                4, 4, 5, 4, 3, 4, 3,
                4, 4, 5, 4, 3, 4, 3,
            ]);
            expect(await page.locator('body').getAttribute(
                'data-challenge-progress-single-count',
            )).toBeNull();
            expect(await page.locator('body').getAttribute(
                'data-challenge-progress-abort-count',
            )).toBe('2');
            expect(await page.locator('body').getAttribute('data-challenge-join-count'))
                .toBe('2');
            expect(await page.locator('body').getAttribute('data-challenge-leave-count'))
                .toBe('2');
            expect(pageErrors).toEqual([]);
            expect(consoleErrors).toEqual([]);
        } finally {
            await browser.close();
        }
    }, 120_000); // hosted CI 2-coreで30_000超過を実測 (run 31153059180)。ローカル4.8秒、CIはTailwindコンパイル+Chrome起動が低速なため余裕を持たせる。
});
