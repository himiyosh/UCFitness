import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    enrichRankingsWithEquip: vi.fn(),
    from: vi.fn(),
    getGroupRankings: vi.fn(),
    getRankings: vi.fn(),
    groupMaybeSingle: vi.fn(),
    reportError: vi.fn(),
    reportRankingServiceFailure: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: mocks.auth,
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/services/ranking-service', () => ({
    getGroupRankings: mocks.getGroupRankings,
    getRankings: mocks.getRankings,
    reportRankingServiceFailure: mocks.reportRankingServiceFailure,
}));

vi.mock('@/lib/services/ranking-utils', () => ({
    enrichRankingsWithEquip: mocks.enrichRankingsWithEquip,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { GET } from './route';

function createRequest(query: string): Request {
    return new Request(`http://localhost/api/rankings?${query}`);
}

describe('GET /api/rankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
        mocks.getGroupRankings.mockResolvedValue([]);
        mocks.getRankings.mockResolvedValue([]);
        mocks.enrichRankingsWithEquip.mockResolvedValue({ WEEKLY: [] });
        mocks.groupMaybeSingle.mockResolvedValue({
            data: {
                id: 'group-1',
                is_public: true,
                group_members: [{ user_id: 'user-1' }],
            },
            error: null,
        });
        mocks.from.mockImplementation((table: string) => {
            if (table === 'groups') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: mocks.groupMaybeSingle,
                            }),
                        }),
                    }),
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('GROUPスコープでkeywordがない場合、400を返す', async () => {
        const response = await GET(createRequest('scope=GROUP&period=WEEKLY'));

        expect(response.status).toBe(400);
        expect(mocks.getRankings).not.toHaveBeenCalled();
    });

    it('GROUPスコープで非メンバーの場合、403を返してランキングを取得しない', async () => {
        mocks.groupMaybeSingle.mockResolvedValue({
            data: { id: 'group-1', is_public: true, group_members: [] },
            error: null,
        });

        const response = await GET(
            createRequest('scope=GROUP&period=WEEKLY&keyword=walking-club'),
        );

        expect(response.status).toBe(403);
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.getGroupRankings).not.toHaveBeenCalled();
        expect(mocks.getRankings).not.toHaveBeenCalled();
    });

    it('GROUPスコープで私有グループの非メンバーの場合、404を返す', async () => {
        mocks.groupMaybeSingle.mockResolvedValue({
            data: { id: 'group-1', is_public: false, group_members: [] },
            error: null,
        });

        const response = await GET(
            createRequest('scope=GROUP&period=WEEKLY&keyword=private-club'),
        );

        expect(response.status).toBe(404);
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.getGroupRankings).not.toHaveBeenCalled();
        expect(mocks.getRankings).not.toHaveBeenCalled();
    });

    it('GROUPスコープでメンバーの場合、ランキングを返す', async () => {
        const response = await GET(
            createRequest('scope=GROUP&period=WEEKLY&keyword=walking-club'),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual([]);
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.getGroupRankings).toHaveBeenCalledWith(
            'group-1',
            'WEEKLY',
        );
        expect(mocks.getRankings).not.toHaveBeenCalled();
    });

    it('ランキング取得が失敗した場合、専用ログ境界で500を返す', async () => {
        const rawError = new Error('sentinel ranking caller user-id');
        mocks.getRankings.mockRejectedValue(rawError);

        const response = await GET(createRequest('scope=GLOBAL&period=WEEKLY'));

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' });
        expect(mocks.reportRankingServiceFailure).toHaveBeenCalledWith(
            'api:rankings',
            rawError,
        );
        expect(mocks.reportError).not.toHaveBeenCalled();
        expect(mocks.enrichRankingsWithEquip).not.toHaveBeenCalled();
    });
});
