import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    cookies: vi.fn(),
    exchangeAuthorizationCode: vi.fn(),
    getIdentity: vi.fn(),
    isEnabled: vi.fn(),
    reportError: vi.fn(),
    revokeToken: vi.fn(),
    saveConnection: vi.fn(),
    verifyMigrationIdentity: vi.fn(),
}));

vi.mock('next/headers', () => ({
    cookies: mocks.cookies,
}));

vi.mock('@/lib/api/google-health', () => ({
    exchangeGoogleHealthAuthorizationCode: mocks.exchangeAuthorizationCode,
    getGoogleHealthIdentity: mocks.getIdentity,
    isGoogleHealthEnabled: mocks.isEnabled,
    revokeGoogleHealthToken: mocks.revokeToken,
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/errors')>();
    return {
        ...actual,
        reportError: mocks.reportError,
    };
});

vi.mock('@/lib/services/fitness-connection-service', () => ({
    saveGoogleHealthConnection: mocks.saveConnection,
    verifyGoogleHealthMigrationIdentity: mocks.verifyMigrationIdentity,
}));

import {
    createGoogleHealthOAuthState,
    GOOGLE_HEALTH_OAUTH_STATE_COOKIE,
    GOOGLE_HEALTH_RETURN_TO_COOKIE,
} from '@/lib/google-health-oauth';

import { GET } from './route';

function createRequest(query: string): NextRequest {
    return new NextRequest(
        `http://localhost:3000/api/health-connections/google/callback?${query}`,
    );
}

describe('GET /api/health-connections/google/callback', () => {
    const previousNextAuthSecret = process.env.NEXTAUTH_SECRET;
    let expectedState: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        process.env.NEXTAUTH_SECRET = 'test-next-auth-secret';
        expectedState = await createGoogleHealthOAuthState('user-1');
        mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
        mocks.cookies.mockResolvedValue({
            get: vi.fn((name: string) => {
                if (name === GOOGLE_HEALTH_OAUTH_STATE_COOKIE) {
                    return { value: expectedState };
                }
                if (name === GOOGLE_HEALTH_RETURN_TO_COOKIE) {
                    return { value: '/ja/settings' };
                }
                return undefined;
            }),
        });
        mocks.exchangeAuthorizationCode.mockResolvedValue({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 3600,
            scopes: ['https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly'],
            tokenType: 'Bearer',
        });
        mocks.getIdentity.mockResolvedValue({
            healthUserId: 'health-user-1',
            legacyUserId: 'legacy-user-1',
        });
        mocks.isEnabled.mockReturnValue(true);
        mocks.revokeToken.mockResolvedValue(undefined);
        mocks.saveConnection.mockResolvedValue(undefined);
        mocks.verifyMigrationIdentity.mockResolvedValue(undefined);
    });

    afterEach(() => {
        if (previousNextAuthSecret === undefined) {
            delete process.env.NEXTAUTH_SECRET;
        } else {
            process.env.NEXTAUTH_SECRET = previousNextAuthSecret;
        }
    });

    it('プロバイダーエラーより先にOAuth stateを検証する', async () => {
        const response = await GET(
            createRequest('error=access_denied&state=unexpected-state'),
        );

        expect(response.headers.get('location')).toContain('health=invalid_state');
        expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled();
    });

    it('トークン取得後に接続保存が失敗した場合、付与済み権限を失効する', async () => {
        mocks.saveConnection.mockRejectedValue(new Error('Database unavailable'));

        const response = await GET(
            createRequest(`code=authorization-code&state=${expectedState}`),
        );

        expect(mocks.revokeToken).toHaveBeenCalledWith('refresh-token');
        expect(response.headers.get('location')).toContain('health=connection_failed');
    });

    it('接続保存に成功した場合、トークンを失効しない', async () => {
        const response = await GET(
            createRequest(`code=authorization-code&state=${expectedState}`),
        );

        expect(mocks.revokeToken).not.toHaveBeenCalled();
        expect(response.headers.get('location')).toContain('health=connected');
    });

    it('OAuth開始後に別ユーザーへ切り替わった場合、接続を拒否する', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'user-2' } });

        const response = await GET(
            createRequest(`code=authorization-code&state=${expectedState}`),
        );

        expect(response.headers.get('location')).toContain('health=invalid_state');
        expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled();
        expect(mocks.saveConnection).not.toHaveBeenCalled();
    });
});
