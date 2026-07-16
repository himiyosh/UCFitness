import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/user/search/route';

const { mockSupabase, mockSelect, mockLimit, mockOr, mockEq, mockFrom, mockILike } = vi.hoisted(() => {
    const mockSelect = vi.fn();
    const mockLimit = vi.fn();
    const mockOr = vi.fn();
    const mockEq = vi.fn();
    const mockFrom = vi.fn();
    const mockILike = vi.fn();

    const mockSupabase = {
        from: mockFrom,
    };

    return { mockSupabase, mockSelect, mockLimit, mockOr, mockEq, mockFrom, mockILike };
});

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: mockSupabase
}));

vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'user-id' } })
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn(<T extends { users?: unknown[] }>(data: T) => ({
            status: 200,
            json: async () => data,
            users: data.users || []
        }))
    }
}));


describe('GET /api/user/search', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup chainable mocks
        mockFrom.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ limit: mockLimit });
        mockLimit.mockReturnValue({ or: mockOr, eq: mockEq, ilike: mockILike });
        mockOr.mockResolvedValue({ data: [], error: null });
        mockEq.mockResolvedValue({ data: [], error: null });
        mockILike.mockResolvedValue({ data: [], error: null });
    });

    it('should NOT search by email (Privacy Fix Verified)', async () => {
        const req = new Request('http://localhost:3000/api/user/search?q=test@example.com');
        await GET(req);

        // Verify that ilike is called for username, NOT for email
        // The fix changed it to search ONLY username
        expect(mockILike).toHaveBeenCalledWith('username', expect.stringContaining('test@example.com'));

        // Verify .or() (which was used for email search previously) is NOT called
        expect(mockOr).not.toHaveBeenCalled();
    });

    it('should search by username', async () => {
        const req = new Request('http://localhost:3000/api/user/search?q=username');
        await GET(req);

        expect(mockILike).toHaveBeenCalledWith('username', expect.stringContaining('username'));
    });
});
