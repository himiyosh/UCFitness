import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const mocks = vi.hoisted(() => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    }
  }
})

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}));

import { auth } from '@/lib/auth';

describe('POST /api/user/group - Private Group Security', () => {
  const mockUser = { id: 'user-attacker' };
  const mockSession = { user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).mockResolvedValue(mockSession);
  });

  it('should prevent joining a private group via "add" action', async () => {
    // 1. Mock finding the group - it exists and is PRIVATE
    const privateGroup = {
      id: 'group-private-123',
      keyword: 'private-group',
      is_public: false
    };

    const selectGroupMock = vi.fn().mockResolvedValue({ data: privateGroup });

    // 2. Mock upsert (adding member) - should NOT be called if secure
    const upsertMemberMock = vi.fn().mockResolvedValue({ error: null });

    mocks.supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectGroupMock }) }),
        };
      }
      if (table === 'group_members') {
        return {
          upsert: upsertMemberMock,
          select: () => ({ eq: vi.fn().mockResolvedValue({ data: [] }) }), // legacy sync
        };
      }
      if (table === 'users') {
        return {
            update: () => ({ eq: vi.fn().mockResolvedValue({}) })
        }
      }
      return {};
    });

    // 3. Attempt to join via "add" action
    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'private-group',
      }),
    });

    const response = await POST(request);

    // 4. Assertions
    // If vulnerable, it will return 200 and upsert will be called

    if (response.status === 200) {
        console.log('VULNERABILITY CONFIRMED: Allowed joining private group');
    } else {
        console.log('SECURE: Rejected joining private group with status', response.status);
    }

    // We expect it to FAIL (be secure) in the final fix.
    expect(response.status).toBe(403);
    expect(upsertMemberMock).not.toHaveBeenCalled();
  });
});
