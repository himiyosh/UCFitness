import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createGoogleHealthAuthorizationUrl,
    exchangeGoogleHealthAuthorizationCode,
    getGoogleHealthDailySteps,
    getGoogleHealthIdentity,
    GoogleHealthApiError,
    isGoogleHealthEnabled,
    refreshGoogleHealthAccessToken,
    revokeGoogleHealthToken,
} from '@/lib/api/google-health';

const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';

describe('google-health-api', () => {
    beforeEach(() => {
        process.env.GOOGLE_HEALTH_ENABLED = 'true';
        process.env.GOOGLE_HEALTH_CLIENT_ID = 'client-id';
        process.env.GOOGLE_HEALTH_CLIENT_SECRET = 'client-secret';
        process.env.GOOGLE_HEALTH_REDIRECT_URI =
            'https://ucfitness.example/api/health-connections/google/callback';
        process.env.FITNESS_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete process.env.GOOGLE_HEALTH_ENABLED;
        delete process.env.GOOGLE_HEALTH_CLIENT_ID;
        delete process.env.GOOGLE_HEALTH_CLIENT_SECRET;
        delete process.env.GOOGLE_HEALTH_REDIRECT_URI;
        delete process.env.FITNESS_TOKEN_ENCRYPTION_KEY;
    });

    it('設定がすべて揃う場合のみ、Google Health機能を有効にする', () => {
        expect(isGoogleHealthEnabled()).toBe(true);

        delete process.env.GOOGLE_HEALTH_CLIENT_SECRET;

        expect(isGoogleHealthEnabled()).toBe(false);
    });

    it('OAuth戻り先が安全なURLでない場合、Google Health機能を有効にしない', () => {
        process.env.GOOGLE_HEALTH_REDIRECT_URI = 'javascript:alert(1)';

        expect(isGoogleHealthEnabled()).toBe(false);
    });

    it('認可URLを生成する場合、最小読み取りスコープと再同意設定を付与する', () => {
        const authorizationUrl = new URL(createGoogleHealthAuthorizationUrl('oauth-state'));

        expect(authorizationUrl.origin).toBe('https://accounts.google.com');
        expect(authorizationUrl.searchParams.get('scope')).toBe(REQUIRED_SCOPE);
        expect(authorizationUrl.searchParams.get('state')).toBe('oauth-state');
        expect(authorizationUrl.searchParams.get('access_type')).toBe('offline');
        expect(authorizationUrl.searchParams.get('include_granted_scopes')).toBe('true');
        expect(authorizationUrl.searchParams.get('prompt')).toBe('consent');
    });

    it('認可コード交換が成功した場合、検証済みトークンセットを返す', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            scope: REQUIRED_SCOPE,
            token_type: 'Bearer',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const tokenSet = await exchangeGoogleHealthAuthorizationCode('authorization-code');

        expect(tokenSet).toEqual({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 3600,
            scopes: [REQUIRED_SCOPE],
            tokenType: 'Bearer',
        });
        const requestBody = String(fetchMock.mock.calls[0][1]?.body);
        expect(requestBody).toContain('code=authorization-code');
        expect(requestBody).toContain('client_secret=client-secret');
    });

    it('認可応答に必須スコープがない場合、接続を拒否する', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            scope: '',
            token_type: 'Bearer',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        await expect(
            exchangeGoogleHealthAuthorizationCode('authorization-code'),
        ).rejects.toMatchObject({
            status: 403,
        });
    });

    it('認可応答のトークン有効期間が不正な場合、接続を拒否する', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: -1,
            scope: REQUIRED_SCOPE,
            token_type: 'Bearer',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        await expect(
            exchangeGoogleHealthAuthorizationCode('authorization-code'),
        ).rejects.toThrow('Google OAuth returned an invalid token response');
    });

    it('認可応答のトークン種別がBearerでない場合、接続を拒否する', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            scope: REQUIRED_SCOPE,
            token_type: 'MAC',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        await expect(
            exchangeGoogleHealthAuthorizationCode('authorization-code'),
        ).rejects.toThrow('Google OAuth returned an invalid token response');
    });

    it('更新トークンが無効な場合、応答本文を露出せず再認証理由を返す', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'sensitive provider detail',
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        })));

        const error = await refreshGoogleHealthAccessToken('secret-refresh-token').catch(
            (caught: unknown) => caught,
        );

        expect(error).toMatchObject({
            status: 400,
            reason: 'invalid_grant',
        });
        expect(String(error)).not.toContain('sensitive provider detail');
        expect(String(error)).not.toContain('secret-refresh-token');
    });

    it('identity応答が不正な場合、プロバイダーIDを受け入れない', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ legacyUserId: 'legacy-user' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        )));

        await expect(getGoogleHealthIdentity('access-token')).rejects.toThrow(
            'Google Health returned an invalid identity response',
        );
    });

    it('identity応答のプロバイダーIDが空の場合、接続を拒否する', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ healthUserId: '', legacyUserId: 'legacy-user' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        )));

        await expect(getGoogleHealthIdentity('access-token')).rejects.toThrow(
            'Google Health returned an invalid identity response',
        );
    });

    it('日次歩数を取得した場合、安全な整数として返す', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            rollupDataPoints: [
                {
                    civilStartTime: {
                        date: { year: 2026, month: 6, day: 1 },
                    },
                    steps: { countSum: '12345' },
                },
            ],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const steps = await getGoogleHealthDailySteps(
            'access-token',
            '2026-06-01',
            '2026-06-02',
        );

        expect(steps).toEqual([{ date: '2026-06-01', steps: 12345 }]);
        const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(requestBody.range.start).toEqual({
            date: {
                year: 2026,
                month: 6,
                day: 1,
            },
        });
        expect(requestBody.range.end.date.day).toBe(3);
    });

    it('歩数データポイントの形式が壊れている場合、履歴を置換できる成功応答として扱わない', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            rollupDataPoints: [
                {
                    civilStartTime: {
                        date: { year: 2026, month: 6, day: 1 },
                    },
                    steps: {},
                },
            ],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        await expect(getGoogleHealthDailySteps(
            'access-token',
            '2026-06-01',
            '2026-06-02',
        )).rejects.toThrow('Google Health returned an invalid steps data point');
    });

    it('正しい空配列の場合、歩数がない期間として受け入れる', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            rollupDataPoints: [],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        await expect(getGoogleHealthDailySteps(
            'access-token',
            '2026-06-01',
            '2026-06-02',
        )).resolves.toEqual([]);
    });

    it('90日を超える日次歩数期間の場合、APIへ送信せず拒否する', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(getGoogleHealthDailySteps(
            'access-token',
            '2026-01-01',
            '2026-04-01',
        )).rejects.toThrow('Google Health rollup range must be between 1 and 90 days');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('APIエラーの場合、応答本文やトークンを例外へ露出しない', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            'sensitive-provider-error-body',
            { status: 401 },
        )));

        const error = await getGoogleHealthIdentity('secret-access-token').catch(
            (caught: unknown) => caught,
        );

        expect(error).toBeInstanceOf(GoogleHealthApiError);
        expect(String(error)).not.toContain('sensitive-provider-error-body');
        expect(String(error)).not.toContain('secret-access-token');
    });

    it('解除時にトークンをURLへ含めずGoogleへ失効要求を送る', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
            status: 200,
        }));
        vi.stubGlobal('fetch', fetchMock);

        await revokeGoogleHealthToken('secret-refresh-token');

        expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/revoke');
        expect(String(fetchMock.mock.calls[0][1]?.body)).toBe(
            'token=secret-refresh-token',
        );
    });
});
