import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import {
    buildStepReminderOccurrenceKey, buildWeeklySummaryOccurrenceKey,
    CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, claimNotificationDeliveries,
    COMPLETE_NOTIFICATION_DELIVERY_OUTBOX_RPC, completeNotificationDelivery,
    isValidNotificationOccurrenceKey, RELEASE_NOTIFICATION_DELIVERY_OUTBOX_RPC,
    releaseNotificationDelivery,
} from '@/lib/services/notification-delivery-outbox';

import type {
    ClaimNotificationDeliveriesOptions, CompleteNotificationDeliveryOptions,
    ReleaseNotificationDeliveryOptions,
} from '@/lib/services/notification-delivery-outbox';
import type {
    NotificationDeliveryClaimRpcArgs, NotificationDeliveryCompleteRpcArgs,
    NotificationDeliveryReleaseRpcArgs,
} from '@/types/database';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '10000000-0000-4000-8000-000000000002';
const OWNER = '20000000-0000-4000-8000-000000000001';
const TOKEN_A = '30000000-0000-4000-8000-000000000001';
const TOKEN_B = '30000000-0000-4000-8000-000000000002';
const claimOptions: ClaimNotificationDeliveriesOptions = {
    notificationType: 'step-reminder', occurrenceKey: '2026-07-25',
    userIds: [USER_B, USER_A, USER_B], leaseOwner: OWNER,
};
const fence: CompleteNotificationDeliveryOptions = {
    notificationType: 'weekly-summary', occurrenceKey: '2026-W30', userId: USER_A,
    leaseOwner: OWNER, claimToken: TOKEN_A,
};
const releaseOptions: ReleaseNotificationDeliveryOptions = {
    ...fence, failureCode: 'PUSH_DELIVERY_FAILED',
};
function captureFixedError(promise: Promise<unknown>): Promise<AppError> {
    return promise.then(
        () => { throw new Error('Expected AppError'); },
        (error: unknown) => {
            if (!(error instanceof AppError)) throw error;
            return error;
        },
    );
}

function expectPrivateValuesAbsent(error: AppError, values: string[]): void {
    expect(error.cause).toBeUndefined();
    const exposed = [error.name, error.message, error.code, JSON.stringify(error.context), String(error.cause)]
        .join(' ');
    for (const value of values) expect(exposed).not.toContain(value);
}

describe('notification delivery outbox occurrence keys', () => {
    it('step reminder_JST境界_Dateからcanonical日付を返す', () => {
        expect(buildStepReminderOccurrenceKey(new Date('2026-07-24T15:00:00Z'))).toBe('2026-07-25');
    });

    it('weekly summary_年境界_ISO週keyを返す', () => {
        expect(buildWeeklySummaryOccurrenceKey('2021-01-01')).toBe('2020-W53');
    });

    it.each([
        ['step-reminder', '2024-02-29', true],
        ['step-reminder', '2023-02-29', false],
        ['step-reminder', '0000-01-01', false],
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
        expect((await captureFixedError(Promise.resolve().then(build))).code).toBe('NOTIFICATION_OUTBOX_OCCURRENCE_INPUT_INVALID');
    });
});

describe('claimNotificationDeliveries', () => {
    beforeEach(() => mocks.rpc.mockReset());

    it('有効な重複user_安定dedupしたexact argsでstrict rowsを返す', async () => {
        mocks.rpc.mockResolvedValue({ data: [
            { user_id: USER_A, claim_token: TOKEN_A },
            { user_id: USER_B, claim_token: TOKEN_B },
        ], error: null });
        const expectedArgs: NotificationDeliveryClaimRpcArgs = {
            p_notification_type: 'step-reminder',
            p_occurrence_key: '2026-07-25',
            p_user_ids: [USER_A, USER_B],
            p_lease_owner: OWNER,
        };
        await expect(claimNotificationDeliveries(claimOptions)).resolves.toEqual([
            { user_id: USER_A, claim_token: TOKEN_A },
            { user_id: USER_B, claim_token: TOKEN_B },
        ]);
        expect(mocks.rpc).toHaveBeenCalledWith(CLAIM_NOTIFICATION_DELIVERY_OUTBOX_RPC, expectedArgs);
    });

    it('claim対象なし_空配列を正常結果として維持する', async () => {
        mocks.rpc.mockResolvedValue({ data: [], error: null });
        await expect(claimNotificationDeliveries(claimOptions)).resolves.toEqual([]);
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
        expect(error).toMatchObject({
            code: 'NOTIFICATION_OUTBOX_CLAIM_RESULT_INVALID',
            context: { stage: 'claim-result' },
        });
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
        expect(error.code).toBe('NOTIFICATION_OUTBOX_CLAIM_INPUT_INVALID');
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});

describe('completion and release fencing', () => {
    beforeEach(() => mocks.rpc.mockReset());

    it.each([true, false])('complete RPCが%s_exact argsのbooleanをそのまま返す', async (data) => {
        mocks.rpc.mockResolvedValue({ data, error: null });
        const expectedArgs: NotificationDeliveryCompleteRpcArgs = {
            p_notification_type: 'weekly-summary',
            p_occurrence_key: '2026-W30',
            p_user_id: USER_A,
            p_lease_owner: OWNER,
            p_claim_token: TOKEN_A,
        };
        await expect(completeNotificationDelivery(fence)).resolves.toBe(data);
        expect(mocks.rpc).toHaveBeenCalledWith(COMPLETE_NOTIFICATION_DELIVERY_OUTBOX_RPC, expectedArgs);
    });

    it.each([true, false])('release RPCが%s_exact fenceだけを渡してbooleanを返す', async (data) => {
        mocks.rpc.mockResolvedValue({ data, error: null });
        const expectedArgs: NotificationDeliveryReleaseRpcArgs = {
            p_notification_type: 'weekly-summary',
            p_occurrence_key: '2026-W30',
            p_user_id: USER_A,
            p_lease_owner: OWNER,
            p_claim_token: TOKEN_A,
        };
        await expect(releaseNotificationDelivery(releaseOptions)).resolves.toBe(data);
        expect(mocks.rpc).toHaveBeenCalledWith(RELEASE_NOTIFICATION_DELIVERY_OUTBOX_RPC, expectedArgs);
    });

    it.each([
        ['complete', () => completeNotificationDelivery(fence), 'NOTIFICATION_OUTBOX_COMPLETE_RESULT_INVALID'],
        ['release', () => releaseNotificationDelivery(releaseOptions), 'NOTIFICATION_OUTBOX_RELEASE_RESULT_INVALID'],
    ])('%s RPCがboolean以外_result invalidを投げる', async (_label, call, code) => {
        mocks.rpc.mockResolvedValue({ data: null, error: null });
        expect((await captureFixedError(call())).code).toBe(code);
    });

    it.each([
        ['complete', () => completeNotificationDelivery({ ...fence, claimToken: 'invalid' }), 'NOTIFICATION_OUTBOX_COMPLETE_INPUT_INVALID'],
        ['release', () => releaseNotificationDelivery({ ...releaseOptions, userId: 'invalid' }), 'NOTIFICATION_OUTBOX_RELEASE_INPUT_INVALID'],
    ])('%s fenceが不正_RPC前に拒否する', async (_label, call, code) => {
        expect((await captureFixedError(call())).code).toBe(code);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('release categoryがallowlist外_RPC前に拒否する', async () => {
        // TypeScript 利用者以外から届く不正値を runtime 境界で検証する。
        const error = await captureFixedError(releaseNotificationDelivery({
            ...releaseOptions,
            failureCode: 'RAW_FAILURE',
        } as unknown as ReleaseNotificationDeliveryOptions));
        expect(error).toMatchObject({
            code: 'NOTIFICATION_OUTBOX_RELEASE_INPUT_INVALID',
            context: { stage: 'release-input' },
        });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});

describe('outbox RPC privacy boundary', () => {
    beforeEach(() => mocks.rpc.mockReset());

    it.each([
        ['claim returned', () => claimNotificationDeliveries(claimOptions), false,
            'NOTIFICATION_OUTBOX_CLAIM_FAILED', { stage: 'claim-rpc' }],
        ['complete thrown', () => completeNotificationDelivery(fence), true,
            'NOTIFICATION_OUTBOX_COMPLETE_FAILED', { stage: 'complete-rpc' }],
        ['release returned', () => releaseNotificationDelivery(releaseOptions), false,
            'NOTIFICATION_OUTBOX_RELEASE_FAILED',
            { stage: 'release-rpc', failureCode: 'PUSH_DELIVERY_FAILED' }],
    ])('%s error_生errorとUUIDをcause/contextへ渡さない',
        async (_label, call, thrown, code, context) => {
            const raw = Object.assign(new Error('RAW_PRIVATE_MESSAGE'), {
                cause: new Error(USER_A),
                context: { userId: USER_B },
                details: 'RAW_DETAILS',
                hint: 'RAW_HINT',
                code: 'RAW_CODE',
            });
            if (thrown) mocks.rpc.mockRejectedValueOnce(raw);
            else mocks.rpc.mockResolvedValue({ data: null, error: raw });
            const error = await captureFixedError(call());
            expect(error).toMatchObject({ code, context, cause: undefined });
            expectPrivateValuesAbsent(error, [
                'RAW_PRIVATE_MESSAGE', 'RAW_DETAILS', 'RAW_HINT', 'RAW_CODE',
                USER_A, USER_B, OWNER, TOKEN_A,
            ]);
        });
});
