import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const mockSupabase = vi.hoisted(() => ({
    from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: mockSupabase,
}));

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

describe('POST /api/user/group - Join Security', () => {
  const mockUser = { id: 'user-123' };
  const mockSession = { user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).mockResolvedValue(mockSession);
  });

  it('should prevent non-members from joining a private group', async () => {
    // 1. Mock existing group check (Found, is_public = false)
    const privateGroup = { id: 'group-private', is_public: false };

    // 2. Mock member check (Not a member)
    const memberCheck = null;

    // Supabase Chain Mocking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({
              eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: privateGroup })
              })
          }),
        };
      }
      if (table === 'group_members') {
          return {
              select: () => ({
                  eq: (field: string) => {
                      if (field === 'group_id') {
                          return {
                              eq: () => ({
                                  single: vi.fn().mockResolvedValue({ data: memberCheck })
                              })
                          };
                      }
                      return {
                          then: (resolve: any) => resolve({ data: [] })
                      };
                  }
              }),
              upsert: () => ({
                  select: () => ({
                      single: vi.fn().mockResolvedValue({ error: null })
                  })
              }),
          };
      }
      if (table === 'users') {
          return {
              update: () => ({
                  eq: vi.fn().mockResolvedValue({ error: null })
              })
          };
      }
      return {
          select: () => ({ eq: () => ({ single: vi.fn() }) }) // Default
      };
    });

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'private-club',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/private/i);
  });

  it('should allow joining a public group', async () => {
    // 1. Mock existing group check (Found, is_public = true or null/undefined -> usually true)
    // Wait, DB default is usually true? If is_public is true explicitly.
    const publicGroup = { id: 'group-public', is_public: true };

    // Supabase Chain Mocking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({
              eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: publicGroup })
              })
          }),
        };
      }
      if (table === 'group_members') {
          return {
              // upsert MUST run
              upsert: vi.fn().mockReturnValue({
                  select: () => ({
                      single: vi.fn().mockResolvedValue({ error: null })
                  })
              }),
               // Legacy sync select
              select: () => ({
                  eq: () => ({
                      then: (resolve: any) => resolve({ data: [] })
                  }),
                  // member check shouldn't be called for public group (my logic: check only if is_public === false)
                  single: vi.fn().mockResolvedValue({ data: null }) // Should return null if called?
              }),
          };
      }
      if (table === 'users') {
          return {
              update: () => ({
                  eq: vi.fn().mockResolvedValue({ error: null })
              })
          };
      }
      return {
          select: () => ({ eq: () => ({ single: vi.fn() }) }) // Default
      };
    });

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'public-club',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('should allow joining a private group IF ALREADY invited', async () => {
    // 1. Mock existing group check (Found, is_public = false)
    const privateGroup = { id: 'group-private', is_public: false };

    // 2. Mock member check (Already a member/invited)
    const memberCheck = { id: 'member-123' };

    // Supabase Chain Mocking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({
              eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: privateGroup })
              })
          }),
        };
      }
      if (table === 'group_members') {
          return {
              select: () => ({
                  eq: (field: string) => {
                      if (field === 'group_id') {
                          return {
                              eq: () => ({
                                  single: vi.fn().mockResolvedValue({ data: memberCheck })
                              })
                          };
                      }
                      return {
                          then: (resolve: any) => resolve({ data: [] })
                      };
                  }
              }),
              upsert: () => ({
                  select: () => ({
                      single: vi.fn().mockResolvedValue({ error: null })
                  })
              }),
          };
      }
      if (table === 'users') {
          return {
              update: () => ({
                  eq: vi.fn().mockResolvedValue({ error: null })
              })
          };
      }
      return {
          select: () => ({ eq: () => ({ single: vi.fn() }) }) // Default
      };
    });

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'private-club',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});
