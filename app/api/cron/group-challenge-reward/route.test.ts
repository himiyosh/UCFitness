import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    from: vi.fn(), reportError: vi.fn(), rpc: vi.fn(), sendPush: vi.fn(),
}));
vi.mock('@/lib/api/web-push', () => ({ sendWebPushNotifications: mocks.sendPush }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
import { GET } from './route';
const ORIGINAL_SECRET = process.env.CRON_SECRET;
const SECRET = 'cron-secret';
const USER_IDS = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const LEASE_ID = '10000000-0000-4000-8000-000000000001';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/private-endpoint';
interface Result { data: unknown; error: unknown }
let claimResult: Result, completeResults: Result[], releaseResults: Result[];
let tableResults: Record<string, Result>, queryCalls: { table: string; columns: string; key: string; ids: string[] }[];
function claim(userIndex = 0, count = 1, reward = 50): Record<string, unknown> {
    return {
        user_id: USER_IDS[userIndex], challenge_count: count, total_reward: reward, lease_id: LEASE_ID,
        lease_expires_at: '2999-07-20T00:05:00Z',
    };
}
function subscription(userIndex = 0): Record<string, unknown> {
    return {
        id: `sub-${userIndex}`, user_id: USER_IDS[userIndex], endpoint: `${ENDPOINT}-${userIndex}`,
        p256dh: 'p256dh', auth: 'auth', user_agent: 'Browser',
        created_at: '2026-07-19T00:00:00Z',
    };
}
function request(secret = SECRET): Request {
    return new Request('http://localhost/api/cron/group-challenge-reward', { headers: { authorization: 'Bearer ' + secret } });
}
function mutation(countKey: 'delivered_count' | 'released_count', count = 1, reward = 50): Result {
    return { data: [{ [countKey]: count, total_reward: reward }], error: null };
}
function setClaims(rows: Record<string, unknown>[]): void {
    claimResult = { data: rows, error: null };
    tableResults.users = {
        data: rows.map((row) => ({ id: row.user_id, language: 'ja' })), error: null,
    };
    tableResults.push_subscriptions = {
        data: rows.map((_, index) => subscription(index)), error: null,
    };
    completeResults = rows.map((row) =>
        mutation('delivered_count', Number(row.challenge_count), Number(row.total_reward)));
    releaseResults = rows.map((row) =>
        mutation('released_count', Number(row.challenge_count), Number(row.total_reward)));
}
beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    queryCalls = [];
    tableResults = {};
    setClaims([claim()]);
    mocks.sendPush.mockResolvedValue({
        sent: 1, failed: 0, expired: 0, skippedDuplicates: 0,
    });
    mocks.rpc.mockImplementation((name: string): Promise<Result | undefined> => {
        if (name === 'claim_group_challenge_reward_outbox') return Promise.resolve(claimResult);
        if (name === 'complete_group_challenge_reward_outbox') return Promise.resolve(completeResults.shift());
        return Promise.resolve(releaseResults.shift());
    });
    mocks.from.mockImplementation((table: string) => ({
        select: (columns: string) => ({
            in: (key: string, ids: string[]) => {
                queryCalls.push({ table, columns, key, ids });
                return Promise.resolve(tableResults[table]);
            },
        }),
    }));
});
afterAll(() => { if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = ORIGINAL_SECRET; });
describe('GET /api/cron/group-challenge-reward', () => {
    it.each([
        ['CRON_SECRET未設定', undefined, SECRET],
        ['Authorization不一致', SECRET, 'wrong'],
    ])('%sの場合、DB前に401を返す', async (_name, configured, supplied) => {
        if (configured === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = configured;
        expect((await GET(request(supplied))).status).toBe(401);
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it('claimが空の場合、DB lookupなしで匿名成功集計を返す', async () => {
        claimResult = { data: [], error: null };
        const response = await GET(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true, claimedUsers: 0, deliveredUsers: 0,
            failedUsers: 0, releasedUsers: 0, releaseFailures: 0,
        });
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each([
        ['DB error', { data: [], error: { message: USER_IDS[0] } }],
        ['null', { data: null, error: null }],
        ['non-array', { data: {}, error: null }],
        ['invalid shape', { data: [{}], error: null }],
        ['21 users', { data: Array.from({ length: 21 }, (_, index) => claim(0, index + 1)), error: null }],
        ['unsafe bigint', { data: [{ ...claim(), total_reward: Number.MAX_SAFE_INTEGER + 1 }], error: null }],
        ['zero reward', { data: [{ ...claim(), total_reward: 0 }], error: null }],
        ['invalid UUID', { data: [{ ...claim(), user_id: 'not-a-uuid' }], error: null }],
        ['duplicate user', { data: [claim(), claim()], error: null }],
    ])('claimが%sの場合、generic 500で停止する', async (_name, result) => {
        claimResult = result;
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ success: false, error: 'Internal Server Error' });
        expect(mocks.from).not.toHaveBeenCalled();
        expect(JSON.stringify(mocks.reportError.mock.calls)).not.toContain(USER_IDS[0]);
    });
    it.each([
        ['ja', 1, 50, 'グループチャレンジ報酬'],
        ['en', 3, 150, 'Group challenge reward'],
    ])('%sの集約payloadをtag付きで送り、成功後だけcompleteする', async (locale, count, reward, title) => {
        setClaims([claim(0, count, reward)]);
        tableResults.users = { data: [{ id: USER_IDS[0], language: locale }], error: null };
        const response = await GET(request());
        expect(response.status).toBe(200);
        expect(mocks.sendPush).toHaveBeenCalledWith(USER_IDS[0],
            [expect.objectContaining({ endpoint: `${ENDPOINT}-0` })],
            expect.objectContaining({ title, locale, tag: 'group-challenge-reward',
                body: expect.stringContaining(String(reward)) }), expect.any(AbortSignal));
        expect(mocks.rpc).toHaveBeenCalledWith('complete_group_challenge_reward_outbox',
            { p_user_id: USER_IDS[0], p_lease_id: LEASE_ID },
        );
        expect(await response.json()).toMatchObject({ deliveredUsers: 1, failedUsers: 0 });
    });
    it('localeと購読を全claimed userについて必要列で各1回取得する', async () => {
        setClaims([claim(0), claim(1)]);
        await GET(request());
        expect(queryCalls).toEqual([
            { table: 'users', columns: 'id, language', key: 'id', ids: USER_IDS },
            { table: 'push_subscriptions', columns: 'id, user_id, endpoint, p256dh, auth, user_agent, created_at',
                key: 'user_id', ids: USER_IDS },
        ]);
    });
    it.each([
        ['query error', { data: null, error: { message: USER_IDS[0] } }],
        ['null', { data: null, error: null }],
        ['missing', { data: [], error: null }],
        ['duplicate', { data: [{ id: USER_IDS[0], language: 'ja' }, { id: USER_IDS[0], language: 'en' }], error: null }],
        ['invalid locale', { data: [{ id: USER_IDS[0], language: 'fr' }], error: null }],
    ])('languageが%sの場合、既定言語へ偽装せずreleaseする', async (_name, result) => {
        tableResults.users = result;
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(mocks.sendPush).not.toHaveBeenCalled();
        expect(mocks.rpc).toHaveBeenCalledWith('release_group_challenge_reward_outbox',
            { p_user_id: USER_IDS[0], p_lease_id: LEASE_ID },
        );
        expect(await response.json()).toMatchObject({ failedUsers: 1, releasedUsers: 1 });
    });
    it.each([
        ['query error', { data: null, error: { message: ENDPOINT } }],
        ['missing', { data: [], error: null }],
    ])('購読が%sの場合、Pushせずreleaseする', async (_name, result) => {
        tableResults.push_subscriptions = result;
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(mocks.sendPush).not.toHaveBeenCalled();
        expect(await response.json()).toMatchObject({ failedUsers: 1, releasedUsers: 1 });
    });
    it.each([
        ['成功と恒久失効だけ', { sent: 1, failed: 1, expired: 1, skippedDuplicates: 0 }, 200, 'complete_group_challenge_reward_outbox'],
        ['成功と一時失敗', { sent: 1, failed: 1, expired: 0, skippedDuplicates: 0 }, 500, 'release_group_challenge_reward_outbox'],
        ['全endpoint恒久失効', { sent: 0, failed: 1, expired: 1, skippedDuplicates: 0 }, 500, 'release_group_challenge_reward_outbox'],
    ])('Pushが%sの場合、%iを返して%sする', async (_name, delivery, status, rpcName) => {
        mocks.sendPush.mockResolvedValue(delivery);
        const response = await GET(request());
        expect(response.status).toBe(status);
        expect(mocks.rpc).toHaveBeenCalledWith(rpcName, { p_user_id: USER_IDS[0], p_lease_id: LEASE_ID });
        expect(mocks.rpc).not.toHaveBeenCalledWith(status === 200 ? 'release_group_challenge_reward_outbox' : 'complete_group_challenge_reward_outbox', expect.anything());
        expect(await response.json()).toMatchObject(status === 200 ? { deliveredUsers: 1, failedUsers: 0 } : { deliveredUsers: 0, failedUsers: 1, releasedUsers: 1 });
    });
    it('lease残存時間が不足する場合、Pushせずreleaseする', async () => {
        setClaims([{ ...claim(), lease_expires_at: new Date(Date.now() + 1000).toISOString() }]);
        const response = await GET(request());
        expect(mocks.sendPush).not.toHaveBeenCalled();
        expect(await response.json()).toMatchObject({ failedUsers: 1, releasedUsers: 1 });
    });
    it.each([
        ['error', { data: null, error: { message: USER_IDS[0] } }],
        ['null', { data: null, error: null }],
        ['non-array', { data: {}, error: null }],
        ['invalid', { data: [{}], error: null }],
        ['row count', { data: [mutation('delivered_count').data, mutation('delivered_count').data], error: null }],
        ['metrics mismatch', mutation('delivered_count', 2, 50)],
    ])('completeが%sの場合、fail-closedでreleaseする', async (_name, result) => {
        completeResults = [result];
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ failedUsers: 1, releasedUsers: 1 });
    });
    it.each([
        ['error', { data: null, error: { message: USER_IDS[0] } }],
        ['null', { data: null, error: null }],
        ['non-array', { data: {}, error: null }],
        ['invalid', { data: [{}], error: null }],
        ['row count', { data: [{ released_count: 1, total_reward: 50 }, { released_count: 1, total_reward: 50 }], error: null }],
        ['metrics mismatch', mutation('released_count', 2, 50)],
    ])('releaseが%sの場合、失敗を隠さずreleaseFailuresへ数える', async (_name, result) => {
        mocks.sendPush.mockResolvedValue({ sent: 0, failed: 1, expired: 0, skippedDuplicates: 0 });
        releaseResults = [result];
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ failedUsers: 1, releasedUsers: 0, releaseFailures: 1 });
    });
    it('1user失敗後も後続を逐次処理し、最終5xxと非PII集計を返す', async () => {
        setClaims([claim(0), claim(1)]);
        tableResults.users = { data: [
            { id: USER_IDS[0], language: 'ja' }, { id: USER_IDS[1], language: 'en' },
        ], error: null };
        let active = 0, maxActive = 0, invocation = 0;
        mocks.sendPush.mockImplementation(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await Promise.resolve();
            active--;
            const failed = invocation++ === 0 ? 1 : 0;
            return { sent: failed ? 0 : 1, failed, expired: 0, skippedDuplicates: 0 };
        });
        const response = await GET(request());
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body).toMatchObject({
            claimedUsers: 2, deliveredUsers: 1, failedUsers: 1,
            releasedUsers: 1, releaseFailures: 0,
        });
        expect(mocks.sendPush).toHaveBeenCalledTimes(2);
        expect(maxActive).toBe(1);
        const observable = JSON.stringify([body, mocks.reportError.mock.calls]);
        for (const privateValue of [...USER_IDS, LEASE_ID, ENDPOINT, SECRET, 'グループチャレンジ報酬'])
            expect(observable).not.toContain(privateValue);
    });
});
