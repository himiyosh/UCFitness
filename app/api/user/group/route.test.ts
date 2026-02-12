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

describe('POST /api/user/group - Security Validation', () => {
  const mockUser = { id: 'user-123' };
  const mockSession = { user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).mockResolvedValue(mockSession);
  });

  it('should allow adding a group with valid name', async () => {
    // Mock existing group check (not found)
    const selectMock = vi.fn().mockResolvedValue({ data: null });
    const insertMock = vi.fn().mockResolvedValue({ data: { id: 'group-123' }, error: null });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock sync legacy array
    const membershipsMock = vi.fn().mockResolvedValue({ data: [] });
    const userUpdateMock = vi.fn().mockResolvedValue({ error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectMock }) }),
          insert: () => ({ select: () => ({ single: insertMock }) }),
        };
      }
      if (table === 'group_members') {
        return {
          upsert: () => ({ select: () => ({ single: upsertMock }) }),
          select: () => ({ eq: membershipsMock }),
          delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
        keyword: 'valid-group',
        name: 'Valid Name',
      }),
    });

    const response = await POST(request);

    // Debugging
    if (response.status !== 200) {
      const body = await response.json();
      console.error('Add Group Failed:', body);
    }

    expect(response.status).toBe(200);
  });

  it('should reject adding a group with a very long name', async () => {
    // Mock existing group check (not found)
    const selectMock = vi.fn().mockResolvedValue({ data: null });
    // Should NOT reach insert if validation fails
    const insertMock = vi.fn().mockResolvedValue({ data: { id: 'group-123' }, error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectMock }) }),
          insert: () => ({ select: () => ({ single: insertMock }) }),
        };
      }
      return {};
    });

    const longName = 'a'.repeat(51); // 51 chars, limit should be 50

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'add',
        keyword: 'valid-group',
        name: longName,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/too long/i);
  });

  it('should reject update_metadata with very long name', async () => {
    // Mock finding group
    const selectGroupMock = vi.fn().mockResolvedValue({ data: { id: 'group-123' } });
    // Mock checking ownership - FIXED return structure
    const selectMemberMock = vi.fn().mockResolvedValue({ data: { role: 'OWNER' } });
    const updateMock = vi.fn().mockResolvedValue({ error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectGroupMock }) }),
          update: () => ({ eq: updateMock }),
        };
      }
      if (table === 'group_members') {
         return {
          select: () => ({ eq: () => ({ eq: () => ({ single: selectMemberMock }) }) }),
        };
      }
      return {};
    });

    const longName = 'a'.repeat(51);

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update_metadata',
        keyword: 'valid-group',
        name: longName,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/too long/i);
  });

  it('should reject update_metadata with invalid image_url protocol', async () => {
    // Mock finding group
    const selectGroupMock = vi.fn().mockResolvedValue({ data: { id: 'group-123' } });
    // Mock checking ownership - FIXED return structure
    const selectMemberMock = vi.fn().mockResolvedValue({ data: { role: 'OWNER' } });
    const updateMock = vi.fn().mockResolvedValue({ error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectGroupMock }) }),
          update: () => ({ eq: updateMock }),
        };
      }
      if (table === 'group_members') {
         return {
          select: () => ({ eq: () => ({ eq: () => ({ single: selectMemberMock }) }) }),
        };
      }
      return {};
    });

    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update_metadata',
        keyword: 'valid-group',
        image_url: 'javascript:alert(1)',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/invalid image url/i);
  });
});
