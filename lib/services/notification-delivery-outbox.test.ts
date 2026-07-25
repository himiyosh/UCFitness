import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import {
    buildStepReminderOccurrenceKey, buildWeeklySummaryOccurrenceKey,
    CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, claimNotificationDeliveries,
    COMPLETE_NOTIFICATION_DELIVERY_OUTBOX_RPC, completeNotificationDelivery,
    isValidNotificationOccurrenceKey, RELEASE_NOTIFICATION_DELIVERY_OUTBOX_RPC, releaseNotificationDelivery,
} from '@/lib/services/notification-delivery-outbox';

import type { ClaimNotificationDeliveriesOptions, CompleteNotificationDeliveryOptions, ReleaseNotificationDeliveryOptions } from '@/lib/services/notification-delivery-outbox';
import type { NotificationDeliveryClaimRpcArgs, NotificationDeliveryCompleteRpcArgs, NotificationDeliveryReleaseRpcArgs } from '@/types/database';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reportError: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock('@/lib/errors', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/errors')>(), reportError: mocks.reportError,
}));

const USER_A = '10000000-0000-4000-8000-000000000001', USER_B = '10000000-0000-4000-8000-000000000002';
const OWNER = '20000000-0000-4000-8000-000000000001', TOKEN_A = '30000000-0000-4000-8000-000000000001', TOKEN_B = '30000000-0000-4000-8000-000000000002';
const claimOptions: ClaimNotificationDeliveriesOptions = {
    notificationType: 'step-reminder', occurrenceKey: '2026-07-25', userIds: [USER_B, USER_A, USER_B], leaseOwner: OWNER,
};
const fence: CompleteNotificationDeliveryOptions = {
    notificationType: 'weekly-summary', occurrenceKey: '2026-W30', userId: USER_A, leaseOwner: OWNER, claimToken: TOKEN_A,
};
const releaseOptions: ReleaseNotificationDeliveryOptions = { ...fence, failureCode: 'PUSH_DELIVERY_FAILED' };
const claimRpcArgs: NotificationDeliveryClaimRpcArgs = {
    p_notification_type: 'step-reminder', p_occurrence_key: '2026-07-25', p_user_ids: [USER_A, USER_B], p_lease_owner: OWNER,
};
const fenceRpcArgs: NotificationDeliveryCompleteRpcArgs & NotificationDeliveryReleaseRpcArgs = {
    p_notification_type: 'weekly-summary', p_occurrence_key: '2026-W30', p_user_id: USER_A, p_lease_owner: OWNER, p_claim_token: TOKEN_A,
};
beforeEach(() => { mocks.rpc.mockReset(); mocks.reportError.mockReset(); });
function captureFixedError(promise: Promise<unknown>): Promise<AppError> {
    return promise.then(() => { throw new Error('Expected AppError'); }, (error: unknown) => {
        if (!(error instanceof AppError)) throw error;
        return error;
    });
}
function collectErrorFields(value: unknown, seen = new Set<object>()): string[] {
    if (typeof value === 'string') return [value];
    if (typeof value !== 'object' || value === null || seen.has(value)) return [];
    seen.add(value);
    const fields = value instanceof Error ? [value.name, value.message, value.stack ?? ''] : [];
    return [...fields, ...Reflect.ownKeys(value).flatMap((key) => collectErrorFields(Reflect.get(value, key), seen))];
}
function expectFixedError(error: AppError, message: string, code: string,
    context: Record<string, unknown>, raw?: Error, secrets: string[] = []): void {
    if (raw) expect(error).not.toBe(raw);
    expect(error.name).toBe('AppError'); expect(error.message).toBe(message);
    expect(error.code).toBe(code); expect(error.context).toEqual(context);
    expect(error.cause).toBeUndefined(); expect(mocks.reportError).not.toHaveBeenCalled();
    const exposed = collectErrorFields(error).join(' ');
    for (const secret of secrets) expect(exposed).not.toContain(secret);
}
function expectRpcOnce(name: string, args: Record<string, unknown>): void {
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.rpc).toHaveBeenCalledWith(name, args);
    expect(mocks.reportError).not.toHaveBeenCalled();
}
describe('notification delivery outbox occurrence keys', () => {
    it('step reminder_JST境界_Dateからcanonical日付を返す', () => {
        expect(buildStepReminderOccurrenceKey(new Date('2026-07-24T15:00:00Z'))).toBe('2026-07-25');
    });
    it.each([
        ['0001-01-01', '0001-W01'], ['0099-01-01', '0099-W01'],
        ['0100-01-01', '0099-W53'], ['2019-12-30', '2020-W01'],
        ['2021-01-03', '2020-W53'],
    ])('weekly summary_%s_4桁canonical ISO週%sを返す', (date, expected) => {
        expect(buildWeeklySummaryOccurrenceKey(date)).toBe(expected);
    });
    it.each([
        ['step-reminder', '2024-02-29', true],
        ['step-reminder', '2023-02-29', false],
        ['step-reminder', '0100-02-29', false],
        ['step-reminder', '2000-02-29', true],
        ['step-reminder', '0000-01-01', false],
        ['weekly-summary', '0099-W53', true],
        ['weekly-summary', '0100-W53', false],
        ['weekly-summary', '2020-W53', true],
        ['weekly-summary', '2021-W53', false],
        ['weekly-summary', '0000-W01', false],
        ['other', '2026-07-25', false],
    ])('%s_%s_canonical判定が%sになる', (type, key, expected) => {
        expect(isValidNotificationOccurrenceKey(type, key)).toBe(expected);
    });
    it.each([
        () => buildStepReminderOccurrenceKey(new Date('invalid')), () => buildWeeklySummaryOccurrenceKey('0000-01-01'),
    ])('builderへ不正日付_固定occurrence errorを投げる', async (build) => {
        const error = await captureFixedError(Promise.resolve().then(build));
        expectFixedError(error, 'Invalid notification outbox occurrence input',
            'NOTIFICATION_OUTBOX_OCCURRENCE_INPUT_INVALID', { stage: 'occurrence-input' });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});
describe('claimNotificationDeliveries', () => {
    it('有効な重複user_安定dedupしたexact argsでstrict rowsを返す', async () => {
        mocks.rpc.mockResolvedValue({ data: [
            { user_id: USER_A, claim_token: TOKEN_A },
            { user_id: USER_B, claim_token: TOKEN_B },
        ], error: null });
        await expect(claimNotificationDeliveries(claimOptions)).resolves.toEqual([
            { user_id: USER_A, claim_token: TOKEN_A },
            { user_id: USER_B, claim_token: TOKEN_B },
        ]);
        expectRpcOnce(CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, claimRpcArgs);
    });
    it('claim対象なし_空配列を正常結果として維持する', async () => {
        mocks.rpc.mockResolvedValue({ data: [], error: null });
        await expect(claimNotificationDeliveries(claimOptions)).resolves.toEqual([]);
        expectRpcOnce(CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, claimRpcArgs);
    });
    it('20 unique user_上限件数をexact argsで受理する', async () => {
        const userIds = Array.from({ length: 20 }, (_, index) =>
            `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
        mocks.rpc.mockResolvedValue({ data: [], error: null });
        await expect(claimNotificationDeliveries({ ...claimOptions, userIds })).resolves.toEqual([]);
        expectRpcOnce(CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, { ...claimRpcArgs, p_user_ids: userIds });
    });
    it.each([
        null,
        [{}],
        [{ user_id: USER_A, claim_token: TOKEN_A, extra: true }],
        [{ user_id: USER_B, claim_token: TOKEN_B }, { user_id: USER_A, claim_token: TOKEN_A }],
        [{ user_id: USER_A, claim_token: TOKEN_A }, { user_id: USER_A, claim_token: TOKEN_B }],
        [{ user_id: '10000000-0000-4000-8000-000000000003', claim_token: TOKEN_A }],
        [{ user_id: USER_A, claim_token: TOKEN_A }, { user_id: USER_B, claim_token: TOKEN_A }],
    ])('RPC rowsが不正な%j_固定invalid resultを投げる', async (data) => {
        mocks.rpc.mockResolvedValue({ data, error: null });
        const error = await captureFixedError(claimNotificationDeliveries(claimOptions));
        expectFixedError(error, 'Notification outbox claim returned an invalid result',
            'NOTIFICATION_OUTBOX_CLAIM_RESULT_INVALID', { stage: 'claim-result' });
        expectRpcOnce(CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, claimRpcArgs);
    });
    it.each([
        { ...claimOptions, notificationType: 'other' },
        { ...claimOptions, occurrenceKey: '2026-02-30' },
        { ...claimOptions, userIds: [] },
        { ...claimOptions, userIds: Array.from({ length: 21 }, (_, index) =>
            `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`) },
        { ...claimOptions, userIds: ['invalid'] },
        { ...claimOptions, leaseOwner: 'invalid' },
    ])('入力が不正な%j_RPC前に拒否する', async (options) => {
        const error = await captureFixedError(claimNotificationDeliveries(
            options as ClaimNotificationDeliveriesOptions,
        ));
        expectFixedError(error, 'Invalid notification outbox claim input',
            'NOTIFICATION_OUTBOX_CLAIM_INPUT_INVALID', { stage: 'claim-input' });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});
describe('completion and release fencing', () => {
    it.each([true, false])('complete RPCが%s_exact argsのbooleanをそのまま返す', async (data) => {
        mocks.rpc.mockResolvedValue({ data, error: null });
        await expect(completeNotificationDelivery(fence)).resolves.toBe(data);
        expectRpcOnce(COMPLETE_NOTIFICATION_DELIVERY_OUTBOX_RPC, fenceRpcArgs);
    });
    it.each([true, false])('release RPCが%s_exact fenceだけを渡してbooleanを返す', async (data) => {
        mocks.rpc.mockResolvedValue({ data, error: null });
        await expect(releaseNotificationDelivery(releaseOptions)).resolves.toBe(data);
        expectRpcOnce(RELEASE_NOTIFICATION_DELIVERY_OUTBOX_RPC, fenceRpcArgs);
    });
    it.each([
        ['complete', () => completeNotificationDelivery(fence), 'Notification outbox completion returned an invalid result',
            'NOTIFICATION_OUTBOX_COMPLETE_RESULT_INVALID', { stage: 'complete-result' }, COMPLETE_NOTIFICATION_DELIVERY_OUTBOX_RPC],
        ['release', () => releaseNotificationDelivery(releaseOptions), 'Notification outbox release returned an invalid result',
            'NOTIFICATION_OUTBOX_RELEASE_RESULT_INVALID', { stage: 'release-result', failureCode: 'PUSH_DELIVERY_FAILED' }, RELEASE_NOTIFICATION_DELIVERY_OUTBOX_RPC],
    ])('%s RPCがboolean以外_result invalidを投げる', async (_label, call, message, code, context, rpc) => {
        mocks.rpc.mockResolvedValue({ data: null, error: null });
        expectFixedError(await captureFixedError(call()), message, code, context);
        expectRpcOnce(rpc, fenceRpcArgs);
    });
    it.each([
        ['complete', () => completeNotificationDelivery({ ...fence, claimToken: 'invalid' }), 'NOTIFICATION_OUTBOX_COMPLETE_INPUT_INVALID'],
        ['release', () => releaseNotificationDelivery({ ...releaseOptions, userId: 'invalid' }), 'NOTIFICATION_OUTBOX_RELEASE_INPUT_INVALID'],
    ])('%s fenceが不正_RPC前に拒否する', async (_label, call, code) => {
        const error = await captureFixedError(call());
        expectFixedError(error, _label === 'complete' ? 'Invalid notification outbox completion input'
            : 'Invalid notification outbox release input', code, { stage: `${_label}-input` });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it('release categoryがallowlist外_RPC前に拒否する', async () => {
        // TypeScript 利用者以外から届く不正値を runtime 境界で検証する。
        const error = await captureFixedError(releaseNotificationDelivery({
            ...releaseOptions,
            failureCode: 'RAW_FAILURE',
        } as unknown as ReleaseNotificationDeliveryOptions));
        expectFixedError(error, 'Invalid notification outbox release input',
            'NOTIFICATION_OUTBOX_RELEASE_INPUT_INVALID', { stage: 'release-input' });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});
describe('outbox RPC privacy boundary', () => {
    it.each([
        ['claim returned', () => claimNotificationDeliveries(claimOptions), false,
            'Notification outbox claim failed', 'NOTIFICATION_OUTBOX_CLAIM_FAILED',
            { stage: 'claim-rpc' }, CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, claimRpcArgs],
        ['complete thrown', () => completeNotificationDelivery(fence), true,
            'Notification outbox completion failed', 'NOTIFICATION_OUTBOX_COMPLETE_FAILED',
            { stage: 'complete-rpc' }, COMPLETE_NOTIFICATION_DELIVERY_OUTBOX_RPC, fenceRpcArgs],
        ['release returned', () => releaseNotificationDelivery(releaseOptions), false,
            'Notification outbox release failed', 'NOTIFICATION_OUTBOX_RELEASE_FAILED',
            { stage: 'release-rpc', failureCode: 'PUSH_DELIVERY_FAILED' },
            RELEASE_NOTIFICATION_DELIVERY_OUTBOX_RPC, fenceRpcArgs],
    ])('%s error_生errorとUUIDをcause/contextへ渡さない',
        async (_label, call, thrown, message, code, context, rpc, args) => {
            const nested = Object.assign(new Error('RAW_NESTED_MESSAGE'), {
                name: 'RawNestedError', stack: 'RAW_NESTED_STACK', cause: new Error(USER_B),
            });
            const raw = Object.assign(new Error('RAW_PRIVATE_MESSAGE'), {
                name: 'RawDatabaseError', stack: 'RAW_STACK', cause: new Error(USER_A),
                context: { userId: USER_B, nested }, details: 'RAW_DETAILS',
                hint: 'RAW_HINT', code: 'RAW_CODE',
            });
            if (thrown) mocks.rpc.mockRejectedValueOnce(raw);
            else mocks.rpc.mockResolvedValue({ data: null, error: raw });
            const error = await captureFixedError(call());
            expectFixedError(error, message, code, context, raw, [
                'RawDatabaseError', 'RAW_PRIVATE_MESSAGE', 'RAW_STACK', 'RawNestedError',
                'RAW_NESTED_MESSAGE', 'RAW_NESTED_STACK', 'RAW_DETAILS', 'RAW_HINT',
                'RAW_CODE', USER_A, USER_B, OWNER, TOKEN_A,
            ]);
            expectRpcOnce(rpc, args);
        });
});
