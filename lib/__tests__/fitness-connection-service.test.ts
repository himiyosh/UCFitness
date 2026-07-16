import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    decryptFitnessToken: vi.fn(),
    encryptFitnessToken: vi.fn(),
    from: vi.fn(),
    reportError: vi.fn(),
    revokeGoogleHealthToken: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock('@/lib/fitness-token-crypto', () => ({
    decryptFitnessToken: mocks.decryptFitnessToken,
    encryptFitnessToken: mocks.encryptFitnessToken,
}));

vi.mock('@/lib/api/google-health', () => ({
    revokeGoogleHealthToken: mocks.revokeGoogleHealthToken,
}));

vi.mock('@/lib/errors', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/errors')>();
    return {
        ...original,
        reportError: mocks.reportError,
    };
});

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
        rpc: mocks.rpc,
    },
}));

import {
    claimGoogleHealthSync,
    disconnectGoogleHealth,
    getAllGoogleHealthSyncSelections,
    getGoogleHealthSyncSelection,
    markGoogleHealthHistorySynced,
    markGoogleHealthReauthorizationRequired,
    markGoogleHealthSynced,
    releaseGoogleHealthSync,
    saveGoogleHealthConnection,
    updateGoogleHealthTokens,
    verifyGoogleHealthMigrationIdentity,
} from '@/lib/services/fitness-connection-service';

const connectionInput = {
    userId: 'user-1',
    providerUserId: 'health-user-1',
    legacyProviderUserId: 'fitbit-user-1',
    accessToken: 'access-token',
    refreshToken: null,
    accessTokenExpiresAt: 1_800_000_000,
    scopes: ['scope'],
};

function createSelectQuery(result: {
    data: Record<string, unknown> | null;
    error: Error | null;
}): {
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
} {
    const query = {
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue(result),
    };
    query.eq.mockReturnValue(query);
    return query;
}

function createPagedSelectQuery(result: {
    data: Record<string, unknown>[];
    error: Error | null;
}): {
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
} {
    const query = {
        eq: vi.fn(),
        order: vi.fn(),
        range: vi.fn().mockResolvedValue(result),
    };
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    return query;
}

describe('fitness-connection-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.encryptFitnessToken.mockImplementation(
            async (token: string) => `encrypted-${token}`,
        );
        mocks.decryptFitnessToken.mockResolvedValue('refresh-token');
        mocks.revokeGoogleHealthToken.mockResolvedValue(undefined);
        mocks.rpc.mockResolvedValue({ data: null, error: null });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('saveGoogleHealthConnection', () => {
        it('再認可で更新トークンが省略された場合、DBの原子的保存処理へnullを渡す', async () => {
            mocks.rpc.mockResolvedValueOnce({ data: true, error: null });

            await saveGoogleHealthConnection(connectionInput);

            expect(mocks.rpc).toHaveBeenCalledWith(
                'save_google_health_connection',
                expect.objectContaining({
                    p_user_id: 'user-1',
                    p_provider_user_id: 'health-user-1',
                    p_refresh_token_encrypted: null,
                }),
            );
        });

        it('初回接続で更新トークンが得られない場合、接続を保存しない', async () => {
            mocks.rpc.mockResolvedValueOnce({
                data: null,
                error: new Error('Google Health refresh token is required'),
            });

            await expect(
                saveGoogleHealthConnection(connectionInput),
            ).rejects.toMatchObject({
                code: 'GOOGLE_HEALTH_REFRESH_TOKEN_REQUIRED',
            });
        });

        it('新しい更新トークンがある場合、暗号化して原子的保存処理へ渡す', async () => {
            mocks.rpc.mockResolvedValueOnce({ data: true, error: null });

            await saveGoogleHealthConnection({
                ...connectionInput,
                refreshToken: 'new-refresh-token',
            });

            expect(mocks.rpc).toHaveBeenCalledWith(
                'save_google_health_connection',
                expect.objectContaining({
                    p_refresh_token_encrypted: 'encrypted-new-refresh-token',
                }),
            );
        });

        it('DBが以前と異なるGoogle Health IDを検出した場合、アカウント不一致として返す', async () => {
            mocks.rpc.mockResolvedValueOnce({
                data: null,
                error: new Error('Google Health provider identity mismatch'),
            });

            await expect(saveGoogleHealthConnection({
                ...connectionInput,
                refreshToken: 'new-refresh-token',
            })).rejects.toMatchObject({
                code: 'GOOGLE_HEALTH_PROVIDER_IDENTITY_MISMATCH',
            });

            expect(mocks.rpc).toHaveBeenCalledTimes(1);
        });
    });

    describe('Google Health同期リース', () => {
        it('DBリースを取得した場合、履歴同期状態を含む所有権を返す', async () => {
            mocks.rpc.mockResolvedValueOnce({
                data: {
                    acquired: true,
                    historySyncedAt: '2026-06-17T00:00:00.000Z',
                },
                error: null,
            });

            const claim = await claimGoogleHealthSync('user-1');

            expect(claim).toEqual({
                claimId: expect.any(String),
                historySyncedAt: '2026-06-17T00:00:00.000Z',
            });
            expect(mocks.rpc).toHaveBeenCalledWith(
                'claim_google_health_sync',
                {
                    p_user_id: 'user-1',
                    p_claim_id: claim?.claimId,
                },
            );
        });

        it('同じ所有者IDで同期リースを解放する', async () => {
            mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

            await releaseGoogleHealthSync(
                'user-1',
                '11111111-1111-4111-8111-111111111111',
            );

            expect(mocks.rpc).toHaveBeenCalledWith(
                'release_google_health_sync',
                {
                    p_user_id: 'user-1',
                    p_claim_id: '11111111-1111-4111-8111-111111111111',
                },
            );
        });
    });

    describe('verifyGoogleHealthMigrationIdentity', () => {
        it('既存Fitbit IDとGoogle Healthの旧IDが不一致の場合、接続を拒否する', async () => {
            const identityQuery = createSelectQuery({
                data: { provider_account_id: 'different-fitbit-user' },
                error: null,
            });
            mocks.from.mockReturnValueOnce({
                select: vi.fn().mockReturnValue(identityQuery),
            });

            await expect(
                verifyGoogleHealthMigrationIdentity('user-1', 'fitbit-user-1'),
            ).rejects.toMatchObject({
                code: 'GOOGLE_HEALTH_LEGACY_IDENTITY_MISMATCH',
            });
        });

        it('Google Healthに旧IDがない場合、既存Fitbit IDを照会しない', async () => {
            await expect(
                verifyGoogleHealthMigrationIdentity('user-1', null),
            ).resolves.toBeUndefined();
            expect(mocks.from).not.toHaveBeenCalled();
        });
    });

    describe('getGoogleHealthSyncSelection', () => {
        it('単一ユーザーの不正接続行でもFitbit切替を遮断する', async () => {
            const connectionQuery = createSelectQuery({
                data: {
                    user_id: 'user-1',
                    provider_user_id: 'health-user-1',
                    legacy_provider_user_id: null,
                    access_token_encrypted: 'encrypted-access',
                    refresh_token_encrypted: 'encrypted-refresh',
                    access_token_expires_at: 1_800_000_000,
                    scopes: 'invalid',
                    status: 'active',
                    last_error_code: null,
                    last_synced_at: null,
                    history_synced_at: null,
                    connected_at: '2026-06-01T00:00:00.000Z',
                },
                error: null,
            });
            mocks.from.mockReturnValueOnce({
                select: vi.fn().mockReturnValue(connectionQuery),
            });

            await expect(
                getGoogleHealthSyncSelection('user-1'),
            ).resolves.toEqual({
                userId: 'user-1',
                status: 'error',
                connection: null,
            });
            expect(mocks.reportError).toHaveBeenCalledWith(
                'fitnessConnection:parseUserSyncSelection',
                expect.objectContaining({
                    code: 'FITNESS_CONNECTION_INVALID_ROW',
                }),
                { userId: 'user-1' },
            );
        });

        it('再認証待ちの接続がある場合、Fitbitへ切り替えない選択状態を返す', async () => {
            const connectionQuery = createSelectQuery({
                data: {
                    user_id: 'user-1',
                    provider_user_id: 'health-user-1',
                    legacy_provider_user_id: 'fitbit-user-1',
                    access_token_encrypted: 'encrypted-access',
                    refresh_token_encrypted: 'encrypted-refresh',
                    access_token_expires_at: 1_800_000_000,
                    scopes: ['scope'],
                    status: 'reauthorization_required',
                    last_error_code: 'token_refresh_failed',
                    last_synced_at: null,
                    history_synced_at: null,
                    connected_at: '2026-06-01T00:00:00.000Z',
                },
                error: null,
            });
            mocks.from.mockReturnValueOnce({
                select: vi.fn().mockReturnValue(connectionQuery),
            });

            await expect(
                getGoogleHealthSyncSelection('user-1'),
            ).resolves.toEqual({
                userId: 'user-1',
                status: 'reauthorization_required',
                connection: null,
            });
            expect(mocks.decryptFitnessToken).not.toHaveBeenCalled();
        });

        it('明示解除後も履歴移行済み状態を同期選択へ保持する', async () => {
            const connectionQuery = createSelectQuery({
                data: {
                    user_id: 'user-1',
                    provider_user_id: null,
                    legacy_provider_user_id: 'fitbit-user-1',
                    access_token_encrypted: null,
                    refresh_token_encrypted: null,
                    access_token_expires_at: null,
                    scopes: [],
                    status: 'disconnected',
                    last_error_code: null,
                    last_synced_at: '2026-06-17T00:00:00.000Z',
                    history_synced_at: '2026-06-16T00:00:00.000Z',
                    connected_at: '2026-06-01T00:00:00.000Z',
                },
                error: null,
            });
            mocks.from.mockReturnValueOnce({
                select: vi.fn().mockReturnValue(connectionQuery),
            });

            await expect(
                getGoogleHealthSyncSelection('user-1'),
            ).resolves.toEqual({
                userId: 'user-1',
                status: 'disconnected',
                connection: null,
                historySyncedAt: '2026-06-16T00:00:00.000Z',
            });
        });

        it('一括取得した不正接続行を脱落させず、Fitbit切替を遮断する', async () => {
            const pageQuery = createPagedSelectQuery({
                data: [{
                    user_id: 'user-invalid',
                    provider_user_id: 'health-user-invalid',
                    legacy_provider_user_id: null,
                    access_token_encrypted: 'encrypted-access',
                    refresh_token_encrypted: 'encrypted-refresh',
                    access_token_expires_at: 1_800_000_000,
                    scopes: 'invalid',
                    status: 'active',
                    last_error_code: null,
                    last_synced_at: null,
                    history_synced_at: null,
                    connected_at: '2026-06-01T00:00:00.000Z',
                }],
                error: null,
            });
            mocks.from.mockReturnValueOnce({
                select: vi.fn().mockReturnValue(pageQuery),
            });

            await expect(getAllGoogleHealthSyncSelections()).resolves.toEqual([
                {
                    userId: 'user-invalid',
                    status: 'error',
                    connection: null,
                },
            ]);
            expect(mocks.reportError).toHaveBeenCalledWith(
                'fitnessConnection:parseSyncSelection',
                expect.objectContaining({
                    code: 'FITNESS_CONNECTION_INVALID_ROW',
                }),
            );
        });

        it('1ユーザーの復号失敗をシステムエラーへ隔離し、接続状態を書き換えず一括同期を継続する', async () => {
            const rows = [
                {
                    user_id: 'user-broken',
                    provider_user_id: 'health-user-broken',
                    legacy_provider_user_id: null,
                    access_token_encrypted: 'broken-access',
                    refresh_token_encrypted: 'broken-refresh',
                    access_token_expires_at: 1_800_000_000,
                    scopes: ['scope'],
                    status: 'active',
                    last_error_code: null,
                    last_synced_at: null,
                    history_synced_at: null,
                    connected_at: '2026-06-01T00:00:00.000Z',
                },
                {
                    user_id: 'user-valid',
                    provider_user_id: 'health-user-valid',
                    legacy_provider_user_id: null,
                    access_token_encrypted: 'valid-access',
                    refresh_token_encrypted: 'valid-refresh',
                    access_token_expires_at: 1_800_000_000,
                    scopes: ['scope'],
                    status: 'active',
                    last_error_code: null,
                    last_synced_at: null,
                    history_synced_at: '2026-06-02T00:00:00.000Z',
                    connected_at: '2026-06-01T00:00:00.000Z',
                },
            ];
            const pageQuery = createPagedSelectQuery({ data: rows, error: null });
            mocks.from.mockReturnValueOnce({
                select: vi.fn().mockReturnValue(pageQuery),
            });
            mocks.decryptFitnessToken.mockImplementation(async (encrypted: string) => {
                if (encrypted.startsWith('broken-')) {
                    throw new Error('Invalid encrypted token');
                }
                return encrypted === 'valid-access'
                    ? 'valid-access-token'
                    : 'valid-refresh-token';
            });

            await expect(getAllGoogleHealthSyncSelections()).resolves.toEqual([
                {
                    userId: 'user-broken',
                    status: 'error',
                    connection: null,
                },
                {
                    userId: 'user-valid',
                    status: 'active',
                    connection: expect.objectContaining({
                        accessToken: 'valid-access-token',
                        refreshToken: 'valid-refresh-token',
                        historySyncedAt: '2026-06-02T00:00:00.000Z',
                    }),
                },
            ]);
            expect(mocks.rpc).not.toHaveBeenCalled();
            expect(mocks.reportError).toHaveBeenCalledWith(
                'fitnessConnection:decryptSyncSelection',
                expect.any(Error),
                { userId: 'user-broken' },
            );
        });
    });

    describe('Google Health同期所有権付き更新', () => {
        const claimId = '11111111-1111-4111-8111-111111111111';

        it('トークン更新を同期リース所有者に限定する', async () => {
            mocks.rpc.mockResolvedValueOnce({ data: true, error: null });

            await updateGoogleHealthTokens('user-1', claimId, {
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token',
                accessTokenExpiresAt: 1_800_000_000,
                scopes: ['scope'],
            });

            expect(mocks.rpc).toHaveBeenCalledWith(
                'update_google_health_tokens',
                {
                    p_user_id: 'user-1',
                    p_claim_id: claimId,
                    p_access_token_encrypted: 'encrypted-new-access-token',
                    p_refresh_token_encrypted: 'encrypted-new-refresh-token',
                    p_access_token_expires_at: 1_800_000_000,
                    p_scopes: ['scope'],
                },
            );
        });

        it('同期リース喪失後のトークン書き戻しを拒否する', async () => {
            mocks.rpc.mockResolvedValueOnce({ data: false, error: null });

            await expect(updateGoogleHealthTokens('user-1', claimId, {
                accessToken: 'new-access-token',
                refreshToken: null,
                accessTokenExpiresAt: 1_800_000_000,
                scopes: ['scope'],
            })).rejects.toMatchObject({
                code: 'FITNESS_CONNECTION_SYNC_LEASE_LOST',
            });
        });

        it('再認証状態・同期完了・履歴完了を同じリースIDで更新する', async () => {
            mocks.rpc.mockResolvedValue({ data: true, error: null });

            await markGoogleHealthReauthorizationRequired(
                'user-1',
                claimId,
                'invalid_grant',
            );
            await markGoogleHealthSynced('user-1', claimId);
            await markGoogleHealthHistorySynced('user-1', claimId);

            expect(mocks.rpc).toHaveBeenNthCalledWith(
                1,
                'mark_google_health_reauthorization_required',
                {
                    p_user_id: 'user-1',
                    p_claim_id: claimId,
                    p_error_code: 'invalid_grant',
                },
            );
            expect(mocks.rpc).toHaveBeenNthCalledWith(
                2,
                'mark_google_health_synced',
                {
                    p_user_id: 'user-1',
                    p_claim_id: claimId,
                },
            );
            expect(mocks.rpc).toHaveBeenNthCalledWith(
                3,
                'mark_google_health_history_synced',
                {
                    p_user_id: 'user-1',
                    p_claim_id: claimId,
                },
            );
        });
    });

    describe('disconnectGoogleHealth', () => {
        it('解除時にローカル接続を停止してからGoogleトークンを失効させる', async () => {
            mocks.rpc.mockResolvedValueOnce({
                data: {
                    accessTokenEncrypted: 'encrypted-access',
                    refreshTokenEncrypted: 'encrypted-refresh',
                },
                error: null,
            });

            await disconnectGoogleHealth('user-1');

            expect(mocks.rpc).toHaveBeenCalledWith(
                'disconnect_google_health',
                { p_user_id: 'user-1' },
            );
            expect(mocks.decryptFitnessToken).toHaveBeenCalledWith(
                'encrypted-refresh',
                {
                    userId: 'user-1',
                    provider: 'google_health',
                    tokenType: 'refresh',
                },
            );
            expect(mocks.revokeGoogleHealthToken).toHaveBeenCalledWith('refresh-token');
            expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
                mocks.revokeGoogleHealthToken.mock.invocationCallOrder[0],
            );
        });
    });
});
