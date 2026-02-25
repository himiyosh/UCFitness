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

  it('should prevent joining a private group via keyword', async () => {
    // Mock existing PRIVATE group
    const privateGroup = { id: 'group-private', is_public: false };
    const selectMock = vi.fn().mockResolvedValue({ data: privateGroup });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectMock }) }),
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

    // Expect 403 Forbidden
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/private group/i);
  });

  it('should allow joining a public group via keyword', async () => {
    // Mock existing PUBLIC group
    const publicGroup = { id: 'group-public', is_public: true };
    const selectMock = vi.fn().mockResolvedValue({ data: publicGroup });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock sync legacy array
    const membershipsMock = vi.fn().mockResolvedValue({ data: [] });
    const userUpdateMock = vi.fn().mockResolvedValue({ error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
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
        keyword: 'public-keyword',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});
