import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseChallengeProgressBatchResponse } from '@/lib/challenge-progress';
import { AppError } from '@/lib/errors';
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
    getGroupProgressRecordStatuses,
    MAX_GROUP_PROGRESS_RECORD_ROWS,
    normalizeChallengeProgressFailure,
} from '@/lib/services/challenge-progress-service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CHALLENGE_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPATION_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_CHALLENGE_ID = '22222222-2222-4222-8222-222222222223';
const SECOND_GROUP_ID = '33333333-3333-4333-8333-333333333334';
const SECOND_PARTICIPATION_ID = '44444444-4444-4444-8444-444444444445';
const HEX_CHALLENGE_ID = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const BATCH_HEX_ID = 'abcdefab-cdef-4abc-8def-abcdefabcdea';
const BATCH_IDS = [
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000004',
    '50000000-0000-4000-8000-000000000005',
    '50000000-0000-4000-8000-000000000006',
] as const;

describe('normalizeChallengeProgressFailure', () => {
    it('同一codeのAppErrorも固定fieldだけの新しいErrorへ再構築する', () => {
        const rawError = new AppError(
            'sensitive progress failure',
            'CHALLENGE_PROGRESS_UNAVAILABLE',
            {
                stage: 'steps-query',
                userId: USER_ID,
                challengeId: CHALLENGE_ID,
            },
            { secret: 'sensitive cause' },
        );

        const normalized = normalizeChallengeProgressFailure(rawError);

        expect(normalized).not.toBe(rawError);
        expect(normalized).toMatchObject({
            message: 'Challenge progress request failed',
            code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
            context: { stage: 'steps-query' },
        });
        expect(Object.keys(normalized.context ?? {})).toEqual(['stage']);
        expect(normalized.cause).toBeUndefined();
    });
});

interface QueryResult {
    data?: unknown;
    error: unknown;
    count?: number | null;
}

interface Query extends PromiseLike<QueryResult> {
    eq(...args: unknown[]): Query;
    gte(...args: unknown[]): Query;
    in(...args: unknown[]): Query;
    limit(...args: unknown[]): Query;
    lte(...args: unknown[]): Query;
    maybeSingle(): Promise<QueryResult>;
    select(...args: unknown[]): Query;
    update(value: unknown): Query;
}

let results: Record<string, QueryResult[]>;
let updates: unknown[];
let fromCalls: string[];
let inCalls: unknown[][];
let limitCalls: unknown[][];

function query(result: QueryResult): Query {
    const chain: Query = {
        eq: () => chain,
        gte: () => chain,
        in: (...args) => {
            inCalls.push(args);
            return chain;
        },
        limit: (...args) => {
            limitCalls.push(args);
            return chain;
        },
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

function groupRecordRow(
    challengeId = CHALLENGE_ID,
    groupId = GROUP_ID,
    date = '2026-07-15',
): Record<string, unknown> {
    return {
        date,
        steps: 0,
        user: {
            challenge_participants: [{ challenge_id: challengeId }],
            group_members: [{ group_id: groupId }],
        },
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

function arrangeIndividualProgress(
    stepResult: QueryResult,
    challengeOverrides: Record<string, unknown> = {},
): void {
    results.challenges = [{
        data: challenge(challengeOverrides),
        error: null,
    }];
    results.challenge_participants = [
        { data: participation(), error: null },
        { error: null },
    ];
    results.daily_steps = [stepResult];
}

function arrangeZeroGroupBatch(stepResult: QueryResult): void {
    results.challenges = [
        {
            data: challenge({
                id: CHALLENGE_ID,
                type: 'GROUP',
                group_id: GROUP_ID,
            }),
            error: null,
        },
        {
            data: challenge({
                id: SECOND_CHALLENGE_ID,
                type: 'GROUP',
                group_id: SECOND_GROUP_ID,
            }),
            error: null,
        },
    ];
    results.challenge_participants = [
        { data: participation({ id: PARTICIPATION_ID }), error: null },
        { data: participation({ id: SECOND_PARTICIPATION_ID }), error: null },
        { error: null },
        { error: null },
    ];
    results.daily_steps = [stepResult];
    mocks.rpc.mockResolvedValue({
        data: [{
            status: 'ok',
            total_steps: 0,
            participant_count: 2,
            target_steps: 1000,
            is_completed: false,
        }],
        error: null,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    results = {};
    updates = [];
    fromCalls = [];
    inCalls = [];
    limitCalls = [];
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
        fromCalls.push(table);
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

    it('大文字UUIDをlowercaseへ正規化して単件進捗を取得する', async () => {
        arrangeIndividualProgress({
            data: [{ steps: 0 }],
            error: null,
            count: 1,
        }, { id: HEX_CHALLENGE_ID });

        const result = await getFreshChallengeProgress(
            USER_ID.toUpperCase(),
            HEX_CHALLENGE_ID.toUpperCase(),
        );

        expect(result).toMatchObject({
            challenge_id: HEX_CHALLENGE_ID,
            status: 'ok',
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
        expect(fromCalls).not.toContain('daily_steps');
    });

    it.each([
        {
            expectedRecordStatus: 'not_recorded',
            label: '歩数行なし',
            stepResult: { data: [], error: null, count: 0 },
        },
        {
            expectedRecordStatus: 'recorded',
            label: '記録済み0歩',
            stepResult: {
                data: [groupRecordRow()],
                error: null,
                count: 1,
            },
        },
    ] as const)(
        'GROUP合計0歩かつ$labelの場合、$expectedRecordStatusを返す',
        async ({ expectedRecordStatus, stepResult }) => {
            results.challenges = [{
                data: challenge({ type: 'GROUP', group_id: GROUP_ID }),
                error: null,
            }];
            results.challenge_participants = [
                { data: participation(), error: null },
                { error: null },
            ];
            results.daily_steps = [stepResult];
            mocks.rpc.mockResolvedValue({
                data: [{
                    status: 'ok',
                    total_steps: 0,
                    participant_count: 2,
                    target_steps: 1000,
                    is_completed: false,
                }],
                error: null,
            });

            const result = await getFreshChallengeProgress(USER_ID, CHALLENGE_ID);

            expect(result).toMatchObject({
                status: 'ok',
                progress: {
                    total_steps: 0,
                    record_status: expectedRecordStatus,
                },
            });
            expect(fromCalls.filter((table) => table === 'daily_steps')).toHaveLength(1);
            expect(limitCalls).toContainEqual([MAX_GROUP_PROGRESS_RECORD_ROWS]);
        },
    );
});

describe('getGroupProgressRecordStatuses', () => {
    const scopes = [
        {
            challengeId: CHALLENGE_ID,
            groupId: GROUP_ID,
            startDate: '2026-07-01',
            endDate: '2026-07-31',
        },
        {
            challengeId: SECOND_CHALLENGE_ID,
            groupId: SECOND_GROUP_ID,
            startDate: '2026-07-10',
            endDate: '2026-07-20',
        },
    ] as const;

    it('全scopeを1回のbounded queryで取得し、relationと期間が一致する行だけrecordedにする', async () => {
        results.daily_steps = [{
            data: [
                groupRecordRow(),
                groupRecordRow(
                    SECOND_CHALLENGE_ID,
                    SECOND_GROUP_ID,
                    '2026-07-09',
                ),
                groupRecordRow(
                    SECOND_CHALLENGE_ID,
                    GROUP_ID,
                    '2026-07-15',
                ),
            ],
            error: null,
            count: 3,
        }];

        const statuses = await getGroupProgressRecordStatuses(scopes);

        expect(Object.fromEntries(statuses)).toEqual({
            [CHALLENGE_ID]: 'recorded',
            [SECOND_CHALLENGE_ID]: 'not_recorded',
        });
        expect(fromCalls.filter((table) => table === 'daily_steps')).toHaveLength(1);
        expect(inCalls).toEqual([
            [
                'user.challenge_participants.challenge_id',
                [CHALLENGE_ID, SECOND_CHALLENGE_ID],
            ],
            [
                'user.group_members.group_id',
                [GROUP_ID, SECOND_GROUP_ID],
            ],
        ]);
        expect(limitCalls).toEqual([[MAX_GROUP_PROGRESS_RECORD_ROWS]]);
    });

    it.each([
        {
            expectedStage: 'group-record-query',
            label: 'DB error',
            result: { data: null, error: new Error('raw query failure'), count: null },
        },
        {
            expectedStage: 'group-record-result',
            label: 'over limit',
            result: {
                data: [],
                error: null,
                count: MAX_GROUP_PROGRESS_RECORD_ROWS + 1,
            },
        },
        {
            expectedStage: 'group-record-result',
            label: 'invalid relation shape',
            result: {
                data: [{ date: '2026-07-15', user: null }],
                error: null,
                count: 1,
            },
        },
        {
            expectedStage: 'group-record-result',
            label: 'negative steps',
            result: {
                data: [{ ...groupRecordRow(), steps: -1 }],
                error: null,
                count: 1,
            },
        },
    ])('$labelを成功状態へ変換しない', async ({ expectedStage, result }) => {
        results.daily_steps = [result];

        await expect(getGroupProgressRecordStatuses(scopes)).rejects.toMatchObject({
            code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
            context: { stage: expectedStage },
        });
    });
});

describe('getFreshChallengeProgressBatch', () => {
    it('大文字UUIDをcanonicalizeしてloaderと結果へlowercaseだけを渡す', async () => {
        const loader = vi.fn(async (_userId: string, challengeId: string) =>
            progressSuccess(challengeId));

        const batch = await getFreshChallengeProgressBatch(
            USER_ID.toUpperCase(),
            [BATCH_HEX_ID.toUpperCase()],
            loader,
        );

        expect(loader).toHaveBeenCalledWith(USER_ID, BATCH_HEX_ID);
        expect(batch[0].challenge_id).toBe(BATCH_HEX_ID);
    });

    it('大小文字だけが異なるUUID重複をloader前に拒否する', async () => {
        const loader = vi.fn();

        await expect(getFreshChallengeProgressBatch(
            USER_ID,
            [BATCH_HEX_ID, BATCH_HEX_ID.toUpperCase()],
            loader,
        )).rejects.toMatchObject({
            code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
            context: { stage: 'batch-input' },
        });
        expect(loader).not.toHaveBeenCalled();
    });

    it('response parserも大小文字を同じcanonical UUIDとして照合する', () => {
        const parsed = parseChallengeProgressBatchResponse(
            { results: [progressSuccess(BATCH_HEX_ID)] },
            [BATCH_HEX_ID.toUpperCase()],
        );
        expect(parsed?.results[0].challenge_id).toBe(BATCH_HEX_ID);
    });

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

    it('複数の0歩GROUPを1回の共有queryでrecordedとnot_recordedへ分けて永続化する', async () => {
        arrangeZeroGroupBatch({
            data: [groupRecordRow()],
            error: null,
            count: 1,
        });

        const batch = await getFreshChallengeProgressBatch(
            USER_ID,
            [CHALLENGE_ID, SECOND_CHALLENGE_ID],
        );

        expect(batch).toMatchObject([
            {
                challenge_id: CHALLENGE_ID,
                status: 'ok',
                progress: { total_steps: 0, record_status: 'recorded' },
            },
            {
                challenge_id: SECOND_CHALLENGE_ID,
                status: 'ok',
                progress: { total_steps: 0, record_status: 'not_recorded' },
            },
        ]);
        expect(fromCalls.filter((table) => table === 'daily_steps')).toHaveLength(1);
        expect(updates).toHaveLength(2);
    });

    it('共有record query障害時は0歩GROUPだけをunavailableにして永続化しない', async () => {
        arrangeZeroGroupBatch({
            data: null,
            error: new Error('raw group record query failure'),
            count: null,
        });

        const batch = await getFreshChallengeProgressBatch(
            USER_ID,
            [CHALLENGE_ID, SECOND_CHALLENGE_ID],
        );

        expect(batch).toEqual([
            {
                challenge_id: CHALLENGE_ID,
                status: 'unavailable',
                progress: null,
            },
            {
                challenge_id: SECOND_CHALLENGE_ID,
                status: 'unavailable',
                progress: null,
            },
        ]);
        expect(updates).toEqual([]);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:progress:batch-group-records',
            expect.objectContaining({
                code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
                context: { stage: 'group-record-query' },
            }),
        );
    });

    it.each([
        [[], 'empty'],
        [[BATCH_IDS[0], BATCH_IDS[0]], 'duplicate'],
        [[BATCH_HEX_ID, BATCH_HEX_ID.toUpperCase()], 'case-only duplicate'],
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
