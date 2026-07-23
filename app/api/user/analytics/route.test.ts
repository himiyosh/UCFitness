import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    getPersonalAnalytics: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/services/analytics-service', () => ({
    getPersonalAnalytics: mocks.getPersonalAnalytics,
}));

import { GET } from '@/app/api/user/analytics/route';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ANALYTICS_RESULT = {
    dailyAverage: 1_000,
    weekdayAverages: [1_000, 0, 0, 0, 0, 0, 0],
    bestDay: { date: '2026-07-01', steps: 1_000 },
    monthlyTotals: [],
    currentMonthVsPrev: null,
};

function request(months?: string): Request {
    const query = months === undefined ? '' : `?months=${encodeURIComponent(months)}`;
    return new Request(`http://localhost/api/user/analytics${query}`);
}

describe('GET /api/user/analytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
        mocks.getPersonalAnalytics.mockResolvedValue(ANALYTICS_RESULT);
    });

    it('未認証の場合、分析サービスを呼ばず401を返す', async () => {
        mocks.auth.mockResolvedValue(null);

        const response = await GET(request());

        expect(response.status).toBe(401);
        expect(mocks.getPersonalAnalytics).not.toHaveBeenCalled();
    });

    it('monthsを省略した場合、既定の3か月で分析サービスを呼ぶ', async () => {
        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(ANALYTICS_RESULT);
        expect(mocks.getPersonalAnalytics).toHaveBeenCalledWith(USER_ID, 3);
    });

    it.each([1, 12])(
        'monthsが境界値%dの場合、その値で分析サービスを呼ぶ',
        async (months) => {
            const response = await GET(request(String(months)));

            expect(response.status).toBe(200);
            expect(mocks.getPersonalAnalytics).toHaveBeenCalledWith(USER_ID, months);
        },
    );

    it('monthsが符号付き整数の場合、整数として分析サービスへ渡す', async () => {
        const response = await GET(request('+3'));

        expect(response.status).toBe(200);
        expect(mocks.getPersonalAnalytics).toHaveBeenCalledWith(USER_ID, 3);
    });

    it.each([
        '',
        ' ',
        '0',
        '13',
        '99',
        '-1',
        '3invalid',
        '3.5',
        '3e0',
        '0x3',
        '9007199254740992',
    ])('monthsが不正な値"%s"の場合、サービスを呼ばず400を返す', async (months) => {
        const response = await GET(request(months));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid months parameter' });
        expect(mocks.getPersonalAnalytics).not.toHaveBeenCalled();
    });

    it('分析サービスが失敗した場合、内部詳細を露出せず500を返す', async () => {
        const sensitiveDetail = 'sensitive-database-detail';
        const serviceError = new Error(sensitiveDetail);
        mocks.getPersonalAnalytics.mockRejectedValue(serviceError);

        const response = await GET(request('3'));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload).toEqual({ error: 'Internal Server Error' });
        expect(JSON.stringify(payload)).not.toContain(sensitiveDetail);
        expect(mocks.reportError).toHaveBeenCalledOnce();
        const [, reportedError, context] = mocks.reportError.mock.calls[0];
        expect(reportedError).toBeInstanceOf(Error);
        expect(reportedError).not.toBe(serviceError);
        if (!(reportedError instanceof Error)) {
            throw new Error('Expected reportError to receive an Error');
        }
        expect(reportedError.message).toBe('Failed to fetch analytics');
        expect(reportedError.message).not.toContain(sensitiveDetail);
        expect(context).toEqual({ code: 'ANALYTICS_FETCH_FAILED' });
    });
});
