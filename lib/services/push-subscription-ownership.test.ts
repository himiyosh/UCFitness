import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import {
    READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC,
    readPushSubscriptionGenerations,
    RELEASE_PUSH_SUBSCRIPTION_RPC,
    releasePushSubscription,
    SAVE_PUSH_SUBSCRIPTION_RPC,
    savePushSubscription,
} from '@/lib/services/push-subscription-ownership';

import type {
    ReadPushSubscriptionGenerationsOptions,
    ReleasePushSubscriptionOptions,
    SavePushSubscriptionOptions,
} from '@/lib/services/push-subscription-ownership';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reportError: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(),
    reportError: mocks.reportError,
}));

const USER = '10000000-0000-4000-8000-000000000001';
const SUB_A = '20000000-0000-4000-8000-000000000001';
const SUB_B = '20000000-0000-4000-8000-000000000002';
const GEN_A = '30000000-0000-4000-8000-000000000001';
const GEN_B = '30000000-0000-4000-8000-000000000002';
const ENDPOINT = 'https://push.example.test/v1/device';
const KEY_A = 'https://PUSH.EXAMPLE.TEST:443/v1/%41';
const KEY_B = 'https://push.example.test/v1/B';
const SAVE_ROW = {
    subscription_id: SUB_A,
    stored_user_id: USER,
    stored_endpoint: ENDPOINT,
    stored_p256dh: 'p256dh-value',
    stored_auth: 'auth-value',
    stored_user_agent: 'Browser',
    stored_created_at: '2026-07-25T00:00:00Z',
    recipient_generation: GEN_A,
    ownership_version: 7,
    recipient_protocol_version: 1,
};
const saveOptions: SavePushSubscriptionOptions = {
    userId: USER,
    endpoint: ENDPOINT,
    ownershipKey: KEY_A,
    p256dh: SAVE_ROW.stored_p256dh,
    auth: SAVE_ROW.stored_auth,
    userAgent: SAVE_ROW.stored_user_agent,
};
const readOptions: ReadPushSubscriptionGenerationsOptions = {
    userId: USER,
    observations: [
        { subscriptionId: SUB_B, ownershipKey: KEY_B },
        { subscriptionId: SUB_A, ownershipKey: KEY_A },
        { subscriptionId: SUB_A, ownershipKey: KEY_A },
    ],
};
const releaseOptions: ReleasePushSubscriptionOptions = {
    userId: USER,
    endpoint: ENDPOINT,
    ownershipKey: KEY_A,
    recipientGeneration: GEN_A,
    ownershipVersion: 7,
};
beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.reportError.mockReset();
});

async function captureAppError(promise: Promise<unknown>): Promise<AppError> {
    const error = await promise.then(() => null, (reason: unknown) => reason);
    if (!(error instanceof AppError)) {
        throw error ?? new Error('Expected AppError');
    }
    return error;
}

function collectFields(value: unknown, seen = new Set<object>()): string[] {
    if (typeof value === 'string') return [value];
    if (typeof value !== 'object' || value === null || seen.has(value)) return [];
    seen.add(value);
    const ownValues = Reflect.ownKeys(value).flatMap((key) => collectFields(Reflect.get(value, key), seen));
    return value instanceof Error
        ? [value.name, value.message, value.stack ?? '', ...ownValues]
        : ownValues;
}

function expectPrivateError(
    error: AppError,
    code: string,
    secrets: readonly string[] = [],
): void {
    expect(error).toMatchObject({ name: 'AppError', code, context: undefined, cause: undefined });
    expect(mocks.reportError).not.toHaveBeenCalled();
    const exposed = collectFields(error).join(' ');
    for (const secret of secrets) expect(exposed).not.toContain(secret);
}

function expectRpcOnce(name: string, args: object): void {
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(name, args);
}

describe('push subscription ownership RPC wrappers', () => {
    it('save_shape-valid keyを変更せずprotocol 1のexact RPCへ渡して権威だけを返す', async () => {
        mocks.rpc.mockResolvedValue({ data: [SAVE_ROW], error: null });
        await expect(savePushSubscription(saveOptions)).resolves.toEqual({
            subscriptionId: SUB_A,
            recipientGeneration: GEN_A,
            ownershipVersion: 7,
            recipientProtocolVersion: 1,
        });
        expectRpcOnce(SAVE_PUSH_SUBSCRIPTION_RPC, {
            p_user_id: USER,
            p_endpoint: ENDPOINT,
            p_ownership_key: KEY_A,
            p_p256dh: SAVE_ROW.stored_p256dh,
            p_auth: SAVE_ROW.stored_auth,
            p_user_agent: SAVE_ROW.stored_user_agent,
            p_protocol_version: 1,
        });
    });

    it('read_同一exact観測をUUID順にdedupしてprotocol 0と1をstrict mapで返す', async () => {
        mocks.rpc.mockResolvedValue({ data: [
            { subscription_id: SUB_A, recipient_generation: GEN_A, ownership_version: 7, recipient_protocol_version: 1 },
            { subscription_id: SUB_B, recipient_generation: GEN_B, ownership_version: 8, recipient_protocol_version: 0 },
        ], error: null });
        await expect(readPushSubscriptionGenerations(readOptions)).resolves.toEqual(new Map([
            [SUB_A, { recipientGeneration: GEN_A, ownershipVersion: 7, recipientProtocolVersion: 1 }],
            [SUB_B, { recipientGeneration: GEN_B, ownershipVersion: 8, recipientProtocolVersion: 0 }],
        ]));
        expectRpcOnce(READ_PUSH_SUBSCRIPTION_GENERATIONS_RPC, {
            p_user_id: USER,
            p_subscription_ids: [SUB_A, SUB_B],
            p_ownership_keys: [KEY_A, KEY_B],
        });
    });

    it('read_20件を受理し21件目をRPC前に拒否する', async () => {
        const observations = Array.from({ length: 20 }, (_, index) => ({
            subscriptionId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            ownershipKey: `${KEY_B}/${index}`,
        }));
        mocks.rpc.mockResolvedValue({ data: [], error: null });
        await expect(readPushSubscriptionGenerations({ userId: USER, observations })).resolves.toEqual(new Map());
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        mocks.rpc.mockReset();
        expectPrivateError(await captureAppError(readPushSubscriptionGenerations({
            userId: USER,
            observations: [...observations, observations[0]],
        })), 'PUSH_SUBSCRIPTION_GENERATION_INPUT_INVALID');
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it.each([true, false])('release_%sをexact fenceのstrict booleanとして返す', async (released) => {
        mocks.rpc.mockResolvedValue({ data: released, error: null });
        await expect(releasePushSubscription(releaseOptions)).resolves.toBe(released);
        expectRpcOnce(RELEASE_PUSH_SUBSCRIPTION_RPC, {
            p_user_id: USER,
            p_endpoint: ENDPOINT,
            p_ownership_key: KEY_A,
            p_recipient_generation: GEN_A,
            p_ownership_version: 7,
        });
    });

    it.each([
        ['save', () => savePushSubscription({ ...saveOptions, ownershipKey: 'http://invalid' }), 'PUSH_SUBSCRIPTION_SAVE_INPUT_INVALID'],
        ['read-empty', () => readPushSubscriptionGenerations({ ...readOptions, observations: [] }), 'PUSH_SUBSCRIPTION_GENERATION_INPUT_INVALID'],
        ['read-conflict', () => readPushSubscriptionGenerations({
            ...readOptions,
            observations: [
                { subscriptionId: SUB_A, ownershipKey: KEY_A },
                { subscriptionId: SUB_A, ownershipKey: KEY_B },
            ],
        }), 'PUSH_SUBSCRIPTION_GENERATION_INPUT_INVALID'],
        ['release', () => releasePushSubscription({ ...releaseOptions, ownershipVersion: 0 }), 'PUSH_SUBSCRIPTION_RELEASE_INPUT_INVALID'],
    ])('%s_不正入力をRPC0の固定AppErrorで拒否する', async (_name, call, code) => {
        expectPrivateError(await captureAppError(call()), code);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it.each([
        ['save-extra', () => savePushSubscription(saveOptions), [{ ...SAVE_ROW, leaked: 'RAW_RESULT_SECRET' }], 'PUSH_SUBSCRIPTION_SAVE_RESULT_INVALID'],
        ['save-echo', () => savePushSubscription(saveOptions), [{ ...SAVE_ROW, stored_user_id: SUB_B }], 'PUSH_SUBSCRIPTION_SAVE_RESULT_INVALID'],
        ['read-extra', () => readPushSubscriptionGenerations(readOptions), [{ subscription_id: SUB_A, recipient_generation: GEN_A, ownership_version: 7, recipient_protocol_version: 1, leaked: 'RAW_RESULT_SECRET' }], 'PUSH_SUBSCRIPTION_GENERATION_RESULT_INVALID'],
        ['read-protocol', () => readPushSubscriptionGenerations(readOptions), [{ subscription_id: SUB_A, recipient_generation: GEN_A, ownership_version: 7, recipient_protocol_version: 2 }], 'PUSH_SUBSCRIPTION_GENERATION_RESULT_INVALID'],
        ['read-unrequested', () => readPushSubscriptionGenerations(readOptions), [{ subscription_id: USER, recipient_generation: GEN_A, ownership_version: 7, recipient_protocol_version: 1 }], 'PUSH_SUBSCRIPTION_GENERATION_RESULT_INVALID'],
        ['read-duplicate', () => readPushSubscriptionGenerations(readOptions), [{ subscription_id: SUB_A, recipient_generation: GEN_A, ownership_version: 7, recipient_protocol_version: 1 }, { subscription_id: SUB_A, recipient_generation: GEN_B, ownership_version: 8, recipient_protocol_version: 0 }], 'PUSH_SUBSCRIPTION_GENERATION_RESULT_INVALID'],
        ['read-unsorted', () => readPushSubscriptionGenerations(readOptions), [{ subscription_id: SUB_B, recipient_generation: GEN_B, ownership_version: 8, recipient_protocol_version: 0 }, { subscription_id: SUB_A, recipient_generation: GEN_A, ownership_version: 7, recipient_protocol_version: 1 }], 'PUSH_SUBSCRIPTION_GENERATION_RESULT_INVALID'],
        ['release', () => releasePushSubscription(releaseOptions), 'RAW_RESULT_SECRET', 'PUSH_SUBSCRIPTION_RELEASE_RESULT_INVALID'],
    ])('%s_不正resultを非露出の固定AppErrorにする', async (_name, call, data, code) => {
        mocks.rpc.mockResolvedValue({ data, error: null });
        expectPrivateError(await captureAppError(call()), code, ['RAW_RESULT_SECRET', USER, SUB_B, GEN_A, KEY_A]);
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['save-returned', () => savePushSubscription(saveOptions), false, 'PUSH_SUBSCRIPTION_SAVE_FAILED'],
        ['read-thrown', () => readPushSubscriptionGenerations(readOptions), true, 'PUSH_SUBSCRIPTION_GENERATION_READ_FAILED'],
        ['release-returned', () => releasePushSubscription(releaseOptions), false, 'PUSH_SUBSCRIPTION_RELEASE_FAILED'],
    ])('%s_RPC error graphをcause/context/logへ渡さない', async (_name, call, thrown, code) => {
        const raw = Object.assign(new Error(`RAW:${USER}:${KEY_A}`), {
            name: 'RawDatabaseError',
            stack: `RAW_STACK:${GEN_A}`,
            cause: new Error(ENDPOINT),
            details: SAVE_ROW.stored_p256dh,
            hint: SAVE_ROW.stored_auth,
            code: 'RAW_CODE',
        });
        if (thrown) mocks.rpc.mockRejectedValue(raw);
        else mocks.rpc.mockResolvedValue({ data: null, error: raw });
        expectPrivateError(await captureAppError(call()), code, [
            'RawDatabaseError', 'RAW_STACK', 'RAW_CODE', USER, KEY_A, GEN_A,
            ENDPOINT, SAVE_ROW.stored_p256dh, SAVE_ROW.stored_auth,
        ]);
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
    });
});

describe('push subscription ownership import boundary', () => {
    it('wrapperをserver-onlyかつPR314までunit test以外から未使用に保つ', () => {
        const wrapperPath = 'lib/services/push-subscription-ownership.ts';
        const wrapper = readFileSync(join(process.cwd(), wrapperPath), 'utf8');
        expect(wrapper).toMatch(/^import 'server-only';/);
        expect(wrapper).not.toContain('getPushEndpointOwnershipKey');
        const output = execFileSync('git', [
            'ls-files', '--cached', '--others', '--exclude-standard', '*.ts', '*.tsx',
        ], { encoding: 'utf8' }).trim();
        const files = output ? output.split('\n') : [];
        const importPattern = /['"][^'"]*push-subscription-ownership['"]/;
        const importers = files.filter((file) =>
            file !== wrapperPath && importPattern.test(readFileSync(join(process.cwd(), file), 'utf8')));
        expect(importers).toEqual(['lib/services/push-subscription-ownership.test.ts']);
        expect(importers.filter((file) =>
            readFileSync(join(process.cwd(), file), 'utf8').trimStart().startsWith("'use client'"))).toEqual([]);
    });
});
