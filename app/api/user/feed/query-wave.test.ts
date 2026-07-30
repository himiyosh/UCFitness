import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createSupabaseWaveProbe,
    waveOperation,
} from '@/lib/__tests__/test-utils/supabase-wave-probe';
import { encodeNotificationFeedCursor } from '@/lib/services/notification-feed';

import type {
    SupabaseWaveProbe,
    SupabaseWaveQuerySpec,
} from '@/lib/__tests__/test-utils/supabase-wave-probe';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { GET as getFeed } from './route';

const CURRENT_USER_ID = 'fixture-current-user';
const FRIEND_USER_ID = 'fixture-friend-user';
const MISSING_SENDER_ID = 'fixture-missing-sender';
const GEAR_ASIN = 'FIXTURE-ASIN';
const SNAPSHOT = '2026-07-30T00:00:00.000Z';
const CURSOR = encodeNotificationFeedCursor({
    snapshot: SNAPSHOT,
    offset: 0,
});

interface BadgeRow {
    id: string;
    user_id: string;
    badge_code: string;
    awarded_at: string;
    period_date: string;
    badges: {
        name: string;
        image_url: null;
        description: string;
        category: string;
        rank: string;
    };
}

interface ReactionRow {
    id: string;
    from_user_id: string;
    to_user_id: string;
    emoji: string;
    period: string;
    group_id: string;
    created_at: string;
}

interface FeedScenarioOptions {
    reactionsEnabled?: boolean;
    gearEnabled?: boolean;
    gearItems?: readonly { id: string; asin: string }[];
    badgePages?: readonly (readonly BadgeRow[])[];
    badgeError?: unknown;
    reactions?: readonly ReactionRow[];
    gearReactions?: readonly ReactionRow[];
    missingSenderIds?: readonly string[];
}

interface FeedScenario {
    probe: SupabaseWaveProbe;
    waves: readonly (readonly string[])[];
}

function createBadgeRows(count: number, offset = 0): BadgeRow[] {
    return Array.from({ length: count }, (_, index) => {
        const ordinal = offset + index;
        return {
            id: `fixture-badge-${ordinal}`,
            user_id: FRIEND_USER_ID,
            badge_code: `FIXTURE_BADGE_${ordinal}`,
            awarded_at: '2026-07-28T00:00:00.000Z',
            period_date: '2026-07-28',
            badges: {
                name: `Fixture badge ${ordinal}`,
                image_url: null,
                description: 'Fixture badge description',
                category: 'STEPS',
                rank: 'BRONZE',
            },
        };
    });
}

function regularReaction(fromUserId = FRIEND_USER_ID): ReactionRow {
    return {
        id: 'fixture-reaction',
        from_user_id: fromUserId,
        to_user_id: CURRENT_USER_ID,
        emoji: 'clap',
        period: 'WEEKLY',
        group_id: 'fixture-group',
        created_at: '2026-07-29T01:00:00.000Z',
    };
}

function gearReaction(fromUserId = MISSING_SENDER_ID): ReactionRow {
    return {
        id: 'fixture-gear-reaction',
        from_user_id: fromUserId,
        to_user_id: GEAR_ASIN,
        emoji: 'fire',
        period: 'GEAR',
        group_id: '__global__',
        created_at: '2026-07-29T02:00:00.000Z',
    };
}

function fixedUsers(): readonly Record<string, unknown>[] {
    return [
        {
            id: CURRENT_USER_ID,
            name: 'Fixture Current',
            image: null,
            username: 'fixture-current',
            feed_last_read_at: null,
        },
        {
            id: FRIEND_USER_ID,
            name: 'Fixture Friend',
            image: null,
            username: 'fixture-friend',
            feed_last_read_at: null,
        },
    ];
}

function querySpec(
    label: string,
    wave: number,
    table: string,
    operations: SupabaseWaveQuerySpec['operations'],
    data: unknown,
    error: unknown = null,
): SupabaseWaveQuerySpec {
    return {
        label,
        wave,
        table,
        operations,
        result: { data, error },
    };
}

function createFeedScenario(options: FeedScenarioOptions = {}): FeedScenario {
    const reactionsEnabled = options.reactionsEnabled ?? true;
    const gearEnabled = options.gearEnabled ?? true;
    const gearItems = options.gearItems ?? [{ id: 'fixture-gear', asin: GEAR_ASIN }];
    const badgePages = options.badgePages ?? [[]];
    const reactions = options.reactions ?? [regularReaction()];
    const gearReactions = options.gearReactions ?? [gearReaction()];
    const missingSenderIds = options.missingSenderIds ?? [MISSING_SENDER_ID];
    const targetIds = [CURRENT_USER_ID, FRIEND_USER_ID];
    const specs: SupabaseWaveQuerySpec[] = [
        querySpec(
            'feed:follows',
            1,
            'user_follows',
            [
                waveOperation('select', 'following_id'),
                waveOperation('eq', 'follower_id', CURRENT_USER_ID),
            ],
            [{ following_id: FRIEND_USER_ID }],
        ),
        querySpec(
            'feed:preferences',
            1,
            'users',
            [
                waveOperation(
                    'select',
                    'notification_reactions, notification_gear_reactions',
                ),
                waveOperation('eq', 'id', CURRENT_USER_ID),
                waveOperation('single'),
            ],
            {
                notification_reactions: reactionsEnabled,
                notification_gear_reactions: gearEnabled,
            },
        ),
        querySpec(
            'feed:user-context',
            2,
            'users',
            [
                waveOperation('in', 'id', targetIds),
            ],
            fixedUsers(),
        ),
    ];
    const waves: string[][] = [
        ['feed:follows', 'feed:preferences'],
        ['feed:user-context'],
    ];

    if (gearEnabled) {
        specs.push(querySpec(
            'feed:gear-items:page-1',
            2,
            'recommended_items',
            [
                waveOperation('eq', 'user_id', CURRENT_USER_ID),
                waveOperation('range', 0, 899),
            ],
            [...gearItems],
        ));
        waves[1].push('feed:gear-items:page-1');
    }

    badgePages.forEach((page, index) => {
        const wave = 2 + index;
        const label = `feed:badges:page-${index + 1}`;
        specs.push(querySpec(
            label,
            wave,
            'user_badges',
            [
                waveOperation('in', 'user_id', targetIds),
                waveOperation('range', index * 900, (index + 1) * 900 - 1),
            ],
            [...page],
            index === 0 ? options.badgeError ?? null : null,
        ));
        if (!waves[index + 1]) waves[index + 1] = [];
        waves[index + 1].push(label);
    });

    if (reactionsEnabled) {
        specs.push(querySpec(
            'feed:reactions:page-1',
            2,
            'group_reactions',
            [
                waveOperation('eq', 'to_user_id', CURRENT_USER_ID),
                waveOperation('neq', 'period', 'GEAR'),
                waveOperation('range', 0, 899),
            ],
            [...reactions],
        ));
        waves[1].push('feed:reactions:page-1');
    }

    let nextWave = 2 + badgePages.length;
    if (
        options.badgeError === undefined
        && gearEnabled
        && gearItems.length > 0
    ) {
        specs.push(querySpec(
            'feed:gear-reactions:page-1',
            nextWave,
            'group_reactions',
            [
                waveOperation('eq', 'period', 'GEAR'),
                waveOperation('in', 'to_user_id', gearItems.map((item) => item.asin)),
                waveOperation('range', 0, 899),
            ],
            [...gearReactions],
        ));
        waves.push(['feed:gear-reactions:page-1']);
        nextWave += 1;
    }

    if (options.badgeError === undefined && missingSenderIds.length > 0) {
        specs.push(querySpec(
            'feed:missing-senders',
            nextWave,
            'users',
            [
                waveOperation('in', 'id', [...missingSenderIds]),
            ],
            missingSenderIds.map((id) => ({
                id,
                name: 'Fixture Missing Sender',
                image: null,
                username: 'fixture-missing-sender',
            })),
        ));
        waves.push(['feed:missing-senders']);
    }

    return {
        probe: createSupabaseWaveProbe(specs),
        waves,
    };
}

function feedRequest(limit = 20, cursor = CURSOR): NextRequest {
    const url = new URL('http://localhost/api/user/feed');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('before', cursor);
    return new NextRequest(url);
}

async function releaseExpectedWaves(
    probe: SupabaseWaveProbe,
    waves: readonly (readonly string[])[],
): Promise<void> {
    for (const wave of waves) {
        await probe.whenStarted(wave);
        probe.releaseWave(wave);
    }
}

async function runFeedScenario(
    scenario: FeedScenario,
    request = feedRequest(),
): Promise<Response> {
    mocks.from.mockImplementation(scenario.probe.from);
    const responsePromise = getFeed(request);
    await releaseExpectedWaves(scenario.probe, scenario.waves);
    const response = await responsePromise;
    scenario.probe.assertComplete();
    expect(scenario.probe.getCompletedWaves()).toEqual(
        scenario.waves.map((wave) => [...wave].sort()),
    );
    return response;
}

describe('Feed query dependency waves', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({
            user: { id: CURRENT_USER_ID },
        });
    });

    it('full-sourceが各partial pageの場合、4 dependency wavesでvisible senderだけを補完する', async () => {
        const scenario = createFeedScenario();

        const response = await runFeedScenario(scenario, feedRequest(1));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.feed).toEqual([
            expect.objectContaining({
                type: 'GEAR_REACTION_RECEIVED',
                userName: 'Fixture Missing Sender',
            }),
        ]);
        expect(scenario.probe.getCompletedWaves()).toHaveLength(4);
    });

    it('reaction通知が無効な場合、non-gear queryと不要なsender waveを開始しない', async () => {
        const scenario = createFeedScenario({
            reactionsEnabled: false,
            gearReactions: [],
            missingSenderIds: [],
        });

        const response = await runFeedScenario(scenario);

        expect(response.status).toBe(200);
        expect(scenario.probe.getStartedLabels()).not.toContain(
            'feed:reactions:page-1',
        );
        expect(scenario.probe.getCompletedWaves()).toHaveLength(3);
    });

    it('gear通知が無効な場合、recommended itemとgear reaction queryを開始しない', async () => {
        const scenario = createFeedScenario({
            gearEnabled: false,
            missingSenderIds: [],
        });

        const response = await runFeedScenario(scenario);

        expect(response.status).toBe(200);
        expect(scenario.probe.getStartedLabels()).not.toContain(
            'feed:gear-items:page-1',
        );
        expect(scenario.probe.getStartedLabels()).not.toContain(
            'feed:gear-reactions:page-1',
        );
        expect(scenario.probe.getCompletedWaves()).toHaveLength(2);
    });

    it('recommended itemが0件の場合、gear reaction queryを開始しない', async () => {
        const scenario = createFeedScenario({
            gearItems: [],
            missingSenderIds: [],
        });

        const response = await runFeedScenario(scenario);

        expect(response.status).toBe(200);
        expect(scenario.probe.getStartedLabels()).toContain(
            'feed:gear-items:page-1',
        );
        expect(scenario.probe.getStartedLabels()).not.toContain(
            'feed:gear-reactions:page-1',
        );
        expect(scenario.probe.getCompletedWaves()).toHaveLength(2);
    });

    it('visible reaction senderがtarget context内の場合、sender hydration waveを開始しない', async () => {
        const scenario = createFeedScenario({
            gearReactions: [gearReaction(FRIEND_USER_ID)],
            missingSenderIds: [],
        });

        const response = await runFeedScenario(scenario);

        expect(response.status).toBe(200);
        expect(scenario.probe.getStartedLabels()).not.toContain(
            'feed:missing-senders',
        );
        expect(scenario.probe.getCompletedWaves()).toHaveLength(3);
    });

    it('badgeが900行とpartial pageの場合、badge query 2回と追加1 waveを固定する', async () => {
        const scenario = createFeedScenario({
            badgePages: [
                createBadgeRows(900),
                createBadgeRows(1, 900),
            ],
        });

        const response = await runFeedScenario(scenario, feedRequest(1));

        expect(response.status).toBe(200);
        expect(
            scenario.probe.getStartedLabels()
                .filter((label) => label.startsWith('feed:badges:')),
        ).toEqual(['feed:badges:page-1', 'feed:badges:page-2']);
        expect(scenario.probe.getCompletedWaves()).toHaveLength(5);
    });

    it('badgeが900行ずつ2 pageの場合、terminal empty queryと追加2 wavesを固定する', async () => {
        const scenario = createFeedScenario({
            badgePages: [
                createBadgeRows(900),
                createBadgeRows(900, 900),
                [],
            ],
        });

        const response = await runFeedScenario(scenario, feedRequest(1));

        expect(response.status).toBe(200);
        expect(
            scenario.probe.getStartedLabels()
                .filter((label) => label.startsWith('feed:badges:')),
        ).toEqual([
            'feed:badges:page-1',
            'feed:badges:page-2',
            'feed:badges:page-3',
        ]);
        expect(scenario.probe.getCompletedWaves()).toHaveLength(6);
    });

    it('source queryが失敗した場合、gear以降のdependent waveを開始しない', async () => {
        const scenario = createFeedScenario({
            badgeError: { code: 'FIXTURE_SOURCE_FAILURE' },
            missingSenderIds: [],
        });

        const response = await runFeedScenario(scenario);

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: 'Failed to fetch activity sources',
        });
        expect(scenario.probe.getStartedLabels()).not.toContain(
            'feed:gear-reactions:page-1',
        );
        expect(scenario.probe.getCompletedWaves()).toHaveLength(2);
    });

    it('cursorが不正な場合、Supabase queryを開始しない', async () => {
        const probe = createSupabaseWaveProbe([]);
        mocks.from.mockImplementation(probe.from);

        const response = await getFeed(feedRequest(20, 'invalid-cursor'));

        expect(response.status).toBe(400);
        expect(probe.getStartedLabels()).toEqual([]);
        probe.assertComplete();
    });

    it('未認証の場合、Supabase queryを開始しない', async () => {
        const probe = createSupabaseWaveProbe([]);
        mocks.auth.mockResolvedValue(null);
        mocks.from.mockImplementation(probe.from);

        const response = await getFeed(feedRequest());

        expect(response.status).toBe(401);
        expect(probe.getStartedLabels()).toEqual([]);
        probe.assertComplete();
    });
});
