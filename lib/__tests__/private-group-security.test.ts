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

describe('POST /api/user/group - Private Group Security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createChain = (data: any = {}) => ({
        select: () => createChain(data),
        eq: () => createChain(data),
        single: () => Promise.resolve({ data }),
        insert: () => Promise.resolve({ error: null }),
        update: () => Promise.resolve({ error: null }),
        delete: () => Promise.resolve({ error: null }),
        filter: () => createChain(data),
        then: (resolve: any) => resolve({ data, error: null }),
        upsert: () => Promise.resolve({ error: null })
    });

    const setupMocks = (isPublic: boolean) => {
        mockFrom.mockImplementation((table: string) => {
            if (table === 'groups') {
                return {
                    select: () => ({
                        eq: () => ({ single: () => Promise.resolve({ data: { id: 'group-id', is_public: isPublic } }) })
                    })
                };
            }
            if (table === 'group_members') {
                return {
                    select: (cols: string) => {
                        if (cols === 'groups(keyword)') {
                            return {
                                eq: () => ({
                                    then: (resolve: any) => resolve({ data: [] })
                                })
                            };
                        }
                        return createChain();
                    },
                    upsert: () => Promise.resolve({ error: null })
                };
            }
            if (table === 'users') {
                return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
            }

            return createChain();
        });
    };

    it('should REJECT add request for a private group', async () => {
        setupMocks(false); // is_public: false

        const req = new Request('http://localhost/api/user/group', {
            method: 'POST',
            body: JSON.stringify({
                action: 'add',
                keyword: 'secret-group'
            })
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(403);
        expect(data.error).toMatch(/private group/i);
    });

    it('should ALLOW add request for a public group', async () => {
        setupMocks(true); // is_public: true

        const req = new Request('http://localhost/api/user/group', {
            method: 'POST',
            body: JSON.stringify({
                action: 'add',
                keyword: 'public-group'
            })
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
    });
});
