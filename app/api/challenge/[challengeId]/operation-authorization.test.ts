import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CHALLENGE_END_DATE_IN_PAST_CODE,
    CHALLENGE_NOT_EDITABLE_CODE,
} from '@/lib/services/challenge-utils';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), from: vi.fn(), getJSTDateString: vi.fn(), reportError: vi.fn(), rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/date-utils', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/date-utils')>(),
    getJSTDateString: mocks.getJSTDateString,
}));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
import { PUT } from './route';
import { POST } from './join/route';
import { DELETE } from './leave/route';
import { GET } from './progress/route';
const CID = '11111111-1111-4111-8111-111111111111', GID = '22222222-2222-4222-8222-222222222222';
const UID = '33333333-3333-4333-8333-333333333333';
const PID = '44444444-4444-4444-8444-444444444444';
const context = { params: Promise.resolve({ challengeId: CID }) };
interface Result { data?: unknown; error: unknown; count?: number | null }
interface Query extends PromiseLike<Result> {
    select(...args: unknown[]): Query; eq(...args: unknown[]): Query; in(...args: unknown[]): Query; gte(...args: unknown[]): Query;
    lte(...args: unknown[]): Query; insert(value: unknown): Query; update(value: unknown): Query; delete(): Query;
    maybeSingle(): Promise<Result>; single(): Promise<Result>;
}
let results: Record<string, Result[]>, inCalls: unknown[][], updates: unknown[];
let updateEndDateFilters: unknown[][];
function query(result: Result): Query {
    let isUpdateQuery = false;
    const chain: Query = {
        select: () => chain,
        eq: () => chain,
        gte: (...args) => {
            if (isUpdateQuery) updateEndDateFilters.push(args);
            return chain;
        },
        lte: () => chain,
        in: (...args) => { inCalls.push(args); return chain; }, insert: () => chain, delete: () => chain,
        update: (value) => {
            isUpdateQuery = true;
            updates.push(value);
            return chain;
        },
        maybeSingle: () => Promise.resolve(result), single: () => Promise.resolve(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
}
function challenge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: CID, type: 'GROUP', group_id: GID, created_by: UID, is_active: true, target_steps: 1000,
        start_date: '2026-07-01', end_date: '2026-07-31', reward_uc: 500, ...overrides };
}
function request(method = 'GET', body: unknown = { title: 'Updated' }): NextRequest {
    return new NextRequest(`http://localhost/api/challenge/${CID}`,
        { method, body: method === 'GET' ? undefined : JSON.stringify(body) });
}
function authorize(isPublic: boolean, member: unknown): void {
    results.groups = [{ data: { id: GID, is_public: isPublic }, error: null }];
    results.group_members = [{ data: member, error: null }];
}
beforeEach(() => {
    vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: UID } });
    mocks.getJSTDateString.mockReturnValue('2026-07-15');
    results = {}; inCalls = []; updates = []; updateEndDateFilters = [];
    mocks.rpc.mockResolvedValue({
        data: [{
            status: 'ok', total_steps: 1000, participant_count: 2,
            target_steps: 1000, is_completed: true,
        }],
        error: null,
    });
    mocks.from.mockImplementation((table: string) => {
        const result = results[table]?.shift();
        if (!result) throw new Error(`Unexpected query: ${table}`);
        return query(result);
    });
});
describe('GROUP challenge操作認可', () => {
    const operations = [
        ['join', (ctx = context) => POST(request('POST'), ctx)], ['progress', (ctx = context) => GET(request(), ctx)],
        ['leave', (ctx = context) => DELETE(request('DELETE'), ctx)],
    ] as const;
    const allOperations = [...operations, ['update', (ctx = context) => PUT(request('PUT'), ctx)] as const];
    it.each(allOperations)('%sは不正UUIDをDB前に400で拒否する', async (_name, invoke) => {
        const response = await invoke({ params: Promise.resolve({ challengeId: 'invalid' }) });
        expect(response.status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each(operations.flatMap(([name, invoke]) => [
        [`${name}:private`, invoke, false, 404], [`${name}:public`, invoke, true, 403],
    ] as const))('%s非member操作を拒否する', async (_name, invoke, isPublic, status) => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(isPublic, null);
        expect((await invoke()).status).toBe(status);
    });
    it.each([
        ['join', () => POST(request('POST'), context), [{ data: undefined, error: new Error('read') }]],
        ['progress', () => GET(request(), context), [{ data: undefined, error: new Error('read') }]],
        ['leave', () => DELETE(request('DELETE'), context), [{ data: undefined, error: new Error('read') }]],
    ])('%s participation DB障害を500にする', async (_name, invoke, participantResults) => {
        results.challenges = [{ data: challenge({ created_by: 'other' }), error: null }];
        authorize(false, { user_id: UID, role: 'MEMBER' }); results.challenge_participants = participantResults;
        expect((await invoke()).status).toBe(500); expect(mocks.reportError).toHaveBeenCalled();
    });
    it.each([['join', POST, undefined], ['leave', DELETE, { id: 'p1' }]] as const)(
        '%sは現memberだけ操作できる', async (_name, route, participation) => {
            results.challenges = [{ data: challenge({ created_by: 'other' }), error: null }];
            authorize(false, { user_id: UID });
            results.challenge_participants = [{ data: participation, error: null }, { error: null }];
            expect((await route(request(_name === 'join' ? 'POST' : 'DELETE'), context)).status).toBe(200);
        },
    );
    it('joinは開始前のprivate非memberを開始日判定より先に404で拒否する', async () => {
        results.challenges = [{
            data: challenge({ start_date: '2026-07-20', end_date: '2026-07-31' }),
            error: null,
        }];
        authorize(false, null);

        const response = await POST(request('POST'), context);

        expect(response.status).toBe(404);
        expect(mocks.from).not.toHaveBeenCalledWith('challenge_participants');
    });
    it('joinは認可後に開始前を拒否しparticipant照会・登録へ進まない', async () => {
        results.challenges = [{
            data: challenge({
                created_by: 'other',
                start_date: '2026-07-20',
                end_date: '2026-07-31',
            }),
            error: null,
        }];
        authorize(false, { user_id: UID, role: 'MEMBER' });

        const response = await POST(request('POST'), context);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Challenge has not started' });
        expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
            'challenges',
            'groups',
            'group_members',
        ]);
    });
    it('joinはJST開始日と当日が等しい場合に参加を許可する', async () => {
        mocks.getJSTDateString.mockReturnValue('2026-07-20');
        results.challenges = [{
            data: challenge({
                created_by: 'other',
                start_date: '2026-07-20',
                end_date: '2026-07-31',
            }),
            error: null,
        }];
        authorize(false, { user_id: UID, role: 'MEMBER' });
        results.challenge_participants = [
            { data: null, error: null },
            { error: null },
        ];

        expect((await POST(request('POST'), context)).status).toBe(200);
        expect(mocks.from).toHaveBeenCalledWith('challenge_participants');
    });
    it.each([
        ['inactive', { is_active: false }, 'Challenge is no longer active'],
        ['expired', { end_date: '2026-07-14' }, 'Challenge has ended'],
    ])('joinは%sチャレンジの既存拒否を維持する', async (_name, overrides, error) => {
        results.challenges = [{
            data: challenge({ created_by: 'other', ...overrides }),
            error: null,
        }];
        authorize(false, { user_id: UID, role: 'MEMBER' });

        const response = await POST(request('POST'), context);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error });
        expect(mocks.from).not.toHaveBeenCalledWith('challenge_participants');
    });
    it('leaveはcreator離脱禁止を維持する', async () => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        expect((await DELETE(request('DELETE'), context)).status).toBe(400);
    });
    it.each([
        [{ type: 'TEAM' }], [{ target_steps: 1.5 }], [{ start_date: '2026-02-30' }],
        [{ reward_uc: '500' }], [{ is_active: 1 }],
    ])('PUTは不正なenum/number/date/booleanをDB前に400で拒否する', async (body) => {
        expect((await PUT(request('PUT', body), context)).status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
    });
    it('PUTは不正JSONをDB前に400で拒否する', async () => {
        const response = await PUT(new NextRequest(`http://localhost/api/challenge/${CID}`, { method: 'PUT', body: '{' }), context);
        expect(response.status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each([
        [false, null, UID, 404, 'Challenge not found'],
        [true, null, UID, 403, 'Forbidden'],
        [true, { role: 'ADMIN' }, 'other', 403, 'Only the creator can edit this challenge'],
    ])(
        'PUTは終了済みでも公開=%s role=%o creator=%sの認可結果を先に返す',
        async (isPublic, member, creator, status, expectedError) => {
            results.challenges = [{
                data: challenge({ created_by: creator, end_date: '2026-07-14' }),
                error: null,
            }];
            authorize(isPublic, member);

            const response = await PUT(request('PUT'), context);

            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ error: expectedError });
            expect(mocks.getJSTDateString).not.toHaveBeenCalled();
            expect(updates).toEqual([]);
        },
    );
    it.each([
        [false, null, UID, 404, 'Challenge not found'],
        [true, null, UID, 403, 'Forbidden'],
        [true, { role: 'ADMIN' }, 'other', 403, 'Only the creator can edit this challenge'],
    ])(
        'PUTは過去の要求期限でも公開=%s role=%o creator=%sの認可結果を先に返す',
        async (isPublic, member, creator, status, expectedError) => {
            results.challenges = [{
                data: challenge({ created_by: creator }),
                error: null,
            }];
            authorize(isPublic, member);

            const response = await PUT(
                request('PUT', { end_date: '2026-07-14' }),
                context,
            );

            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ error: expectedError });
            expect(mocks.getJSTDateString).not.toHaveBeenCalled();
            expect(updates).toEqual([]);
        },
    );
    it('PUTはcreatorかつOWNERの有効な更新を1回だけ実行する', async () => {
        const updatedChallenge = challenge({ title: 'Updated' });
        results.challenges = [
            { data: challenge(), error: null },
            { data: updatedChallenge, error: null },
        ];
        authorize(false, { role: 'OWNER' });

        const response = await PUT(request('PUT'), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ challenge: updatedChallenge });
        expect(updates).toEqual([{ title: 'Updated' }]);
        expect(updateEndDateFilters).toEqual([['end_date', '2026-07-15']]);
    });
    it('PUTはINDIVIDUAL creatorのJST終了日当日を編集可能に保つ', async () => {
        mocks.getJSTDateString.mockReturnValue('2026-07-31');
        const existingChallenge = challenge({
            type: 'INDIVIDUAL',
            group_id: null,
            end_date: '2026-07-31',
        });
        const updatedChallenge = { ...existingChallenge, title: 'Updated' };
        results.challenges = [
            { data: existingChallenge, error: null },
            { data: updatedChallenge, error: null },
        ];

        const response = await PUT(request('PUT'), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ challenge: updatedChallenge });
        expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
            'challenges',
            'challenges',
        ]);
        expect(updateEndDateFilters).toEqual([['end_date', '2026-07-31']]);
    });
    it('PUTは認可済みcreatorが要求したJST前日を安定した400 codeで拒否する', async () => {
        results.challenges = [{
            data: challenge(),
            error: null,
        }];
        authorize(false, { role: 'OWNER' });

        const response = await PUT(
            request('PUT', { end_date: '2026-07-14' }),
            context,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            error: 'Challenge end date cannot be before today',
            code: CHALLENGE_END_DATE_IN_PAST_CODE,
        });
        expect(mocks.getJSTDateString).toHaveBeenCalledOnce();
        expect(updates).toEqual([]);
    });
    it('PUTは認可済みcreatorが要求したJST当日を更新可能に保つ', async () => {
        const updatedChallenge = challenge({ end_date: '2026-07-15' });
        results.challenges = [
            { data: challenge(), error: null },
            { data: updatedChallenge, error: null },
        ];
        authorize(false, { role: 'OWNER' });

        const response = await PUT(
            request('PUT', { end_date: '2026-07-15' }),
            context,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ challenge: updatedChallenge });
        expect(updates).toEqual([{ end_date: '2026-07-15' }]);
        expect(updateEndDateFilters).toEqual([['end_date', '2026-07-15']]);
    });
    it('PUTは認可済みcreatorの終了済みチャレンジを409で拒否する', async () => {
        results.challenges = [{
            data: challenge({ end_date: '2026-07-14' }),
            error: null,
        }];
        authorize(false, { role: 'OWNER' });

        const response = await PUT(request('PUT'), context);

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            error: 'Challenge is no longer editable',
            code: CHALLENGE_NOT_EDITABLE_CODE,
        });
        expect(updates).toEqual([]);
    });
    it('PUTは終了済みチャレンジへ将来の終了日を送っても復活させない', async () => {
        results.challenges = [{
            data: challenge({ end_date: '2026-07-14' }),
            error: null,
        }];
        authorize(false, { role: 'OWNER' });

        const response = await PUT(
            request('PUT', { title: 'Revive', end_date: '2026-08-31' }),
            context,
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
            code: CHALLENGE_NOT_EDITABLE_CODE,
        });
        expect(updates).toEqual([]);
    });
    it('PUTは事前読取後に更新対象が消えた場合も409で拒否する', async () => {
        results.challenges = [
            { data: challenge(), error: null },
            { data: null, error: null },
        ];
        authorize(false, { role: 'OWNER' });

        const response = await PUT(request('PUT'), context);

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            error: 'Challenge is no longer editable',
            code: CHALLENGE_NOT_EDITABLE_CODE,
        });
        expect(updates).toEqual([{ title: 'Updated' }]);
        expect(updateEndDateFilters).toEqual([['end_date', '2026-07-15']]);
    });
    it('PUTは更新DB障害を500として報告する', async () => {
        const updateError = new Error('update failed');
        results.challenges = [
            { data: challenge(), error: null },
            { data: null, error: updateError },
        ];
        authorize(false, { role: 'OWNER' });

        const response = await PUT(request('PUT'), context);

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to update challenge' });
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:update',
            updateError,
            { userId: UID, challengeId: CID },
        );
        expect(updateEndDateFilters).toEqual([['end_date', '2026-07-15']]);
    });
    it('progressはGROUP集計RPCを1回だけ呼び、アプリ側配列やin filterを使わない', async () => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        results.challenge_participants = [
            { data: { id: PID, is_completed: false, completed_at: null }, error: null },
            { error: null },
        ];
        const response = await GET(request(), context);
        expect(response.status).toBe(200);
        expect((await response.json()).progress).toMatchObject({
            total_steps: 1000,
            target_steps: 1000,
            progress_percent: 100,
            is_completed: true,
            completed_at: expect.any(String),
            reward_uc: 500,
            type: 'GROUP',
            record_status: 'recorded',
            schedule_status: 'active',
        });
        expect(mocks.rpc).toHaveBeenCalledWith('get_group_challenge_progress', {
            p_challenge_id: CID, p_viewer_id: UID,
        });
        expect(mocks.rpc).toHaveBeenCalledOnce(); expect(inCalls).toEqual([]);
        expect(updates[0]).toMatchObject({ progress_steps: 1000, is_completed: true });
    });

    it('1000件超相当のRPC集計値を切り捨てず返す', async () => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        results.challenge_participants = [
            { data: { id: PID, is_completed: false, completed_at: null }, error: null },
            { error: null },
        ];
        mocks.rpc.mockResolvedValue({
            data: [{
                status: 'ok', total_steps: 4_500_000, participant_count: 1501,
                target_steps: 1000, is_completed: true,
            }],
            error: null,
        });
        const response = await GET(request(), context);
        expect(response.status).toBe(200);
        expect((await response.json()).progress.total_steps).toBe(4_500_000);
        expect(inCalls).toEqual([]);
    });

    it.each([
        ['null', null],
        ['empty', []],
        ['multiple', [
            { status: 'ok', total_steps: 1, participant_count: 1, target_steps: 1000, is_completed: false },
            { status: 'ok', total_steps: 1, participant_count: 1, target_steps: 1000, is_completed: false },
        ]],
        ['non-number', [{ status: 'ok', total_steps: '1000', participant_count: 1, target_steps: 1000, is_completed: true }]],
        ['NaN', [{ status: 'ok', total_steps: Number.NaN, participant_count: 1, target_steps: 1000, is_completed: false }]],
        ['negative', [{ status: 'ok', total_steps: -1, participant_count: 1, target_steps: 1000, is_completed: false }]],
        ['unsafe', [{ status: 'ok', total_steps: Number.MAX_SAFE_INTEGER + 1, participant_count: 1, target_steps: 1000, is_completed: true }]],
        ['zero participants', [{ status: 'ok', total_steps: 0, participant_count: 0, target_steps: 1000, is_completed: false }]],
        ['target mismatch', [{ status: 'ok', total_steps: 1000, participant_count: 1, target_steps: 2000, is_completed: false }]],
        ['inconsistent completion', [{ status: 'ok', total_steps: 1000, participant_count: 1, target_steps: 1000, is_completed: false }]],
    ])('progressはRPCのinvalid shape (%s)を500にする', async (_name, data) => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        results.challenge_participants = [{
            data: { id: PID, is_completed: false, completed_at: null },
            error: null,
        }];
        mocks.rpc.mockResolvedValue({ data, error: null });
        expect((await GET(request(), context)).status).toBe(500);
    });

    it('progressはRPC DB errorを成功へ偽装しない', async () => {
        const rpcError = new Error('function get_group_challenge_progress does not exist');
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        results.challenge_participants = [{
            data: { id: PID, is_completed: false, completed_at: null },
            error: null,
        }];
        mocks.rpc.mockResolvedValue({ data: null, error: rpcError });
        expect((await GET(request(), context)).status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalledWith(
            'challenge:progress',
            expect.objectContaining({
                code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
                context: { stage: 'group-rpc' },
            }),
        );
        expect(mocks.reportError).not.toHaveBeenCalledWith(
            expect.anything(),
            rpcError,
            expect.anything(),
        );
    });

    it.each([['not_found', 404], ['forbidden', 403], ['not_participating', 403]])(
        'progressはRPC再認可の%sを%iへ写像する',
        async (status, expectedStatus) => {
            results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
            results.challenge_participants = [{
                data: { id: PID, is_completed: false, completed_at: null },
                error: null,
            }];
            mocks.rpc.mockResolvedValue({
                data: [{
                    status, total_steps: null, participant_count: null,
                    target_steps: null, is_completed: null,
                }],
                error: null,
            });
            expect((await GET(request(), context)).status).toBe(expectedStatus);
        },
    );

    it('INDIVIDUAL progressは既存の個人歩数集計を維持する', async () => {
        results.challenges = [{ data: challenge({ type: 'INDIVIDUAL', group_id: null }), error: null }];
        results.challenge_participants = [
            { data: { id: PID, is_completed: false, completed_at: null }, error: null },
            { error: null },
        ];
        results.daily_steps = [{ data: [{ steps: 800 }, { steps: 200 }, { steps: 0 }], error: null, count: 3 }];
        const response = await GET(request(), context);
        expect(response.status).toBe(200);
        expect((await response.json()).progress.total_steps).toBe(1000);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('progress更新DB障害を成功へ偽装しない', async () => {
        results.challenges = [{ data: challenge(), error: null }]; authorize(false, { user_id: UID });
        results.challenge_participants = [
            { data: { id: PID, is_completed: false, completed_at: null }, error: null },
            { error: new Error('update') },
        ];
        expect((await GET(request(), context)).status).toBe(500);
        expect(mocks.reportError).toHaveBeenCalled();
    });
    it.each(allOperations)('%s challenge DB障害を404に偽装しない', async (_name, invoke) => {
        results.challenges = [{ error: new Error('database unavailable') }];
        expect((await invoke()).status).toBe(500); expect(mocks.reportError).toHaveBeenCalled();
    });
    it.each([['group', true], ['membership', false]])('%s DB障害を500にする', async (_name, failGroup) => {
        results.challenges = [{ data: challenge(), error: null }];
        results.groups = [{ data: { is_public: true }, error: failGroup ? new Error('group') : null }];
        results.group_members = [{ data: null, error: failGroup ? null : new Error('membership') }];
        expect((await POST(request('POST'), context)).status).toBe(500); expect(mocks.reportError).toHaveBeenCalled();
    });
    it.each([['group', true], ['membership', false]])(
        'progressは%s認可DB障害を生エラーやIDなしの固定AppErrorへ変換する',
        async (_name, failGroup) => {
            const rawError = new Error('sensitive authorization failure');
            results.challenges = [{ data: challenge(), error: null }];
            results.groups = [{
                data: { is_public: true },
                error: failGroup ? rawError : null,
            }];
            results.group_members = [{
                data: null,
                error: failGroup ? null : rawError,
            }];

            const response = await GET(request(), context);

            expect(response.status).toBe(500);
            expect(mocks.reportError).toHaveBeenCalledOnce();
            expect(mocks.reportError).toHaveBeenCalledWith(
                'challenge:progress',
                expect.objectContaining({
                    code: 'CHALLENGE_PROGRESS_UNAVAILABLE',
                    context: { stage: 'authorization' },
                }),
            );
            expect(mocks.reportError).not.toHaveBeenCalledWith(
                expect.anything(),
                rawError,
                expect.anything(),
            );
        },
    );
});
