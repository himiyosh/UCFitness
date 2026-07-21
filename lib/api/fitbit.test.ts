import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    getFitbitActivityTimeSeriesByDateRange,
    getFitbitSteps,
    refreshFitbitToken,
} from '@/lib/api/fitbit';

const fetchMock = vi.fn<typeof fetch>();

function fitbitResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('Fitbit API retry behavior', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('429と5xxを1秒・2秒・4秒で再試行して回復する', async () => {
        const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        fetchMock
            .mockResolvedValueOnce(fitbitResponse(429, {}))
            .mockResolvedValueOnce(fitbitResponse(503, {}))
            .mockRejectedValueOnce(new TypeError('network unavailable'))
            .mockResolvedValueOnce(fitbitResponse(200, { summary: { steps: 4321 } }));

        const result = getFitbitSteps('access-token', '2026-07-19');
        await vi.runAllTimersAsync();

        await expect(result).resolves.toBe(4321);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(timeoutSpy.mock.calls.map(([, delay]) => delay)).toEqual([
            1000,
            2000,
            4000,
        ]);
    });

    it('再試行可能な応答が続いた場合は3回の再試行後に失敗する', async () => {
        fetchMock.mockResolvedValue(fitbitResponse(503, {}));

        const result = expect(getFitbitSteps('access-token')).rejects.toMatchObject({
            message: 'Fitbit API error: 503',
            code: 'FITBIT_API_RETRY_EXHAUSTED',
            context: { status: 503, attempts: 4 },
        });
        await vi.runAllTimersAsync();

        await result;
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('401は再試行せずトークン更新の呼び出し側へ返す', async () => {
        fetchMock.mockResolvedValueOnce(fitbitResponse(401, {}));

        await expect(getFitbitSteps('access-token')).rejects.toThrow(
            'Fitbit API error: 401',
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('日付範囲の歩数取得にも同じ再試行契約を適用する', async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError('temporary network failure'))
            .mockResolvedValueOnce(fitbitResponse(200, {
                'activities-steps': [{ dateTime: '2026-07-19', value: '3210' }],
            }));

        const result = getFitbitActivityTimeSeriesByDateRange(
            'access-token',
            '2026-07-19',
            '2026-07-19',
        );
        await vi.runAllTimersAsync();

        await expect(result).resolves.toEqual([
            { dateTime: '2026-07-19', value: '3210' },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('refresh token POSTは再試行しない', async () => {
        vi.stubEnv('FITBIT_CLIENT_ID', 'client-id');
        vi.stubEnv('FITBIT_CLIENT_SECRET', 'client-secret');
        fetchMock.mockResolvedValueOnce(fitbitResponse(503, {}));

        await expect(refreshFitbitToken('refresh-token')).rejects.toThrow(
            'Failed to refresh Fitbit token: 503',
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
