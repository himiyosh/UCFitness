import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    claimGoogleHealthSync: vi.fn(),
    checkAndAwardBadges: vi.fn(),
    checkAndAwardTitleAchievements: vi.fn(),
    createGoogleHealthStepReader: vi.fn(),
    getAllGoogleHealthSyncSelections: vi.fn(),
    getFitbitActivityTimeSeriesByDateRange: vi.fn(),
    getFitbitSteps: vi.fn(),
    getGoogleHealthSyncSelection: vi.fn(),
    isGoogleHealthEnabled: vi.fn(),
    markGoogleHealthHistorySynced: vi.fn(),
    markGoogleHealthSynced: vi.fn(),
    processCoins: vi.fn(),
    releaseGoogleHealthSync: vi.fn(),
    refreshFitbitToken: vi.fn(),
    reportError: vi.fn(),
    rpc: vi.fn(),
    stepReaderRead: vi.fn(),
    from: vi.fn(),
}));

vi.mock('@/lib/api/fitbit', () => ({
    getFitbitActivityTimeSeriesByDateRange:
        mocks.getFitbitActivityTimeSeriesByDateRange,
    getFitbitSteps: mocks.getFitbitSteps,
    refreshFitbitToken: mocks.refreshFitbitToken,
}));

vi.mock('@/lib/api/google-health', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/api/google-health')>();
    return {
        ...original,
        isGoogleHealthEnabled: mocks.isGoogleHealthEnabled,
    };
});

vi.mock('@/lib/errors', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/errors')>();
    return {
        ...original,
        reportError: mocks.reportError,
    };
});

vi.mock('@/lib/services/fitness-connection-service', () => ({
    claimGoogleHealthSync: mocks.claimGoogleHealthSync,
    getAllGoogleHealthSyncSelections: mocks.getAllGoogleHealthSyncSelections,
    getGoogleHealthSyncSelection: mocks.getGoogleHealthSyncSelection,
    markGoogleHealthHistorySynced: mocks.markGoogleHealthHistorySynced,
    markGoogleHealthSynced: mocks.markGoogleHealthSynced,
    releaseGoogleHealthSync: mocks.releaseGoogleHealthSync,
}));

vi.mock('@/lib/services/google-health-step-source', () => ({
    createGoogleHealthStepReader: mocks.createGoogleHealthStepReader,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
        rpc: mocks.rpc,
    },
}));

vi.mock('@/lib/services/badge-allocator', () => ({
    checkAndAwardBadges: mocks.checkAndAwardBadges,
}));

vi.mock('@/lib/services/coin-service', () => ({
    processCoins: mocks.processCoins,
}));

vi.mock('@/lib/services/title-achievement-service', () => ({
    checkAndAwardTitleAchievements: mocks.checkAndAwardTitleAchievements,
}));

import {
    backfillUserSteps,
    syncUserSteps,
    updateAllUserSteps,
    updateUserSteps,
} from '@/lib/services/step-manager';
import { getJSTDateString } from '@/lib/date-utils';
import { AppError } from '@/lib/errors';

describe('updateUserSteps', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isGoogleHealthEnabled.mockReturnValue(true);
        mocks.claimGoogleHealthSync.mockResolvedValue({
            claimId: '11111111-1111-4111-8111-111111111111',
            historySyncedAt: '2026-06-17T00:00:00.000Z',
        });
        mocks.releaseGoogleHealthSync.mockResolvedValue(undefined);
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'reauthorization_required',
            connection: null,
        });
        mocks.stepReaderRead.mockResolvedValue([]);
        mocks.createGoogleHealthStepReader.mockReturnValue({
            read: mocks.stepReaderRead,
        });
        mocks.rpc.mockImplementation(
            async (functionName: string, parameters: Record<string, unknown>) => (
                functionName === 'upsert_daily_steps_max'
                    || functionName === 'upsert_fitbit_daily_steps_max'
                    ? { data: parameters.p_steps, error: null }
                    : functionName === 'upsert_fitbit_daily_steps_batch'
                        ? {
                            data: Array.isArray(parameters.p_rows)
                                ? parameters.p_rows.length
                                : 0,
                            error: null,
                        }
                    : { data: null, error: null }
            ),
        );
        mocks.getFitbitSteps.mockResolvedValue(1234);
        mocks.from.mockImplementation((table: string) => {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: {
                                id: 'user-1',
                                email: 'user@example.test',
                                provider: 'fitbit',
                                access_token: 'fitbit-access-token',
                                refresh_token: 'fitbit-refresh-token',
                                token_expires_at: Math.floor(Date.now() / 1000) + 3600,
                            },
                            error: null,
                        }),
                    }),
                }),
            };
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('Google Healthが再認証待ちの場合、Fitbitへ暗黙に切り替えない', async () => {
        await expect(updateUserSteps('user-1')).resolves.toBeNull();

        expect(mocks.getFitbitSteps).not.toHaveBeenCalled();
        expect(mocks.refreshFitbitToken).not.toHaveBeenCalled();
    });

    it('Google Healthがエラー状態の場合、Fitbitへ暗黙に切り替えない', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'error',
            connection: null,
        });

        await expect(updateUserSteps('user-1')).resolves.toBeNull();

        expect(mocks.getFitbitSteps).not.toHaveBeenCalled();
    });

    it('Google Healthを明示解除した場合のみ、Fitbitへ戻す', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            connection: null,
        });

        await expect(updateUserSteps('user-1')).resolves.toBe(1234);

        expect(mocks.getFitbitSteps).toHaveBeenCalledTimes(1);
        expect(mocks.rpc).toHaveBeenCalledWith('upsert_fitbit_daily_steps_max', {
            p_user_id: 'user-1',
            p_date: getJSTDateString(),
            p_steps: 1234,
        });
    });

    it.each([
        ['badges', mocks.checkAndAwardBadges],
        ['titles', mocks.checkAndAwardTitleAchievements],
        ['coins', mocks.processCoins],
    ] as const)('%s処理が失敗した場合、保存済み歩数を保持して報酬処理失敗を返す', async (label, dependency) => {
        const today = getJSTDateString();
        const allocationError = new AppError(
            'Allocation failed',
            'ALLOCATION_FAILED',
            { stage: 'allocation' },
        );
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            connection: null,
        });
        dependency.mockRejectedValueOnce(allocationError);

        await expect(syncUserSteps('user-1')).resolves.toEqual({
            code: 'reward_processing_failed',
            source: 'fitbit',
            steps: 1234,
        });

        expect(mocks.checkAndAwardBadges).toHaveBeenCalled();
        expect(mocks.checkAndAwardTitleAchievements).toHaveBeenCalled();
        expect(mocks.processCoins).toHaveBeenCalled();
        expect(mocks.reportError).toHaveBeenCalledWith(
            `processUserSteps:${label}`,
            allocationError,
            {
                userId: 'user-1',
                ...(label === 'coins' ? { steps: 1234, date: today } : {}),
            },
        );
    });

    it('複数の報酬処理が失敗した場合、全失敗を既存operation名で記録する', async () => {
        const badgeError = new Error('Badge allocation failed');
        const coinError = new Error('Coin processing failed');
        const today = getJSTDateString();
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            connection: null,
        });
        mocks.checkAndAwardBadges.mockRejectedValueOnce(badgeError);
        mocks.processCoins.mockRejectedValueOnce(coinError);

        await expect(syncUserSteps('user-1')).resolves.toEqual({
            code: 'reward_processing_failed',
            source: 'fitbit',
            steps: 1234,
        });

        expect(mocks.reportError).toHaveBeenCalledWith(
            'processUserSteps:badges',
            badgeError,
            { userId: 'user-1' },
        );
        expect(mocks.reportError).toHaveBeenCalledWith(
            'processUserSteps:coins',
            coinError,
            { userId: 'user-1', steps: 1234, date: today },
        );
    });

    it('すべての報酬処理が成功した場合、更新成功を返す', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            connection: null,
        });

        await expect(syncUserSteps('user-1')).resolves.toEqual({
            code: 'updated',
            source: 'fitbit',
            steps: 1234,
        });
    });

    it('報酬処理が失敗した場合も、legacy helperは保存済み歩数を返す', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            connection: null,
        });
        mocks.processCoins.mockRejectedValueOnce(new Error('Coin processing failed'));

        await expect(updateUserSteps('user-1')).resolves.toBe(1234);
    });

    it('Fitbitの取得値が保存済み値より小さい場合、DBの最大値を同期結果と報酬へ使う', async () => {
        const today = getJSTDateString();
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            connection: null,
        });
        mocks.getFitbitSteps.mockResolvedValueOnce(4_000);
        mocks.rpc.mockResolvedValueOnce({ data: 5_000, error: null });

        await expect(updateUserSteps('user-1')).resolves.toBe(5_000);

        expect(mocks.rpc).toHaveBeenCalledWith('upsert_fitbit_daily_steps_max', {
            p_user_id: 'user-1',
            p_date: today,
            p_steps: 4_000,
        });
        expect(mocks.processCoins).toHaveBeenCalledWith('user-1', 5_000, today);
    });

    it('再認証待ちを同期成功として返さない', async () => {
        await expect(syncUserSteps('user-1')).resolves.toEqual({
            code: 'reauthorization_required',
            source: 'google_health',
            steps: null,
        });
    });

    it('同期中に恒久的な資格情報失効を検出した場合、再認証待ちとして返す', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        });
        mocks.stepReaderRead.mockRejectedValueOnce(new AppError(
            'Google Health must be reconnected',
            'GOOGLE_HEALTH_REAUTHORIZATION_REQUIRED',
        ));

        await expect(syncUserSteps('user-1')).resolves.toEqual({
            code: 'reauthorization_required',
            source: 'google_health',
            steps: null,
        });
        expect(mocks.reportError).not.toHaveBeenCalledWith(
            'processUserSteps:googleHealth',
            expect.anything(),
            expect.anything(),
        );
    });

    it('履歴移行済みで当日の値が欠測した場合、保存済み歩数を削除しない', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        });

        await expect(updateUserSteps('user-1')).resolves.toBeNull();

        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.getFitbitSteps).not.toHaveBeenCalled();
        expect(mocks.markGoogleHealthSynced).toHaveBeenCalledWith(
            'user-1',
            '11111111-1111-4111-8111-111111111111',
        );
    });

    it('当日の取得値が一時的に減っても、保存済み最大値でコインを再計算する', async () => {
        const today = getJSTDateString();
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        });
        mocks.stepReaderRead.mockResolvedValue([{ date: today, steps: 4_000 }]);
        mocks.rpc.mockResolvedValueOnce({ data: 5_000, error: null });

        await expect(updateUserSteps('user-1')).resolves.toBe(5_000);

        expect(mocks.rpc).toHaveBeenCalledWith('upsert_daily_steps_max', {
            p_user_id: 'user-1',
            p_date: today,
            p_steps: 4_000,
            p_claim_id: '11111111-1111-4111-8111-111111111111',
        });
        expect(mocks.processCoins).toHaveBeenCalledWith('user-1', 5_000, today);
        expect(mocks.releaseGoogleHealthSync).toHaveBeenCalledWith(
            'user-1',
            '11111111-1111-4111-8111-111111111111',
        );
    });

    it('Google Healthの報酬処理が失敗した場合、同期完了を記録してからリースを解放する', async () => {
        const today = getJSTDateString();
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        });
        mocks.stepReaderRead.mockResolvedValue([{ date: today, steps: 4_000 }]);
        mocks.rpc.mockResolvedValueOnce({ data: 5_000, error: null });
        mocks.processCoins.mockRejectedValueOnce(new Error('Coin processing failed'));

        await expect(syncUserSteps('user-1')).resolves.toEqual({
            code: 'reward_processing_failed',
            source: 'google_health',
            steps: 5_000,
        });

        expect(mocks.markGoogleHealthSynced).toHaveBeenCalledWith(
            'user-1',
            '11111111-1111-4111-8111-111111111111',
        );
        expect(mocks.releaseGoogleHealthSync).toHaveBeenCalledWith(
            'user-1',
            '11111111-1111-4111-8111-111111111111',
        );
        expect(mocks.markGoogleHealthSynced.mock.invocationCallOrder[0])
            .toBeLessThan(mocks.processCoins.mock.invocationCallOrder[0]);
        expect(mocks.processCoins.mock.invocationCallOrder[0])
            .toBeLessThan(mocks.releaseGoogleHealthSync.mock.invocationCallOrder[0]);
    });

    it('Google Health履歴同期では前日までの欠測日を0にせず、一度のDB処理で置換する', async () => {
        const today = getJSTDateString();
        const yesterday = new Date(`${today}T00:00:00Z`);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayString = yesterday.toISOString().slice(0, 10);
        mocks.claimGoogleHealthSync.mockResolvedValueOnce({
            claimId: '22222222-2222-4222-8222-222222222222',
            historySyncedAt: null,
        });
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: null,
            },
        });

        await expect(backfillUserSteps('user-1')).resolves.toBeUndefined();

        expect(mocks.stepReaderRead).toHaveBeenCalledTimes(5);
        expect(mocks.stepReaderRead).toHaveBeenLastCalledWith(
            expect.any(String),
            yesterdayString,
        );
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(mocks.rpc).toHaveBeenCalledWith(
            'replace_daily_steps_range',
            expect.objectContaining({
                p_user_id: 'user-1',
                p_end_date: yesterdayString,
                p_rows: [],
                p_claim_id: '22222222-2222-4222-8222-222222222222',
            }),
        );
        expect(mocks.markGoogleHealthHistorySynced).toHaveBeenCalledWith(
            'user-1',
            '22222222-2222-4222-8222-222222222222',
        );
    });

    it('Google Health履歴移行が完了済みの場合、破壊的な履歴置換を繰り返さない', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        });

        await expect(backfillUserSteps('user-1')).resolves.toBeUndefined();

        expect(mocks.stepReaderRead).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.markGoogleHealthHistorySynced).not.toHaveBeenCalled();
    });

    it('別の同期処理がリースを保持している場合、重複同期を開始しない', async () => {
        mocks.claimGoogleHealthSync.mockResolvedValueOnce(null);
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        });

        await expect(updateUserSteps('user-1')).resolves.toBeNull();

        expect(mocks.stepReaderRead).not.toHaveBeenCalled();
        expect(mocks.processCoins).not.toHaveBeenCalled();
        expect(mocks.releaseGoogleHealthSync).not.toHaveBeenCalled();
    });

    it('別の同期処理がリースを保持している場合、進行中として返す', async () => {
        mocks.claimGoogleHealthSync.mockResolvedValueOnce(null);
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        });

        await expect(syncUserSteps('user-1')).resolves.toEqual({
            code: 'sync_in_progress',
            source: 'google_health',
            steps: null,
        });
    });

    it('Google Healthの当日データがない場合、成功ではなくデータなしとして返す', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'active',
            connection: {
                userId: 'user-1',
                providerUserId: 'health-user-1',
                legacyProviderUserId: 'fitbit-user-1',
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        });

        await expect(syncUserSteps('user-1')).resolves.toEqual({
            code: 'no_data',
            source: 'google_health',
            steps: null,
        });
    });

    it('Google Health解除後も移行済み履歴をFitbitの部分upsertで上書きしない', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            historySyncedAt: '2026-06-17T00:00:00.000Z',
            connection: null,
        });

        await expect(backfillUserSteps('user-1')).resolves.toBeUndefined();

        expect(mocks.getFitbitActivityTimeSeriesByDateRange).not.toHaveBeenCalled();
    });

    it('Fitbit履歴をデータソース再検証付きのDB処理で保存する', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            connection: null,
        });
        mocks.getFitbitActivityTimeSeriesByDateRange
            .mockResolvedValueOnce([
                { dateTime: '2026-06-16', value: '4321' },
            ])
            .mockResolvedValueOnce([]);

        await expect(backfillUserSteps('user-1')).resolves.toBeUndefined();

        expect(mocks.rpc).toHaveBeenCalledWith(
            'upsert_fitbit_daily_steps_batch',
            {
                p_user_id: 'user-1',
                p_rows: [{ date: '2026-06-16', steps: 4321 }],
            },
        );
    });

    it('Fitbit履歴の再試行枯渇をデータなしへ変換せず伝播する', async () => {
        mocks.getGoogleHealthSyncSelection.mockResolvedValue({
            userId: 'user-1',
            status: 'disconnected',
            connection: null,
        });
        const retryError = new AppError(
            'Fitbit API error: 503',
            'FITBIT_API_RETRY_EXHAUSTED',
            { status: 503, attempts: 4 },
        );
        mocks.getFitbitActivityTimeSeriesByDateRange.mockRejectedValueOnce(retryError);

        await expect(backfillUserSteps('user-1')).rejects.toBe(retryError);

        expect(mocks.reportError).toHaveBeenCalledWith(
            'backfillUserSteps',
            retryError,
            { userId: 'user-1' },
        );
    });

    it('全ユーザー同期を5ユーザー単位の固定並列バッチで処理する', async () => {
        const users = Array.from({ length: 6 }, (_, index) => ({
            id: `user-${index + 1}`,
            email: `user-${index + 1}@example.test`,
            provider: 'fitbit',
            access_token: 'fitbit-access-token',
            refresh_token: 'fitbit-refresh-token',
            token_expires_at: Math.floor(Date.now() / 1000) + 3600,
        }));
        const selections = users.map((user, index) => ({
            userId: user.id,
            status: 'active' as const,
            connection: {
                userId: user.id,
                providerUserId: `health-user-${index + 1}`,
                legacyProviderUserId: `fitbit-user-${index + 1}`,
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
                scopes: ['scope'],
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            },
        }));
        mocks.from.mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: users, error: null }),
        });
        mocks.getAllGoogleHealthSyncSelections.mockResolvedValue(selections);
        let activeReaders = 0;
        let maxActiveReaders = 0;
        mocks.createGoogleHealthStepReader.mockReturnValue({
            read: vi.fn().mockImplementation(async () => {
                activeReaders++;
                maxActiveReaders = Math.max(maxActiveReaders, activeReaders);
                await new Promise((resolve) => setTimeout(resolve, 0));
                activeReaders--;
                return [];
            }),
        });

        await expect(updateAllUserSteps()).resolves.toBeUndefined();

        expect(maxActiveReaders).toBe(5);
        expect(mocks.claimGoogleHealthSync).toHaveBeenCalledTimes(6);
        expect(mocks.releaseGoogleHealthSync).toHaveBeenCalledTimes(6);
    });
});
