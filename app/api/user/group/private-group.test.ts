import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

describe('POST /api/user/group - Private Group Access Control', () => {
  const mockUserId = 'user-123';
  const mockSession = { user: { id: mockUserId } };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).mockResolvedValue(mockSession);
  });

  it('should prevent non-members from joining a private group', async () => {
    // 1. Mock existing group (private)
    const privateGroupId = 'group-private-1';
    const selectGroupMock = vi.fn().mockResolvedValue({
      data: { id: privateGroupId, is_public: false }
    });

    // 2. Mock checking membership (not a member)
    const selectMemberMock = vi.fn().mockResolvedValue({ data: null });

    // 3. Mock logic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectGroupMock }) }),
        };
      }
      if (table === 'group_members') {
        return {
          select: () => ({
            eq: (col: string, val: string) => {
                // If checking membership (group_id = privateGroupId)
                if (col === 'group_id' && val === privateGroupId) {
                    return { eq: () => ({ single: selectMemberMock }) };
                }
                 // If checking legacy sync (user_id = mockUserId)
                if (col === 'user_id' && val === mockUserId) {
                    return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [] }) }) };
                }
                return { eq: () => ({ single: vi.fn() }) };
            }
          }),
          // Should NOT call insert/upsert if blocked
          upsert: vi.fn(),
        };
      }
      if (table === 'users') {
        return {
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {};
    });

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'private-keyword',
      }),
    });

    const response = await POST(request);

    // Expect failure
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/private/i);
  });

  it('should allow existing members to "join" (idempotent) a private group', async () => {
    // 1. Mock existing group (private)
    const privateGroupId = 'group-private-1';
    const selectGroupMock = vi.fn().mockResolvedValue({
      data: { id: privateGroupId, is_public: false }
    });

    // 2. Mock checking membership (IS a member)
    const selectMemberMock = vi.fn().mockResolvedValue({
      data: { id: 'member-123', role: 'MEMBER' }
    });

    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectGroupMock }) }),
        };
      }
      if (table === 'group_members') {
        return {
          select: () => ({
             eq: (col: string, val: string) => {
                // If checking membership
                if (col === 'group_id' && val === privateGroupId) {
                     return { eq: () => ({ single: selectMemberMock }) };
                }
                // If legacy sync
                if (col === 'user_id' && val === mockUserId) {
                    return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [] }) }) };
                }
                return { eq: () => ({ single: vi.fn() }) };
             }
          }),
          upsert: () => ({ select: () => ({ single: upsertMock }) }), // Should be called or handled
        };
      }
      if (table === 'users') {
        return {
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {};
    });

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'private-keyword',
      }),
    });

    const response = await POST(request);

    // Expect success (or at least not 403)
    expect(response.status).toBe(200);
  });
});
