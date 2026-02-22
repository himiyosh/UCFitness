import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('POST /api/user/group - Private Group Security', () => {
  const mockUser = { id: 'user-123' };
  const mockSession = { user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).mockResolvedValue(mockSession);
  });

  it('should prevent joining a private group via "add" action', async () => {
    // Mock existing PRIVATE group
    const privateGroup = { id: 'group-private', is_public: false };
    const selectMock = vi.fn().mockResolvedValue({ data: privateGroup });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock memberships fetch to update user.group_keyword
    const membershipsMock = vi.fn().mockResolvedValue({ data: [] });
    const userUpdateMock = vi.fn().mockResolvedValue({ error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          // The query should request `is_public` ideally, but current implementation requests only `id`.
          // We mock it to return `is_public: false` assuming the db call returns it if requested.
          select: () => ({ eq: () => ({ single: selectMock }) }),
        };
      }
      if (table === 'group_members') {
        return {
          upsert: () => ({ select: () => ({ single: upsertMock }) }),
          select: () => ({ eq: membershipsMock }),
        };
      }
      if (table === 'users') {
        return {
          update: () => ({ eq: userUpdateMock }),
        };
      }
      return {};
    });

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'private-group',
      }),
    });

    const response = await POST(request);

    // Should return 403 Forbidden
    if (response.status === 200) {
      console.error('VULNERABILITY CONFIRMED: Private group was joined successfully.');
    }

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/private/i);
  });
});
