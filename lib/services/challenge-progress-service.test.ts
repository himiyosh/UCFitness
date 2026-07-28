import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChallengeProgressResult } from '@/lib/challenge-progress';

const mocks = vi.hoisted(() => ({
    authorizeChallengeGroup: vi.fn(),
    from: vi.fn(),
    getJSTDateString: vi.fn(),
    reportError: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/date-utils', () => ({ getJSTDateString: mocks.getJSTDateString }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));
vi.mock('@/lib/services/challenge-access', () => ({
    authorizeChallengeGroup: mocks.authorizeChallengeGroup,
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import {
    getFreshChallengeProgress,
    getFreshChallengeProgressBatch,
} from '@/lib/services/challenge-progress-service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CHALLENGE_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPATION_ID = '44444444-4444-4444-8444-444444444444';
const BATCH_IDS = [
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000004',
    '50000000-0000-4000-8000-000000000005',
    '50000000-0000-4000-8000-000000000006',
] as const;

interface QueryResult {
    data?: unknown;
    error: unknown;
    count?: number | null;
}

interface Query extends PromiseLike<QueryResult> {
    eq(...args: unknown[]): Query;
    gte(...args: unknown[]): Query;
    lte(...args: unknown[]): Query;
    maybeSingle(): Promise<QueryResult>;
    select(...args: unknown[]): Query;
    update(value: unknown): Query;
}

let results: Record<string, QueryResult[]>;
let updates: unknown[];

function query(result: QueryResult): Query {
    const chain: Query = {
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        maybeSingle: () => Promise.resolve(result),
        select: () => chain,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
        update: (value) => {
            updates.push(value);
            return chain;
        },
    };
    return chain;
}

function challenge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: CHALLENGE_ID,
        type: 'INDIVIDUAL',
        group_id: null,
        target_steps: 1000,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        reward_uc: 500,
        ...overrides,
    };
}

function participation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: PARTICIPATION_ID,
        is_completed: false,
        completed_at: null,
        ...overrides,
    };
}

function progressSuccess(challengeId: string, totalSteps = 0): ChallengeProgressResult {
    return {
        challenge_id: challengeId,
        status: 'ok',
        progress: {
            total_steps: totalSteps,
            target_steps: 1000,
            progress_percent: Math.round((totalSteps / 1000) * 100),
            is_completed: totalSteps >= 1000,
            completed_at: null,
            reward_uc: 500,
            type: 'INDIVIDUAL',
            record_status: 'recorded',
            schedule_status: 'active',
        },
    };
}

function arrangeIndividualProgress(stepResult: QueryResult): void {
    results.challenges = [{ data: challenge(), error: null }];
    results.challenge_participants = [
        { data: participation(), error: null },
        { error: null },
    ];
    results.daily_steps = [stepResult];
}

beforeEach(() => {
    vi.clearAllMocks();
    results = {};
    updates = [];
    mocks.authorizeChallengeGroup.mockResolvedValue({ allowed: true });
    mocks.getJSTDateString.mockReturnValue('2026-07-15');
    mocks.rpc.mockResolvedValue({
        data: [{
            status: 'ok',
            total_steps: 1000,
            participant_count: 2,
            target_steps: 1000,
            is_completed: true,
        }],
        error: null,
    });
    mocks.from.mockImplementation((table: string) => {
        const result = results[table]?.shift();
        if (!result) throw new Error(`Unexpected query: ${table}`);
        return query(result);
    });
});

describe('getFreshChallengeProgress', () => {
    it('記録済み0歩の場合、recordedと0歩を保持して永続化する', async () => {
        arrangeIndividualProgress({
            data: [{ steps: 0 }],
            error: null,
            count: 1,
        });

        const result = await getFreshChallengeProgress(USER_ID, CHALLENGE_ID);

        expect(result).toMatchObject({
            status: 'ok',
            progress: {
                total_steps: 0,
                record_status: 'recorded',
                schedule_status: 'active',
            },
        });
        expect(updates).toEqual([{
            progress_steps: 0,
            is_completed: false,
            completed_at: null,
        }]);
    });

    it('歩数行がない場合、not_recordedを0歩と区別する', async () => {
        arrangeIndividualProgress({ data: [], error: null, count: 0 });

        const result = await getFreshChallengeProgress(USER_ID, CHALLENGE_ID);

        expect(result).toMatchObject({
            status: 'ok',
            progress: {
                total_steps: 0,
                record_status: 'not_recorded',
            },
        });
    });

    it.each([
        ['2026-06-30', 'not_started'],
        ['2026-08-01', 'ended'],
    ] as const)('JST日付が%sの場合、schedule状態%sを明示する', async (today, expected) => {
        mocks.getJSTDateString.mockReturnValue(today);
        arrangeIndividualProgress({ data: [], error: null, count: 0 });

        const result = await getFreshChallengeProgress(USER_ID, CHALLENGE_ID);

        expect(result).toMatchObject({
            status: 'ok',
            progress: { schedule_status: expected },
        });
        expect(updates).toHaveLength(1);
    });

    it('参加行がない場合、進捗0へ変換せずnot_participatingを返す', async () => {
        results.challenges = [{ data: challenge(), error: null }];
        results.challenge_participants = [{ data: null, error: null }];

        const result = await getFreshChallengeProgress(USER_ID, CHALLENGE_ID);

        expect(result).toEqual({
            challenge_id: CHALLENGE_ID,
            status: 'not_participating',
            progress: null,
        });
        expect(updates).toEqual([]);
    });

    it('歩数DB障害の場合、生エラーを捨てた固定stageで失敗する', async () => {
        arrangeIndividualProgress({
            data: null,
            error: new Error('raw database details'),
            count: null,
        });

        await expect(getFreshChallengeProgress(USER_ID, CHALLENGE_ID)).rejects.toMatchObject({
            code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
            context: { stage: 'steps-query' },
        });
    });

    it.each([
        {
            label: 'null data',
            stepResult: { data: null, error: null, count: 0 },
        },
        {
            label: 'negative steps',
            stepResult: { data: [{ steps: -1 }], error: null, count: 1 },
        },
        {
            label: 'count mismatch',
            stepResult: { data: [{ steps: 0 }], error: null, count: 2 },
        },
    ])('不正な歩数結果を成功へ変換しない: $label', async ({ stepResult }) => {
        arrangeIndividualProgress(stepResult);

        await expect(getFreshChallengeProgress(USER_ID, CHALLENGE_ID)).rejects.toMatchObject({
            code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
            context: { stage: 'steps-result' },
        });
    });

    it('GROUPの場合、既存RPCの再認可と集計結果を維持する', async () => {
        results.challenges = [{
            data: challenge({ type: 'GROUP', group_id: GROUP_ID }),
            error: null,
        }];
        results.challenge_participants = [
            { data: participation(), error: null },
            { error: null },
        ];

        const result = await getFreshChallengeProgress(USER_ID, CHALLENGE_ID);

        expect(result).toMatchObject({
            status: 'ok',
            progress: {
                total_steps: 1000,
                type: 'GROUP',
                record_status: 'recorded',
            },
        });
        expect(mocks.rpc).toHaveBeenCalledWith('get_group_challenge_progress', {
            p_challenge_id: CHALLENGE_ID,
            p_viewer_id: USER_ID,
        });
    });
});

describe('getFreshChallengeProgressBatch', () => {
    it('一部の項目失敗をunavailableへ分離し、入力順を維持する', async () => {
        const rawFailure = new Error('raw item failure');
        const loader = vi.fn(async (_userId: string, challengeId: string) => {
            if (challengeId === BATCH_IDS[1]) throw rawFailure;
            return progressSuccess(challengeId);
        });

        const batch = await getFreshChallengeProgressBatch(
            USER_ID,
            BATCH_IDS.slice(0, 3),
            loader,
        );

        expect(batch.map((result) => result.challenge_id)).toEqual(BATCH_IDS.slice(0, 3));
        expect(batch[1]).toEqual({
            challenge_id: BATCH_IDS[1],
            status: 'unavailable',
            progress: null,
        });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:progress:batch-item',
            expect.objectContaining({
                code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
                context: { stage: 'unexpected' },
            }),
        );
        expect(mocks.reportError).not.toHaveBeenCalledWith(
            expect.anything(),
            rawFailure,
            expect.anything(),
        );
    });

    it('6件を最大4workerで処理し、無制限Promise.allを行わない', async () => {
        let activeCount = 0;
        let maximumActiveCount = 0;
        const releases: Array<() => void> = [];
        const loader = vi.fn(async (_userId: string, challengeId: string) => {
            activeCount += 1;
            maximumActiveCount = Math.max(maximumActiveCount, activeCount);
            await new Promise<void>((resolve) => {
                releases.push(() => {
                    activeCount -= 1;
                    resolve();
                });
            });
            return progressSuccess(challengeId);
        });

        const batchPromise = getFreshChallengeProgressBatch(USER_ID, BATCH_IDS, loader);
        await vi.waitFor(() => expect(releases).toHaveLength(4));
        releases.splice(0).forEach((release) => release());
        await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(BATCH_IDS.length));
        expect(releases).toHaveLength(2);
        releases.splice(0).forEach((release) => release());

        const batch = await batchPromise;
        expect(maximumActiveCount).toBe(4);
        expect(batch.map((result) => result.challenge_id)).toEqual(BATCH_IDS);
    });

    it.each([
        [[], 'empty'],
        [[BATCH_IDS[0], BATCH_IDS[0]], 'duplicate'],
        [['invalid'], 'invalid UUID'],
    ])('不正なbatch入力をDB処理前に拒否する: %s', async (challengeIds) => {
        const loader = vi.fn();

        await expect(
            getFreshChallengeProgressBatch(USER_ID, challengeIds, loader),
        ).rejects.toMatchObject({
            code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
            context: { stage: 'batch-input' },
        });
        expect(loader).not.toHaveBeenCalled();
    });
});
