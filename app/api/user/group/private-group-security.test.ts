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

describe('POST /api/user/group - Private Group Security', () => {
  const mockUser = { id: 'user-123' };
  const mockSession = { user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).mockResolvedValue(mockSession);
  });

  it('should REJECT joining a private group via keyword', async () => {
    // Mock existing group check (found, and is PRIVATE)
    const existingPrivateGroup = { id: 'group-private', is_public: false };

    const selectMock = vi.fn().mockResolvedValue({ data: existingPrivateGroup });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock sync legacy array
    const membershipsMock = vi.fn().mockResolvedValue({ data: [] });
    const userUpdateMock = vi.fn().mockResolvedValue({ error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          // Note: Current implementation only selects 'id', so we need to ensure the fix selects 'is_public' too
          // But for now, let's see if the test passes if we return is_public even if not explicitly requested?
          // No, Supabase mock needs to return what the code asks for.
          // The CURRENT code asks for: .select('id')
          // So if we mock it returning { id: '...', is_public: false }, the current code will just ignore is_public
          // and proceed to add the user.
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

    // We expect this to be 403 Forbidden because it's a private group
    // But currently it will be 200 OK because the check is missing
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/private/i);
  });
});
