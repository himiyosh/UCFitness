import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/user/group/route';
import { mockQueryResult } from '@/lib/__tests__/test-utils/supabase-query-mock';

const { mockSupabase, mockFrom } = vi.hoisted(() => {
    const mockFrom = vi.fn();
    const mockSupabase = {
        from: mockFrom,
    };
    return { mockSupabase, mockFrom };
});

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: mockSupabase
}));

vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'owner-id' } })
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

    const setupMocks = (isFollowing: boolean) => {
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
                    insert: () => Promise.resolve({ error: null })
                };
            }
            if (table === 'user_follows') {
                 return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                single: () => Promise.resolve({ data: isFollowing ? { id: 'follow-id' } : null })
                            })
                        })
                    })
                };
            }
            if (table === 'users') {
                return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
            }

            return createChain();
        });
    };

    it('should REJECT invite if target user does NOT follow owner', async () => {
        setupMocks(false);

        const req = new Request('http://localhost/api/user/group', {
            method: 'POST',
            body: JSON.stringify({
                action: 'invite',
                keyword: 'my-group',
                targetUserId: '550e8400-e29b-41d4-a716-446655440000'
            })
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(403);
        expect(data.error).toMatch(/must follow/i);
    });

    it('should ALLOW invite if target user follows owner', async () => {
        setupMocks(true);

        const req = new Request('http://localhost/api/user/group', {
            method: 'POST',
            body: JSON.stringify({
                action: 'invite',
                keyword: 'my-group',
                targetUserId: '550e8400-e29b-41d4-a716-446655440001'
            })
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
    });
});
