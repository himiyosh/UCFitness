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

describe('POST /api/user/group - Private Group Access', () => {
  const mockUser = { id: 'user-123' };
  const mockSession = { user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).mockResolvedValue(mockSession);
  });

  it('should prevent joining a private group via keyword', async () => {
    // Mock existing private group
    const privateGroup = { id: 'group-private', is_public: false };
    const selectMock = vi.fn().mockResolvedValue({ data: privateGroup });

    // Upsert should NOT be called if we block access
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          // Note: Current code only selects 'id', but we mock returning is_public anyway.
          // In real Supabase client, if select('id') is called, only id is returned.
          // But here we want to test if the logic consumes checking is_public.
          // We will update the code to select('id, is_public') later.
          select: () => ({ eq: () => ({ single: selectMock }) }),
        };
      }
      if (table === 'group_members') {
        return {
          upsert: () => ({ select: () => ({ single: upsertMock }) }),
        };
      }
      return {};
    });

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'secret-group',
      }),
    });

    const response = await POST(request);

    // Current behavior: Returns 200 (Success) because no check exists.
    // Expected behavior after fix: Returns 403 (Forbidden).

    // If this test passes now (expect(403)), it means it's ALREADY secure (unexpected).
    // If it fails (expect(403) but gets 200), we confirmed the vulnerability.

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/private/i);
  });

  it('should allow joining a public group via keyword', async () => {
    // Mock existing public group
    const publicGroup = { id: 'group-public', is_public: true };
    const selectMock = vi.fn().mockResolvedValue({ data: publicGroup });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
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
        keyword: 'public-group',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});
