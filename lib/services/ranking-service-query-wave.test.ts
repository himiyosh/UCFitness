import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createSupabaseWaveProbe,
    waveOperation,
} from '@/lib/__tests__/test-utils/supabase-wave-probe';

import type {
    SupabaseWaveProbe,
    SupabaseWaveQuerySpec,
} from '@/lib/__tests__/test-utils/supabase-wave-probe';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
}));

vi.mock('next/cache', () => ({
    unstable_cache: (callback: unknown) => callback,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { getGroupRankings } from './ranking-service';

const GROUP_ID = 'fixture-ranking-group';
const ACTIVE_USER_ID = 'fixture-ranking-user';

interface StepRow {
    user_id: string;
    steps: number;
    date: string;
}

interface RankingScenarioOptions {
    members?: readonly Record<string, unknown>[];
    memberError?: unknown;
    stepPages?: readonly (readonly StepRow[])[];
    stepError?: unknown;
}

interface RankingScenario {
    probe: SupabaseWaveProbe;
    waves: readonly (readonly string[])[];
}

function createStepRows(count: number, offset = 0): StepRow[] {
    return Array.from({ length: count }, (_, index) => ({
        user_id: ACTIVE_USER_ID,
        steps: offset + index + 1,
        date: '2026-07-30',
    }));
}

function activeMember(): Record<string, unknown> {
    return {
        user_id: ACTIVE_USER_ID,
        users: {
            id: ACTIVE_USER_ID,
            name: 'Fixture Ranking User',
            image: null,
            username: 'fixture-ranking-user',
        },
    };
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

function createRankingScenario(
    options: RankingScenarioOptions = {},
): RankingScenario {
    const members = options.members ?? [activeMember()];
    const stepPages = options.stepPages ?? [[{
        user_id: ACTIVE_USER_ID,
        steps: 500,
        date: '2026-07-30',
    }]];
    const specs: SupabaseWaveQuerySpec[] = [
        querySpec(
            'ranking:members',
            1,
            'group_members',
            [
                waveOperation('eq', 'group_id', GROUP_ID),
                waveOperation('returns'),
            ],
            [...members],
            options.memberError ?? null,
        ),
    ];
    const waves: string[][] = [['ranking:members']];

    if (options.memberError === undefined && members.length > 0) {
        stepPages.forEach((page, index) => {
            const label = `ranking:steps:page-${index + 1}`;
            specs.push(querySpec(
                label,
                2 + index,
                'daily_steps',
                [
                    waveOperation('in', 'user_id', [ACTIVE_USER_ID]),
                    waveOperation('order', 'date', { ascending: true }),
                    waveOperation('order', 'user_id', { ascending: true }),
                    waveOperation('range', index * 900, (index + 1) * 900 - 1),
                    waveOperation('returns'),
                ],
                [...page],
                index === 0 ? options.stepError ?? null : null,
            ));
            waves.push([label]);
        });
    }

    return {
        probe: createSupabaseWaveProbe(specs),
        waves,
    };
}

async function releaseExpectedWaves(scenario: RankingScenario): Promise<void> {
    for (const wave of scenario.waves) {
        await scenario.probe.whenStarted(wave);
        scenario.probe.releaseWave(wave);
    }
}

function expectCompletedScenario(scenario: RankingScenario): void {
    scenario.probe.assertComplete();
    expect(scenario.probe.getCompletedWaves()).toEqual(
        scenario.waves.map((wave) => [...wave].sort()),
    );
}

describe('getGroupRankings query dependency waves', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('membersとstepsが各partial pageの場合、2 queriesを2 wavesで実行する', async () => {
        const scenario = createRankingScenario();
        mocks.from.mockImplementation(scenario.probe.from);
        const rankingPromise = getGroupRankings(GROUP_ID, 'DAILY');

        await releaseExpectedWaves(scenario);
        const ranking = await rankingPromise;

        expect(ranking).toHaveLength(1);
        expect(scenario.probe.getStartedLabels()).toHaveLength(2);
        expect(scenario.probe.getCompletedWaves()).toHaveLength(2);
        expectCompletedScenario(scenario);
    });

    it('memberが0件の場合、stepsを開始せず1 queryと1 waveで空順位を返す', async () => {
        const scenario = createRankingScenario({ members: [] });
        mocks.from.mockImplementation(scenario.probe.from);
        const rankingPromise = getGroupRankings(GROUP_ID, 'DAILY');

        await releaseExpectedWaves(scenario);

        await expect(rankingPromise).resolves.toEqual([]);
        expect(scenario.probe.getStartedLabels()).toEqual(['ranking:members']);
        expect(scenario.probe.getCompletedWaves()).toHaveLength(1);
        expectCompletedScenario(scenario);
    });

    it('stepsが900行とpartial pageの場合、3 queriesを3 wavesで実行する', async () => {
        const scenario = createRankingScenario({
            stepPages: [
                createStepRows(900),
                createStepRows(1, 900),
            ],
        });
        mocks.from.mockImplementation(scenario.probe.from);
        const rankingPromise = getGroupRankings(GROUP_ID, 'DAILY');

        await releaseExpectedWaves(scenario);
        const ranking = await rankingPromise;

        expect(ranking).toHaveLength(1);
        expect(scenario.probe.getStartedLabels()).toEqual([
            'ranking:members',
            'ranking:steps:page-1',
            'ranking:steps:page-2',
        ]);
        expect(scenario.probe.getCompletedWaves()).toHaveLength(3);
        expectCompletedScenario(scenario);
    });

    it('stepsが900行ずつ2 pageの場合、terminal emptyを含む4 queriesを4 wavesで実行する', async () => {
        const scenario = createRankingScenario({
            stepPages: [
                createStepRows(900),
                createStepRows(900, 900),
                [],
            ],
        });
        mocks.from.mockImplementation(scenario.probe.from);
        const rankingPromise = getGroupRankings(GROUP_ID, 'DAILY');

        await releaseExpectedWaves(scenario);
        const ranking = await rankingPromise;

        expect(ranking).toHaveLength(1);
        expect(scenario.probe.getStartedLabels()).toEqual([
            'ranking:members',
            'ranking:steps:page-1',
            'ranking:steps:page-2',
            'ranking:steps:page-3',
        ]);
        expect(scenario.probe.getCompletedWaves()).toHaveLength(4);
        expectCompletedScenario(scenario);
    });

    it('member queryが失敗した場合、stepsを開始せず空順位へ変換しない', async () => {
        const scenario = createRankingScenario({
            memberError: { code: 'FIXTURE_MEMBER_FAILURE' },
        });
        mocks.from.mockImplementation(scenario.probe.from);
        const rankingPromise = getGroupRankings(GROUP_ID, 'DAILY');

        await releaseExpectedWaves(scenario);

        await expect(rankingPromise).rejects.toThrow(
            'Failed to load group ranking members',
        );
        expect(scenario.probe.getStartedLabels()).toEqual(['ranking:members']);
        expectCompletedScenario(scenario);
    });

    it('step queryが失敗した場合、成功形の空順位へ変換しない', async () => {
        const scenario = createRankingScenario({
            stepError: { code: 'FIXTURE_STEP_FAILURE' },
        });
        mocks.from.mockImplementation(scenario.probe.from);
        const rankingPromise = getGroupRankings(GROUP_ID, 'DAILY');

        await releaseExpectedWaves(scenario);

        await expect(rankingPromise).rejects.toThrow(
            'Failed to load group ranking steps',
        );
        expect(scenario.probe.getStartedLabels()).toHaveLength(2);
        expectCompletedScenario(scenario);
    });
});
