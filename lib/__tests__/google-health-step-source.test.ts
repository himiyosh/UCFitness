import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getDailySteps: vi.fn(),
    refreshAccessToken: vi.fn(),
    markReauthorizationRequired: vi.fn(),
    reportError: vi.fn(),
    updateTokens: vi.fn(),
}));

vi.mock('@/lib/api/google-health', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/api/google-health')>();
    return {
        ...original,
        getGoogleHealthDailySteps: mocks.getDailySteps,
        refreshGoogleHealthAccessToken: mocks.refreshAccessToken,
    };
});

vi.mock('@/lib/services/fitness-connection-service', () => ({
    markGoogleHealthReauthorizationRequired: mocks.markReauthorizationRequired,
    updateGoogleHealthTokens: mocks.updateTokens,
}));

vi.mock('@/lib/errors', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/errors')>();
    return {
        ...original,
        reportError: mocks.reportError,
    };
});

import { GoogleHealthApiError } from '@/lib/api/google-health';
import { createGoogleHealthStepReader } from '@/lib/services/google-health-step-source';

import type { GoogleHealthConnection } from '@/lib/services/fitness-connection-service';

const connection: GoogleHealthConnection = {
    userId: 'user-1',
    providerUserId: 'health-user-1',
    legacyProviderUserId: null,
    accessToken: 'old-access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAt: 1,
    scopes: ['scope'],
    historySyncedAt: null,
};
const CLAIM_ID = '11111111-1111-4111-8111-111111111111';

describe('createGoogleHealthStepReader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.refreshAccessToken.mockResolvedValue({
            accessToken: 'new-access-token',
            refreshToken: null,
            expiresIn: 3600,
            scopes: ['scope'],
            tokenType: 'Bearer',
        });
        mocks.getDailySteps.mockResolvedValue([
            { date: '2026-06-01', steps: 1000 },
        ]);
        mocks.updateTokens.mockResolvedValue(undefined);
        mocks.markReauthorizationRequired.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('アクセストークンが期限切れの場合、更新してから歩数を取得する', async () => {
        const reader = createGoogleHealthStepReader(connection, CLAIM_ID);

        const result = await reader.read('2026-06-01', '2026-06-01');

        expect(mocks.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
        expect(mocks.updateTokens).toHaveBeenCalledWith(
            'user-1',
            CLAIM_ID,
            expect.objectContaining({ accessToken: 'new-access-token' }),
        );
        expect(mocks.getDailySteps).toHaveBeenCalledWith(
            'new-access-token',
            '2026-06-01',
            '2026-06-01',
        );
        expect(result).toEqual([{ date: '2026-06-01', steps: 1000 }]);
    });

    it('歩数APIが401を返した場合、トークン更新後に一度だけ再試行する', async () => {
        mocks.getDailySteps
            .mockRejectedValueOnce(new GoogleHealthApiError(
                'Unauthorized',
                401,
            ))
            .mockResolvedValueOnce([{ date: '2026-06-01', steps: 2000 }]);
        const reader = createGoogleHealthStepReader(
            {
                ...connection,
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
            },
            CLAIM_ID,
        );

        const result = await reader.read('2026-06-01', '2026-06-01');

        expect(mocks.getDailySteps).toHaveBeenCalledTimes(2);
        expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(result[0]?.steps).toBe(2000);
    });

    it('更新後のアクセストークンも401になる場合、再認証が必要な状態として記録する', async () => {
        mocks.getDailySteps.mockRejectedValue(new GoogleHealthApiError(
            'Unauthorized',
            401,
        ));
        const reader = createGoogleHealthStepReader(
            {
                ...connection,
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
            },
            CLAIM_ID,
        );

        await expect(
            reader.read('2026-06-01', '2026-06-01'),
        ).rejects.toMatchObject({
            code: 'GOOGLE_HEALTH_REAUTHORIZATION_REQUIRED',
        });
        expect(mocks.getDailySteps).toHaveBeenCalledTimes(2);
        expect(mocks.markReauthorizationRequired).toHaveBeenCalledWith(
            'user-1',
            CLAIM_ID,
            'unauthorized_after_refresh',
        );
    });

    it('更新トークンがない場合、再認証が必要な状態として記録する', async () => {
        const reader = createGoogleHealthStepReader(
            {
                ...connection,
                refreshToken: null,
            },
            CLAIM_ID,
        );

        await expect(reader.read('2026-06-01', '2026-06-01')).rejects.toMatchObject({
            code: 'GOOGLE_HEALTH_REAUTHORIZATION_REQUIRED',
        });
        expect(mocks.markReauthorizationRequired).toHaveBeenCalledWith(
            'user-1',
            CLAIM_ID,
            'missing_refresh_token',
        );
        expect(mocks.getDailySteps).not.toHaveBeenCalled();
    });

    it('更新トークンが無効な場合だけ、再認証が必要な状態として記録する', async () => {
        mocks.refreshAccessToken.mockRejectedValue(new GoogleHealthApiError(
            'Token request failed',
            400,
            'invalid_grant',
        ));
        const reader = createGoogleHealthStepReader(connection, CLAIM_ID);

        await expect(reader.read('2026-06-01', '2026-06-01')).rejects.toMatchObject({
            code: 'GOOGLE_HEALTH_REAUTHORIZATION_REQUIRED',
        });
        expect(mocks.markReauthorizationRequired).toHaveBeenCalledWith(
            'user-1',
            CLAIM_ID,
            'invalid_grant',
        );
    });

    it('Google側の一時障害では接続状態を変更せず、次回同期で再試行可能にする', async () => {
        const transientError = new GoogleHealthApiError(
            'Token request failed',
            503,
        );
        mocks.refreshAccessToken.mockRejectedValue(transientError);
        const reader = createGoogleHealthStepReader(connection, CLAIM_ID);

        await expect(
            reader.read('2026-06-01', '2026-06-01'),
        ).rejects.toBe(transientError);
        expect(mocks.markReauthorizationRequired).not.toHaveBeenCalled();
    });

    it('更新済みトークンのDB保存失敗では再認証状態に変更しない', async () => {
        const databaseError = new Error('Database unavailable');
        mocks.updateTokens.mockRejectedValue(databaseError);
        const reader = createGoogleHealthStepReader(connection, CLAIM_ID);

        await expect(
            reader.read('2026-06-01', '2026-06-01'),
        ).rejects.toBe(databaseError);
        expect(mocks.markReauthorizationRequired).not.toHaveBeenCalled();
        expect(mocks.getDailySteps).not.toHaveBeenCalled();
    });
});
