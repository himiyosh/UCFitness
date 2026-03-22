import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/user/percentile/route';
import { auth } from '@/lib/auth';
import { getCachedGlobalRankingMap } from '@/lib/services/ranking-service';

vi.mock('@/lib/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/services/ranking-service', () => ({
    getCachedGlobalRankingMap: vi.fn(),
}));

describe('GET /api/user/percentile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 if unauthorized', async () => {
        vi.mocked(auth).mockResolvedValue(null);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('returns correct percentile using O(N) rank logic', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user2' } } as any);

        // Mock ranking map with 5 users
        vi.mocked(getCachedGlobalRankingMap).mockResolvedValue({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'user1': { DAILY: 10000, WEEKLY: 70000, MONTHLY: 300000 } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'user2': { DAILY: 8000, WEEKLY: 50000, MONTHLY: 200000 } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'user3': { DAILY: 5000, WEEKLY: 30000, MONTHLY: 100000 } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'user4': { DAILY: 12000, WEEKLY: 80000, MONTHLY: 350000 } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'user5': { DAILY: 0, WEEKLY: 0, MONTHLY: 0 } as any,
        });

        const res = await GET();
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.totalUsers).toBe(5);
        expect(data.percentile).toEqual({
            daily: 60,   // rank 3 out of 5
            weekly: 60,  // rank 3 out of 5
            monthly: 60, // rank 3 out of 5
        });
    });

    it('returns null percentiles if user has 0 steps', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user5' } } as any);

        vi.mocked(getCachedGlobalRankingMap).mockResolvedValue({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'user1': { daily: 10000, weekly: 70000, monthly: 300000 } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'user5': { daily: 0, weekly: 0, monthly: 0 } as any,
        });

        const res = await GET();
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.totalUsers).toBe(2);
        expect(data.percentile).toEqual({
            daily: null,
            weekly: null,
            monthly: null,
        });
    });
});
