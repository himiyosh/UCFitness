import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    backfillUserSteps: vi.fn(),
    checkRateLimit: vi.fn(),
    rateLimitResponse: vi.fn(),
    reportError: vi.fn(),
    syncUserSteps: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: mocks.checkRateLimit,
    rateLimitResponse: mocks.rateLimitResponse,
}));

vi.mock('@/lib/services/step-manager', () => ({
    backfillUserSteps: mocks.backfillUserSteps,
    syncUserSteps: mocks.syncUserSteps,
}));

import { POST } from './route';

describe('POST /api/steps/sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
        mocks.backfillUserSteps.mockResolvedValue(undefined);
        mocks.checkRateLimit.mockReturnValue({
            allowed: true,
            remaining: 2,
            resetAt: Date.now() + 60_000,
            retryAfterSeconds: 0,
        });
    });

    it.each([
        {
            code: 'updated',
            source: 'fitbit',
            steps: 5_000,
            expectedStatus: 200,
            expectedSuccess: true,
        },
        {
            code: 'no_data',
            source: 'google_health',
            steps: null,
            expectedStatus: 200,
            expectedSuccess: false,
        },
        {
            code: 'reauthorization_required',
            source: 'google_health',
            steps: null,
            expectedStatus: 409,
            expectedSuccess: false,
        },
        {
            code: 'sync_in_progress',
            source: 'google_health',
            steps: null,
            expectedStatus: 409,
            expectedSuccess: false,
        },
        {
            code: 'unavailable',
            source: null,
            steps: null,
            expectedStatus: 503,
            expectedSuccess: false,
        },
    ] as const)(
        '$codeを正しいHTTPステータスと成功状態で返す',
        async ({
            code,
            source,
            steps,
            expectedStatus,
            expectedSuccess,
        }) => {
            mocks.syncUserSteps.mockResolvedValue({ code, source, steps });

            const response = await POST();

            expect(response.status).toBe(expectedStatus);
            await expect(response.json()).resolves.toEqual({
                success: expectedSuccess,
                code,
                source,
                steps,
            });
        },
    );

    it('報酬処理が失敗した場合、保存済み歩数を保持した503を返す', async () => {
        mocks.syncUserSteps.mockResolvedValue({
            code: 'reward_processing_failed',
            source: 'google_health',
            steps: 5_000,
        });

        const response = await POST();

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            success: false,
            code: 'reward_processing_failed',
            source: 'google_health',
            steps: 5_000,
        });
    });

    it('履歴同期の再試行枯渇時は当日同期へ進まず失敗を返す', async () => {
        const retryError = new Error('Fitbit API retries exhausted');
        mocks.backfillUserSteps.mockRejectedValueOnce(retryError);

        const response = await POST();

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            error: 'Internal Server Error',
        });
        expect(mocks.syncUserSteps).not.toHaveBeenCalled();
        expect(mocks.reportError).toHaveBeenCalledWith(
            'steps/sync',
            retryError,
            { userId: 'user-1' },
        );
    });
});
