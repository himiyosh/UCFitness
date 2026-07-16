import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { mockQueryResult } from '@/lib/__tests__/test-utils/supabase-query-mock';

// Mock dependencies
const { mockAuth, mockFrom, mockReportError } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockReportError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/errors', () => ({
  reportError: mockReportError,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

describe('POST /api/user/group - Security Validation', () => {
  const mockUser = { id: 'user-123' };
  const mockSession = { user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
  });

  it('should allow adding a group with valid name', async () => {
    // Mock existing group check (not found)
    const selectMock = vi.fn().mockResolvedValue({ data: null });
    const insertMock = vi.fn().mockResolvedValue({ data: { id: 'group-123' }, error: null });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock sync legacy array
    const userUpdateMock = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({ eq: () => ({ single: selectMock }) }),
          insert: () => ({ select: () => ({ single: insertMock }) }),
        };
      }
      if (table === 'group_members') {
        return {
          upsert: () => ({ select: () => ({ single: upsertMock }) }),
          select: () => ({ eq: () => mockQueryResult([]) }),
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

    mockFrom.mockImplementation((table: string) => {
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

    mockFrom.mockImplementation((table: string) => {
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

    mockFrom.mockImplementation((table: string) => {
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

  interface LegacyUpdate {
    userId: string;
    keywords: string[];
  }

  interface DeleteGroupMockOptions {
    membersError?: unknown;
    remainingError?: unknown;
    updateErrorUserId?: string;
  }

  function setupDeleteGroupMocks(options: DeleteGroupMockOptions = {}) {
    const members = [
      { user_id: 'member-1' },
      { user_id: 'member-2' },
      { user_id: 'member-1' },
    ];
    const remainingMemberships = [
      { user_id: 'member-1', groups: { keyword: 'alpha' } },
      { user_id: 'member-1', groups: [{ keyword: 'beta' }] },
      { user_id: 'member-2', groups: null },
    ];
    const remainingIn = vi.fn(() => mockQueryResult(
      options.remainingError ? null : remainingMemberships,
      options.remainingError ?? null,
    ));
    const deleteGroup = vi.fn(() => mockQueryResult(null));
    const legacyUpdates: LegacyUpdate[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'group-123',
                  image_url: null,
                  header_image_url: null,
                },
                error: null,
              }),
            }),
          }),
          delete: () => ({
            eq: deleteGroup,
          }),
        };
      }
      if (table === 'group_members') {
        return {
          select: (columns: string) => {
            if (columns === 'role') {
              return {
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({
                      data: { role: 'OWNER' },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            if (columns === 'user_id') {
              return {
                eq: () => mockQueryResult(
                  options.membersError ? null : members,
                  options.membersError ?? null,
                ),
              };
            }
            if (columns === 'user_id, groups(keyword)') {
              return {
                in: remainingIn,
              };
            }
            return {
              eq: (_column: string, memberId: string) => mockQueryResult(
                options.remainingError
                  ? null
                  : remainingMemberships
                    .filter((row) => row.user_id === memberId)
                    .map(({ groups }) => ({ groups })),
                options.remainingError ?? null,
              ),
            };
          },
        };
      }
      if (table === 'users') {
        return {
          update: (payload: { group_keyword: string[] }) => ({
            eq: async (_column: string, memberId: string) => {
              legacyUpdates.push({
                userId: memberId,
                keywords: payload.group_keyword,
              });
              return {
                error: memberId === options.updateErrorUserId
                  ? { message: 'update unavailable' }
                  : null,
              };
            },
          }),
        };
      }
      return {};
    });

    return { deleteGroup, legacyUpdates, remainingIn };
  }

  it('delete_group_削除後の残存membershipを一括取得し、影響ユーザーだけを1回ずつ同期する', async () => {
    const { legacyUpdates, remainingIn } = setupDeleteGroupMocks();
    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete_group',
        keyword: 'deleting-group',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(remainingIn).toHaveBeenCalledTimes(1);
    expect(remainingIn).toHaveBeenCalledWith('user_id', ['member-1', 'member-2']);
    expect(legacyUpdates).toEqual([
      { userId: 'member-1', keywords: ['alpha', 'beta'] },
      { userId: 'member-2', keywords: [] },
    ]);
  });

  it('delete_group_残存membership取得失敗時、削除成功を維持して部分障害を記録する', async () => {
    const readError = { message: 'memberships unavailable' };
    const { legacyUpdates } = setupDeleteGroupMocks({ remainingError: readError });
    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete_group',
        keyword: 'deleting-group',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(legacyUpdates).toEqual([]);
    expect(mockReportError).toHaveBeenCalledWith(
      'user/group:delete_group:legacy_memberships',
      readError,
      { groupId: 'group-123' },
    );
  });

  it('delete_group_削除前のメンバー取得失敗時は削除せず5xxを返す', async () => {
    const readError = { message: 'members unavailable' };
    const { deleteGroup, legacyUpdates } = setupDeleteGroupMocks({
      membersError: readError,
    });
    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete_group',
        keyword: 'deleting-group',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(deleteGroup).not.toHaveBeenCalled();
    expect(legacyUpdates).toEqual([]);
    expect(mockReportError).toHaveBeenCalledWith(
      'user/group:delete_group:members',
      readError,
      { groupId: 'group-123' },
    );
  });

  it('delete_group_一部ユーザー更新失敗時、他ユーザー同期と削除成功を維持して記録する', async () => {
    const { legacyUpdates } = setupDeleteGroupMocks({
      updateErrorUserId: 'member-2',
    });
    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete_group',
        keyword: 'deleting-group',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(legacyUpdates).toHaveLength(2);
    expect(mockReportError).toHaveBeenCalledWith(
      'user/group:delete_group:legacy_update',
      { message: 'update unavailable' },
      { groupId: 'group-123', memberId: 'member-2' },
    );
  });
});
