import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GlobalRankingMap, UserStats } from '@/lib/services/ranking-service';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    getCachedGlobalRankingMap: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/services/ranking-service', () => ({
    getCachedGlobalRankingMap: mocks.getCachedGlobalRankingMap,
}));

import { GET } from '@/app/api/user/percentile/route';

const VIEWER_ID = 'viewer';

function createStats(
    id: string,
    periods: Partial<Pick<UserStats, 'DAILY' | 'WEEKLY' | 'MONTHLY'>> = {},
): UserStats {
    return {
        users: { id, name: id, image: null, username: id },
        DAILY: periods.DAILY ?? 0,
        WEEKLY: periods.WEEKLY ?? 0,
        MONTHLY: periods.MONTHLY ?? 0,
        YEARLY: 0,
        PREV_DAILY: 0,
        PREV_WEEKLY: 0,
        PREV_MONTHLY: 0,
    };
}

describe('GET /api/user/percentile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: VIEWER_ID } });
    });

    it('同歩数ユーザーが先に格納されていても、同順位として上位人数だけで順位を決める', async () => {
        const rankingMap: GlobalRankingMap = {
            leader: createStats('leader', { DAILY: 200 }),
            tied: createStats('tied', { DAILY: 100 }),
            [VIEWER_ID]: createStats(VIEWER_ID, { DAILY: 100 }),
            inactive: createStats('inactive', { DAILY: 0 }),
        };
        mocks.getCachedGlobalRankingMap.mockResolvedValue(rankingMap);

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.totalUsers).toBe(4);
        expect(payload.percentile.daily).toBe(50);
    });

    it('対象期間が0歩の場合、順位を付けずnullを返す', async () => {
        mocks.getCachedGlobalRankingMap.mockResolvedValue({
            [VIEWER_ID]: createStats(VIEWER_ID),
            active: createStats('active', {
                DAILY: 1_000,
                WEEKLY: 2_000,
                MONTHLY: 3_000,
            }),
        } satisfies GlobalRankingMap);

        const response = await GET();
        const payload = await response.json();

        expect(payload.percentile).toEqual({
            daily: null,
            weekly: null,
            monthly: null,
        });
    });

    it('現在ユーザーがランキングmapに欠測している場合、全期間nullを返す', async () => {
        mocks.getCachedGlobalRankingMap.mockResolvedValue({
            active: createStats('active', {
                DAILY: 1_000,
                WEEKLY: 2_000,
                MONTHLY: 3_000,
            }),
        } satisfies GlobalRankingMap);

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.totalUsers).toBe(1);
        expect(payload.percentile).toEqual({
            daily: null,
            weekly: null,
            monthly: null,
        });
    });
});
