import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
    getJSTDateString: vi.fn(),
    reportError: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock('@/lib/date-utils', () => ({ getJSTDateString: mocks.getJSTDateString }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import { GET } from './route';

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const CRON_SECRET = 'test-cron-secret';
const CHALLENGE_IDS = Array.from(
    { length: 20 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
);

interface QueryResult {
    data: { id: string }[] | null;
    error: unknown;
}

interface QueryCall {
    method: string;
    args: unknown[];
}

interface Query extends PromiseLike<QueryResult> {
    select(...args: unknown[]): Query;
    eq(...args: unknown[]): Query;
    is(...args: unknown[]): Query;
    lt(...args: unknown[]): Query;
    order(...args: unknown[]): Query;
    limit(...args: unknown[]): Query;
}

let queryResult: QueryResult;
let queryCalls: QueryCall[];

function createQuery(): Query {
    const chain: Query = {
        select: (...args) => record('select', args),
        eq: (...args) => record('eq', args),
        is: (...args) => record('is', args),
        lt: (...args) => record('lt', args),
        order: (...args) => record('order', args),
        limit: (...args) => record('limit', args),
        then: (resolve, reject) => Promise.resolve(queryResult).then(resolve, reject),
    };
    function record(method: string, args: unknown[]): Query {
        queryCalls.push({ method, args });
        return chain;
    }
    return chain;
}

function request(secret = CRON_SECRET): Request {
    return new Request('http://localhost/api/cron/group-challenge-settlement', {
        headers: { authorization: `Bearer ${secret}` },
    });
}

function rpcRow(status: string): Record<string, unknown> {
    const settled = status === 'settled' || status === 'already_settled';
    return {
        status,
        is_completed: settled ? true : null,
        total_steps: settled ? 10_000 : null,
        member_count: settled ? 3 : null,
        rewarded_count: settled ? 3 : null,
        settled_at: settled ? '2026-07-19T00:00:00Z' : null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    queryCalls = [];
    queryResult = { data: [], error: null };
    mocks.getJSTDateString.mockReturnValue('2026-07-19');
    mocks.from.mockReturnValue(createQuery());
    mocks.rpc.mockResolvedValue({ data: [rpcRow('settled')], error: null });
});

afterAll(() => {
    if (ORIGINAL_CRON_SECRET === undefined) {
        delete process.env.CRON_SECRET;
    } else {
        process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }
});

describe('GET /api/cron/group-challenge-settlement', () => {
    it.each([
        ['CRON_SECRET未設定', undefined, CRON_SECRET],
        ['Authorization不一致', CRON_SECRET, 'wrong-secret'],
    ])('%sの場合、DBアクセス前に401を返す', async (_caseName, configuredSecret, requestSecret) => {
        if (configuredSecret === undefined) {
            delete process.env.CRON_SECRET;
        } else {
            process.env.CRON_SECRET = configuredSecret;
        }

        const response = await GET(request(requestSecret));

        expect(response.status).toBe(401);
        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('候補が0件の場合、正直な成功集計を返す', async () => {
        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            success: true,
            candidates: 0,
            processed: 0,
            failed: 0,
        });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it.each([
        ['候補取得失敗', { data: null, error: { code: '42703', message: 'column missing' } }, '42703'],
        ['候補dataがnull', { data: null, error: null }, undefined],
    ])('%sの場合、空候補へ偽装せず500を返す', async (_caseName, result, errorCode) => {
        queryResult = result;

        const response = await GET(request());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ success: false, error: 'Internal Server Error' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'cron/group-challenge-settlement:candidates',
            expect.any(Error),
            { errorCode },
        );
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('終了済み未精算GROUP候補を必要列・安定順・20件上限で取得する', async () => {
        queryResult = { data: [{ id: CHALLENGE_IDS[0] }], error: null };

        await GET(request());

        expect(mocks.from).toHaveBeenCalledWith('challenges');
        expect(queryCalls).toEqual([
            { method: 'select', args: ['id'] },
            { method: 'eq', args: ['type', 'GROUP'] },
            { method: 'is', args: ['settled_at', null] },
            { method: 'lt', args: ['end_date', '2026-07-19'] },
            { method: 'order', args: ['end_date', { ascending: true }] },
            { method: 'order', args: ['id', { ascending: true }] },
            { method: 'limit', args: [20] },
        ]);
    });

    it('settledとalready_settledを成功として分類する', async () => {
        queryResult = {
            data: CHALLENGE_IDS.slice(0, 2).map((id) => ({ id })),
            error: null,
        };
        mocks.rpc
            .mockResolvedValueOnce({ data: [rpcRow('settled')], error: null })
            .mockResolvedValueOnce({ data: [rpcRow('already_settled')], error: null });

        const response = await GET(request());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            candidates: 2,
            processed: 2,
            failed: 0,
            outcomes: { settled: 1, alreadySettled: 1 },
        });
        expect(JSON.stringify(body)).not.toContain(CHALLENGE_IDS[0]);
    });

    it('RPC失敗を隔離して後続候補を処理し、IDをログや応答へ出さず500を返す', async () => {
        queryResult = {
            data: CHALLENGE_IDS.slice(0, 2).map((id) => ({ id })),
            error: null,
        };
        mocks.rpc
            .mockRejectedValueOnce(
                new Error(`credit failed for member ${CHALLENGE_IDS[0]}`),
            )
            .mockResolvedValueOnce({ data: [rpcRow('settled')], error: null });

        const response = await GET(request());
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toMatchObject({
            success: false,
            processed: 2,
            failed: 1,
            outcomes: { settled: 1, rpcError: 1 },
        });
        expect(mocks.rpc).toHaveBeenCalledTimes(2);
        expect(JSON.stringify([body, mocks.reportError.mock.calls])).not.toContain(CHALLENGE_IDS[0]);
    });

    it('unsafe integer shapeとunknown statusを別々に分類して失敗を返す', async () => {
        queryResult = {
            data: CHALLENGE_IDS.slice(0, 2).map((id) => ({ id })),
            error: null,
        };
        mocks.rpc
            .mockResolvedValueOnce({ data: [{ ...rpcRow('settled'), total_steps: Number.MAX_SAFE_INTEGER + 1 }], error: null })
            .mockResolvedValueOnce({ data: [rpcRow('future_status')], error: null });

        const response = await GET(request());

        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({
            failed: 2,
            outcomes: { invalidShape: 1, unknownStatus: 1 },
        });
    });

    it.each(['settled', 'already_settled', 'not_found', 'invalid_type', 'not_ended'])(
        '%sを既存RPC契約どおり分類する',
        async (status) => {
            queryResult = { data: [{ id: CHALLENGE_IDS[0] }], error: null };
            mocks.rpc.mockResolvedValue({ data: [rpcRow(status)], error: null });

            const response = await GET(request());
            const body = await response.json();
            const expectedKeys: Record<string, string> = {
                settled: 'settled',
                already_settled: 'alreadySettled',
                not_found: 'notFound',
                invalid_type: 'invalidType',
                not_ended: 'notEnded',
            };

            expect(body.outcomes[expectedKeys[status]]).toBe(1);
            expect(response.status).toBe(
                status === 'settled' || status === 'already_settled' ? 200 : 500,
            );
        },
    );

    it('20件を無制限並列化せず逐次処理する', async () => {
        queryResult = { data: CHALLENGE_IDS.map((id) => ({ id })), error: null };
        let active = 0;
        let maxActive = 0;
        mocks.rpc.mockImplementation(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await Promise.resolve();
            active--;
            return { data: [rpcRow('settled')], error: null };
        });

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(mocks.rpc).toHaveBeenCalledTimes(20);
        expect(maxActive).toBe(1);
    });
});
