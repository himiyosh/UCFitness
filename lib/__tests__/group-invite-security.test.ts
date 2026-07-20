import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/user/group/route';
import { mockQueryResult } from '@/lib/__tests__/test-utils/supabase-query-mock';

const {
    mockSupabase,
    mockFrom,
    mockReportError,
    mockMemberInsert,
    mockLegacySelect,
    mockUserUpdate,
} = vi.hoisted(() => {
    const mockFrom = vi.fn();
    const mockSupabase = {
        from: mockFrom,
    };
    return {
        mockSupabase,
        mockFrom,
        mockReportError: vi.fn(),
        mockMemberInsert: vi.fn(),
        mockLegacySelect: vi.fn(),
        mockUserUpdate: vi.fn(),
    };
});

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: mockSupabase
}));

vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'owner-id' } })
}));

vi.mock('@/lib/errors', () => ({
    reportError: mockReportError,
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn(<T extends object>(data: T, options?: { status?: number }) => ({
            status: options?.status || 200,
            json: async () => data,
            ...data
        }))
    }
}));

describe('POST /api/user/group - Invite Security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Helper for chainable mocks
    const createChain = (data: Record<string, unknown> = {}) => ({
        select: () => createChain(data),
        eq: () => createChain(data),
        single: () => Promise.resolve({ data }),
        insert: () => Promise.resolve({ error: null }),
        update: () => Promise.resolve({ error: null }),
        delete: () => Promise.resolve({ error: null }),
        filter: () => createChain(data),
        then: (resolve: (result: { data: Record<string, unknown>; error: null }) => unknown) => resolve({ data, error: null })
    });

    const setupMocks = (followResult: { data: Record<string, unknown> | null; error: unknown }) => {
        mockFrom.mockImplementation((table: string) => {
            if (table === 'groups') {
                return {
                    select: () => ({
                        eq: () => ({ single: () => Promise.resolve({ data: { id: 'group-id' } }) })
                    })
                };
            }
            if (table === 'group_members') {
                return {
                    select: (cols: string) => {
                        // Legacy sync query: .select('groups(keyword)').eq(...)
                        if (cols === 'groups(keyword)') {
                            mockLegacySelect(cols);
                            return {
                                eq: () => mockQueryResult([])
                            };
                        }

                        // Owner check / Member check
                        return {
                            eq: (col1: string, val1: string) => ({
                                eq: (col2: string, val2: string) => ({
                                    single: () => {
                                        // Owner check
                                        if (val1 === 'group-id' && val2 === 'owner-id') {
                                            return Promise.resolve({ data: { role: 'OWNER' } });
                                        }
                                        // Existing member check
                                        return Promise.resolve({ data: null });
                                    }
                                })
                            })
                        };
                    },
                    insert: mockMemberInsert.mockResolvedValue({ error: null })
                };
            }
            if (table === 'user_follows') {
                 return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                single: () => Promise.resolve(followResult)
                            })
                        })
                    })
                };
            }
            if (table === 'users') {
                return {
                    update: mockUserUpdate.mockReturnValue({
                        eq: () => Promise.resolve({ error: null }),
                    }),
                };
            }

            return createChain();
        });
    };

    const createInviteRequest = () => new Request('http://localhost/api/user/group', {
        method: 'POST',
        body: JSON.stringify({
            action: 'invite',
            keyword: 'my-group',
            targetUserId: '550e8400-e29b-41d4-a716-446655440000'
        })
    });

    it('follow照会がPGRST116の場合、招待せず403を返す', async () => {
        setupMocks({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        });

        const res = await POST(createInviteRequest());
        const data = await res.json();

        expect(res.status).toBe(403);
        expect(data.error).toMatch(/must follow/i);
        expect(mockReportError).not.toHaveBeenCalled();
        expect(mockMemberInsert).not.toHaveBeenCalled();
        expect(mockLegacySelect).not.toHaveBeenCalled();
        expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('follow照会がDBエラーの場合、招待せず500を報告する', async () => {
        setupMocks({
            data: null,
            error: { code: '08006', message: 'database unavailable' },
        });

        const res = await POST(createInviteRequest());

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to verify follow relationship' });
        expect(mockReportError).toHaveBeenCalledWith(
            'user/group:invite_follow_lookup',
            expect.objectContaining({ message: 'Invite follow relationship lookup failed' }),
            expect.objectContaining({ userId: 'owner-id', groupId: 'group-id' }),
        );
        expect(mockMemberInsert).not.toHaveBeenCalled();
        expect(mockLegacySelect).not.toHaveBeenCalled();
        expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('follow照会がnull/nullの場合、招待せず500を報告する', async () => {
        setupMocks({ data: null, error: null });

        const res = await POST(createInviteRequest());

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to verify follow relationship' });
        expect(mockReportError).toHaveBeenCalledWith(
            'user/group:invite_follow_lookup',
            expect.objectContaining({
                message: 'Invite follow relationship lookup returned no data without an error',
            }),
            expect.objectContaining({ userId: 'owner-id', groupId: 'group-id' }),
        );
        expect(mockMemberInsert).not.toHaveBeenCalled();
        expect(mockLegacySelect).not.toHaveBeenCalled();
        expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('follow照会成功後、メンバー追加とlegacy同期を実行する', async () => {
        setupMocks({
            data: { id: 'follow-id' },
            error: null,
        });

        const res = await POST(createInviteRequest());
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(mockReportError).not.toHaveBeenCalled();
        expect(mockMemberInsert).toHaveBeenCalledWith({
            group_id: 'group-id',
            user_id: '550e8400-e29b-41d4-a716-446655440000',
            role: 'MEMBER',
        });
        expect(mockLegacySelect).toHaveBeenCalledWith('groups(keyword)');
        expect(mockUserUpdate).toHaveBeenCalledWith({ group_keyword: [] });
    });
});
