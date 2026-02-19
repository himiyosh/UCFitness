import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/user/group/route';

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
    auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } })
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn((data: any, options: any) => ({
            status: options?.status || 200,
            json: async () => data,
            ...data
        }))
    }
}));

describe('POST /api/user/group - Join Security (Private Groups)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Helper for chainable mocks
    const createChain = (data: any = {}) => ({
        select: () => createChain(data),
        eq: () => createChain(data),
        single: () => Promise.resolve({ data }),
        insert: () => Promise.resolve({ error: null }),
        update: () => Promise.resolve({ error: null }),
        delete: () => Promise.resolve({ error: null }),
        upsert: () => Promise.resolve({ error: null }),
        filter: () => createChain(data),
        then: (resolve: any) => resolve({ data, error: null })
    });

    const setupGroupMock = (isPublic: boolean, isMember: boolean) => {
        mockFrom.mockImplementation((table: string) => {
            if (table === 'groups') {
                return {
                    select: (cols: string) => ({
                        eq: (col: string, val: string) => ({
                            single: () => {
                                // Simulate group exists with keyword 'private-group' or 'public-group'
                                return Promise.resolve({
                                    data: {
                                        id: 'group-id',
                                        is_public: isPublic
                                    }
                                });
                            }
                        })
                    })
                };
            }
            if (table === 'group_members') {
                return {
                    select: (cols: string) => ({
                         eq: (col1: string, val1: string) => ({
                             eq: (col2: string, val2: string) => ({
                                 single: () => {
                                     // Check membership
                                     if (table === 'group_members' && isMember) {
                                         return Promise.resolve({ data: { id: 'member-id', role: 'MEMBER' } });
                                     }
                                     return Promise.resolve({ data: null });
                                 }
                             })
                         })
                    }),
                    upsert: () => Promise.resolve({ error: null }),
                    insert: () => Promise.resolve({ error: null }) // For invite
                };
            }
            if (table === 'users') {
                 return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
            }

            return createChain();
        });
    };

    it('should ALLOW joining a PUBLIC group', async () => {
        setupGroupMock(true, false); // Public, Not a member

        const req = new Request('http://localhost/api/user/group', {
            method: 'POST',
            body: JSON.stringify({
                action: 'add',
                keyword: 'public-group'
            })
        });

        const res = await POST(req);
        // The current implementation returns 200.
        expect(res.status).toBe(200);
    });

    it('should REJECT joining a PRIVATE group if NOT a member', async () => {
        setupGroupMock(false, false); // Private, Not a member

        const req = new Request('http://localhost/api/user/group', {
            method: 'POST',
            body: JSON.stringify({
                action: 'add',
                keyword: 'private-group'
            })
        });

        const res = await POST(req);
        // This should fail (403) but currently returns 200 (Vulnerability).
        const data = await res.json();

        // Asserting failure (Vulnerability Confirmation)
        // Once fixed, this test should pass with 403.
        expect(res.status).toBe(403);
        expect(data.error).toMatch(/private/i);
    });

    it('should ALLOW joining (refreshing) a PRIVATE group if ALREADY a member', async () => {
        setupGroupMock(false, true); // Private, Already a member

        const req = new Request('http://localhost/api/user/group', {
            method: 'POST',
            body: JSON.stringify({
                action: 'add',
                keyword: 'private-group'
            })
        });

        const res = await POST(req);
        // Should be allowed (idempotent join)
        expect(res.status).toBe(200);
    });
});
