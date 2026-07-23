import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), getPersonalAnalytics: vi.fn(), reportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/services/analytics-service', () => ({ getPersonalAnalytics: mocks.getPersonalAnalytics }));

import { GET } from '@/app/api/user/analytics/route';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ANALYTICS_RESULT = { dailyAverage: 1_000 };

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
        expect([response.status, mocks.getPersonalAnalytics.mock.calls.length]).toEqual([401, 0]);
    });

    it.each<[string | undefined, number]>([
        [undefined, 3], ['1', 1], ['12', 12], ['+3', 3],
    ])('months="%s"の場合、分析サービスへ%dを渡す', async (value, expected) => {
        const response = await GET(request(value));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(ANALYTICS_RESULT);
        expect(mocks.getPersonalAnalytics).toHaveBeenCalledWith(USER_ID, expected);
    });

    it.each([
        '', ' ', '0', '13', '99', '-1', '3invalid', '3.5', '3e0', '0x3',
        '9007199254740992',
    ])('monthsが不正な値"%s"の場合、サービスを呼ばず400を返す', async (months) => {
        const response = await GET(request(months));
        expect([response.status, await response.json(), mocks.getPersonalAnalytics.mock.calls.length])
            .toEqual([400, { error: 'Invalid months parameter' }, 0]);
    });

    it('分析サービスが失敗した場合、内部詳細を露出せず500を返す', async () => {
        const sensitiveDetail = 'sensitive-database-detail';
        mocks.getPersonalAnalytics.mockRejectedValue(new Error(sensitiveDetail));
        const response = await GET(request('3'));
        const payload = await response.json();
        expect([response.status, payload]).toEqual([500, { error: 'Internal Server Error' }]);
        expect(JSON.stringify([payload, ...mocks.reportError.mock.calls])).not.toContain(sensitiveDetail);
        expect(mocks.reportError).toHaveBeenCalledWith('analytics-fetch',
            expect.objectContaining({ message: 'Failed to fetch analytics' }),
            { code: 'ANALYTICS_FETCH_FAILED' });
    });
});
