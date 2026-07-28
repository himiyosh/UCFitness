import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import { AppError } from '@/lib/errors';

import { POST } from './route';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CHALLENGE_ID = '33333333-3333-4333-8333-333333333333';

interface QueryResult {
    data?: unknown;
    error: unknown;
}

const challenge = {
    id: CHALLENGE_ID,
    title: 'Group Quest',
    description: null,
    type: 'GROUP',
    target_steps: 10_000,
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    reward_uc: 500,
    is_active: true,
    created_by: USER_ID,
    group_id: GROUP_ID,
    created_at: '2026-07-01T00:00:00Z',
};

function request(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/challenge', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

function validChallenge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: ' Group Quest ',
        type: 'GROUP',
        group_id: GROUP_ID,
        target_steps: 10_000,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        ...overrides,
    };
}

function insertQuery(result: QueryResult): object {
    return {
        insert: vi.fn(() => ({
            select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(result),
            })),
        })),
    };
}

function expectFixedCreateReport(stage: string, rawError?: unknown): void {
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    const call = mocks.reportError.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe('challenge:create');
    expect(call[1]).toBeInstanceOf(AppError);
    expect(call[1]).not.toBe(rawError);

    const error = call[1];
    if (!(error instanceof AppError)) {
        throw new Error('Expected AppError');
    }
    expect(error.message).toBe('Challenge creation request failed');
    expect(error.code).toBe('CHALLENGE_CREATE_FAILED');
    expect(error.context).toEqual({ stage });
    expect(error.cause).toBeUndefined();
}

describe('POST /api/challenge', () => {
    let challengeResult: QueryResult;
    let participantResult: QueryResult;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        mocks.rpc.mockResolvedValue({
            data: [{ status: 'created', challenge }],
            error: null,
        });
        challengeResult = {
            data: { ...challenge, type: 'INDIVIDUAL', group_id: null },
            error: null,
        };
        participantResult = { error: null };
        mocks.from.mockImplementation((table: string) => {
            if (table === 'challenges') {
                return insertQuery(challengeResult);
            }
            if (table === 'challenge_participants') {
                return { insert: vi.fn().mockImplementation(async () => participantResult) };
            }
            throw new Error(`Unexpected table: ${table}`);
        });
    });

    it('未認証の場合、DBアクセス前に既存401レスポンスを返す', async () => {
        mocks.auth.mockResolvedValue({ user: null });

        const response = await POST(request(validChallenge()));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it.each([
        ['GROUPのgroup_idがない', validChallenge({ group_id: undefined })],
        ['GROUPのgroup_idがUUIDでない', validChallenge({ group_id: 'invalid' })],
        ['typeが未定義enum', validChallenge({ type: 'TEAM' })],
        ['target_stepsが小数', validChallenge({ target_steps: 1.5 })],
        ['target_stepsが文字列', validChallenge({ target_steps: '10000' })],
        ['target_stepsがPostgreSQL integer上限を超える', validChallenge({ target_steps: 2_147_483_648 })],
        ['start_dateが実在しない日付', validChallenge({ start_date: '2026-02-30' })],
        ['end_dateが開始日以前', validChallenge({ end_date: '2026-07-01' })],
        ['reward_ucが小数', validChallenge({ reward_uc: 10.5 })],
        ['INDIVIDUALにgroup_idが指定される', validChallenge({ type: 'INDIVIDUAL' })],
    ])('%sの場合、DBアクセス前に400を返す', async (_caseName, body) => {
        const response = await POST(request(body));

        expect(response.status).toBe(400);
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('GROUP作成成功時、正規化済み入力でRPCを1回だけ呼ぶ', async () => {
        const response = await POST(request(validChallenge({
            description: ' description ',
            reward_uc: 20_000,
        })));

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ challenge });
        expect(mocks.rpc).toHaveBeenCalledWith('create_group_challenge', {
            p_group_id: GROUP_ID,
            p_created_by: USER_ID,
            p_type: 'GROUP',
            p_title: 'Group Quest',
            p_description: 'description',
            p_target_steps: 10_000,
            p_start_date: '2026-07-01',
            p_end_date: '2026-07-31',
            p_reward_uc: 10_000,
        });
        expect(mocks.rpc).toHaveBeenCalledOnce();
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it.each([
        ['not_found', 404],
        ['forbidden', 403],
    ])('RPCが%sを返す場合、status %iを返す', async (status, expectedStatus) => {
        mocks.rpc.mockResolvedValue({ data: [{ status, challenge: null }], error: null });

        expect((await POST(request(validChallenge()))).status).toBe(expectedStatus);
    });

    it('RPC DB error時、migration未適用を成功に偽装せず500を返す', async () => {
        const rpcError = new Error('function create_group_challenge does not exist');
        mocks.rpc.mockResolvedValue({ data: null, error: rpcError });

        const response = await POST(request(validChallenge()));

        expect(response.status).toBe(500);
        expectFixedCreateReport('group-rpc', rpcError);
    });

    it.each([
        ['空結果', []],
        ['複数結果', [{ status: 'created', challenge }, { status: 'created', challenge }]],
        ['不正shape', [{ status: 'created', challenge: { id: CHALLENGE_ID } }]],
        ['未知status', [{ status: 'ok', challenge }]],
        ['検証済み入力のDB拒否', [{ status: 'invalid', challenge: null }]],
    ])('RPCの%sを500でfail-closedにする', async (_caseName, data) => {
        mocks.rpc.mockResolvedValue({ data, error: null });

        const response = await POST(request(validChallenge()));

        expect(response.status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledOnce();
    });

    it('INDIVIDUAL作成は既存insertとcreator参加flowを維持する', async () => {
        const response = await POST(request(validChallenge({
            type: 'INDIVIDUAL',
            group_id: null,
        })));

        expect(response.status).toBe(201);
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.from).toHaveBeenCalledTimes(2);
        expect(mocks.from).toHaveBeenNthCalledWith(1, 'challenges');
        expect(mocks.from).toHaveBeenNthCalledWith(2, 'challenge_participants');
    });

    it('INDIVIDUALのcreator参加登録失敗を成功に偽装しない', async () => {
        participantResult = { error: new Error('participant insert failed') };

        const response = await POST(request(validChallenge({
            type: 'INDIVIDUAL',
            group_id: null,
        })));

        expect(response.status).toBe(500);
        expectFixedCreateReport('participant-insert', participantResult.error);
    });
});
