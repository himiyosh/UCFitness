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

  interface DeleteGroupMemberRow {
    user_id: string;
  }

  interface DeleteGroupRemainingMembershipRow {
    user_id: string;
    group_id: string;
    groups: { keyword: string } | Array<{ keyword: string }> | null;
  }

  interface PaginationRequest {
    from: number;
    to: number;
    orderColumns: string[];
    returnedRowCount: number;
    userIds?: string[];
  }

  type TrackedQueryResult<T> = Promise<{ data: T[]; error: unknown }> & {
    returns: () => TrackedQueryResult<T>;
  };

  interface DeleteGroupMockOptions {
    members?: DeleteGroupMemberRow[];
    membersError?: unknown;
    membersErrorFrom?: number;
    remainingMemberships?: DeleteGroupRemainingMembershipRow[];
    remainingError?: unknown;
    remainingErrorFrom?: number;
    updateErrorUserId?: string;
  }

  function setupDeleteGroupMocks(options: DeleteGroupMockOptions = {}) {
    const members = [...(options.members ?? [
      { user_id: 'member-1' },
      { user_id: 'member-2' },
      { user_id: 'member-1' },
    ])].sort((left, right) => left.user_id.localeCompare(right.user_id));
    const remainingMemberships = [...(options.remainingMemberships ?? [
      {
        user_id: 'member-1',
        group_id: 'group-a',
        groups: { keyword: 'alpha' },
      },
      {
        user_id: 'member-1',
        group_id: 'group-b',
        groups: [{ keyword: 'beta' }],
      },
      {
        user_id: 'member-2',
        group_id: 'group-c',
        groups: null,
      },
    ])].sort((left, right) => (
      left.user_id.localeCompare(right.user_id)
      || left.group_id.localeCompare(right.group_id)
    ));
    const memberPageRequests: PaginationRequest[] = [];
    const remainingPageRequests: PaginationRequest[] = [];
    const remainingInCalls: string[][] = [];
    const events: string[] = [];
    const legacyUpdates: LegacyUpdate[] = [];
    let activeRemainingQueries = 0;
    let maxRemainingQueryConcurrency = 0;
    let activeLegacyUpdates = 0;
    let maxLegacyUpdateConcurrency = 0;

    function createTrackedRemainingResult<T>(
      data: T[],
      error: unknown,
    ): TrackedQueryResult<T> {
      const promise = new Promise<{ data: T[]; error: unknown }>((resolve) => {
        activeRemainingQueries += 1;
        maxRemainingQueryConcurrency = Math.max(
          maxRemainingQueryConcurrency,
          activeRemainingQueries,
        );
        queueMicrotask(() => {
          activeRemainingQueries -= 1;
          resolve({ data, error });
        });
      });
      const chainable: TrackedQueryResult<T> = Object.assign(
        promise,
        { returns: () => chainable },
      );
      return chainable;
    }

    const deleteGroup = vi.fn(async () => {
      events.push('delete');
      return { data: null, error: null };
    });

    function createMemberPageQuery() {
      const orderColumns: string[] = [];
      const builder = {
        eq: vi.fn(() => builder),
        order: vi.fn((column: string) => {
          orderColumns.push(column);
          return builder;
        }),
        range: vi.fn((from: number, to: number) => {
          events.push(`members:${from}`);
          const pageRows = members.slice(from, to + 1);
          memberPageRequests.push({
            from,
            to,
            orderColumns: [...orderColumns],
            returnedRowCount: pageRows.length,
          });
          const shouldFail = Boolean(
            options.membersError
            && from >= (options.membersErrorFrom ?? 0),
          );
          return mockQueryResult(pageRows, shouldFail ? options.membersError : null);
        }),
      };
      return builder;
    }

    function createRemainingMembershipPageQuery() {
      const orderColumns: string[] = [];
      let filteredUserIds: string[] = [];
      const builder = {
        in: vi.fn((_column: string, userIds: string[]) => {
          filteredUserIds = [...userIds];
          remainingInCalls.push([...userIds]);
          return builder;
        }),
        order: vi.fn((column: string) => {
          orderColumns.push(column);
          return builder;
        }),
        range: vi.fn((from: number, to: number) => {
          events.push(`remaining:${filteredUserIds[0] ?? 'empty'}:${from}`);
          const userIdSet = new Set(filteredUserIds);
          const filteredRows = remainingMemberships.filter((membership) =>
            userIdSet.has(membership.user_id),
          );
          const pageRows = filteredRows.slice(from, to + 1);
          remainingPageRequests.push({
            from,
            to,
            orderColumns: [...orderColumns],
            returnedRowCount: pageRows.length,
            userIds: [...filteredUserIds],
          });
          const shouldFail = Boolean(
            options.remainingError
            && from >= (options.remainingErrorFrom ?? 0),
          );
          return createTrackedRemainingResult(
            pageRows,
            shouldFail ? options.remainingError : null,
          );
        }),
      };
      return builder;
    }

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
              return createMemberPageQuery();
            }
            if (columns === 'user_id, group_id, groups(keyword)') {
              return createRemainingMembershipPageQuery();
            }
            throw new Error(`Unexpected group_members select: ${columns}`);
          },
        };
      }
      if (table === 'users') {
        return {
          update: (payload: { group_keyword: string[] }) => ({
            eq: (_column: string, memberId: string) => {
              events.push(`update:${memberId}`);
              legacyUpdates.push({
                userId: memberId,
                keywords: payload.group_keyword,
              });
              activeLegacyUpdates += 1;
              maxLegacyUpdateConcurrency = Math.max(
                maxLegacyUpdateConcurrency,
                activeLegacyUpdates,
              );
              return new Promise<{ error: { message: string } | null }>((resolve) => {
                queueMicrotask(() => {
                  activeLegacyUpdates -= 1;
                  resolve({
                    error: memberId === options.updateErrorUserId
                      ? { message: 'update unavailable' }
                      : null,
                  });
                });
              });
            },
          }),
        };
      }
      return {};
    });

    return {
      deleteGroup,
      legacyUpdates,
      memberPageRequests,
      remainingPageRequests,
      remainingInCalls,
      events,
      getMaxRemainingQueryConcurrency: () => maxRemainingQueryConcurrency,
      getMaxLegacyUpdateConcurrency: () => maxLegacyUpdateConcurrency,
    };
  }

  it('delete_group_削除後の残存membershipを一括取得し、影響ユーザーだけを1回ずつ同期する', async () => {
    const { legacyUpdates, remainingInCalls } = setupDeleteGroupMocks();
    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete_group',
        keyword: 'deleting-group',
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(remainingInCalls).toEqual([['member-1', 'member-2']]);
    expect(legacyUpdates).toEqual([
      { userId: 'member-1', keywords: ['alpha', 'beta'] },
      { userId: 'member-2', keywords: [] },
    ]);
  });

  it('delete_group_1000人超のメンバーと残存membershipを全件取得してから同期する', async () => {
    const memberIds = Array.from(
      { length: 1005 },
      (_, index) => `member-${index.toString().padStart(4, '0')}`,
    );
    const members = memberIds.map((userId) => ({ user_id: userId }));
    const remainingMemberships = memberIds.flatMap((userId, memberIndex) => {
      const membershipCount = memberIndex < 100 ? 11 : 1;
      return Array.from({ length: membershipCount }, (_, groupIndex) => ({
        user_id: userId,
        group_id: `group-${memberIndex.toString().padStart(4, '0')}-${groupIndex
          .toString()
          .padStart(2, '0')}`,
        groups: {
          keyword: `keyword-${memberIndex.toString().padStart(4, '0')}-${groupIndex
            .toString()
            .padStart(2, '0')}`,
        },
      }));
    });
    const {
      legacyUpdates,
      memberPageRequests,
      remainingPageRequests,
      remainingInCalls,
      events,
      getMaxRemainingQueryConcurrency,
      getMaxLegacyUpdateConcurrency,
    } = setupDeleteGroupMocks({ members, remainingMemberships });
    const request = new Request('http://localhost/api/user/group', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete_group',
        keyword: 'deleting-group',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(memberPageRequests).toEqual([
      {
        from: 0,
        to: 899,
        orderColumns: ['user_id'],
        returnedRowCount: 900,
      },
      {
        from: 900,
        to: 1799,
        orderColumns: ['user_id'],
        returnedRowCount: 105,
      },
    ]);
    expect(events.indexOf('members:900')).toBeLessThan(events.indexOf('delete'));
    expect(remainingPageRequests.some((page) => page.from === 900)).toBe(true);
    expect(
      remainingPageRequests.reduce((total, page) => total + page.returnedRowCount, 0),
    ).toBe(2005);
    expect(
      remainingPageRequests.every(
        (page) => page.orderColumns.join(',') === 'user_id,group_id',
      ),
    ).toBe(true);

    const uniqueChunks = Array.from(
      new Map(remainingInCalls.map((userIds) => [userIds.join(','), userIds])).values(),
    );
    expect(uniqueChunks).toHaveLength(11);
    expect(uniqueChunks.every((userIds) => userIds.length <= 100)).toBe(true);
    expect(uniqueChunks.flat()).toEqual(memberIds);
    expect(getMaxRemainingQueryConcurrency()).toBe(1);
    expect(legacyUpdates).toHaveLength(1005);
    expect(getMaxLegacyUpdateConcurrency()).toBeGreaterThan(0);
    expect(getMaxLegacyUpdateConcurrency()).toBeLessThanOrEqual(20);
    expect(legacyUpdates[0]).toEqual({
      userId: memberIds[0],
      keywords: Array.from(
        { length: 11 },
        (_, index) => `keyword-0000-${index.toString().padStart(2, '0')}`,
      ),
    });
    const firstUpdateIndex = events.findIndex((event) => event.startsWith('update:'));
    const lastRemainingIndex = events.reduce(
      (lastIndex, event, index) => event.startsWith('remaining:') ? index : lastIndex,
      -1,
    );
    expect(firstUpdateIndex).toBeGreaterThan(lastRemainingIndex);
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

  it('delete_group_残存membershipの2ページ目失敗時は部分データでlegacy更新しない', async () => {
    const memberIds = Array.from(
      { length: 100 },
      (_, index) => `member-${index.toString().padStart(3, '0')}`,
    );
    const readError = { message: 'second membership page unavailable' };
    const {
      deleteGroup,
      legacyUpdates,
      remainingPageRequests,
    } = setupDeleteGroupMocks({
      members: memberIds.map((userId) => ({ user_id: userId })),
      remainingMemberships: memberIds.flatMap((userId, memberIndex) =>
        Array.from({ length: 10 }, (_, groupIndex) => ({
          user_id: userId,
          group_id: `group-${memberIndex}-${groupIndex}`,
          groups: { keyword: `keyword-${memberIndex}-${groupIndex}` },
        })),
      ),
      remainingError: readError,
      remainingErrorFrom: 900,
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
    expect(deleteGroup).toHaveBeenCalledTimes(1);
    expect(remainingPageRequests.map(({ from }) => from)).toEqual([0, 900]);
    expect(legacyUpdates).toEqual([]);
    expect(mockReportError).toHaveBeenCalledWith(
      'user/group:delete_group:legacy_memberships',
      readError,
      { groupId: 'group-123' },
    );
  });

  it('delete_group_残存membershipが安全上限を超えた場合はlegacy更新を全件スキップする', async () => {
    const {
      deleteGroup,
      legacyUpdates,
    } = setupDeleteGroupMocks({
      members: [{ user_id: 'member-1' }],
      remainingMemberships: Array.from({ length: 10001 }, (_, index) => ({
        user_id: 'member-1',
        group_id: `group-${index.toString().padStart(5, '0')}`,
        groups: { keyword: `keyword-${index}` },
      })),
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
    expect(deleteGroup).toHaveBeenCalledTimes(1);
    expect(legacyUpdates).toEqual([]);
    expect(mockReportError).toHaveBeenCalledWith(
      'user/group:delete_group:legacy_memberships',
      expect.objectContaining({
        name: 'PaginationLimitError',
        message: 'Paginated query exceeded 10000 rows',
      }),
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

  it('delete_group_削除前メンバーの2ページ目失敗時は部分データで削除しない', async () => {
    const readError = { message: 'second member page unavailable' };
    const {
      deleteGroup,
      legacyUpdates,
      memberPageRequests,
    } = setupDeleteGroupMocks({
      members: Array.from(
        { length: 1001 },
        (_, index) => ({ user_id: `member-${index.toString().padStart(4, '0')}` }),
      ),
      membersError: readError,
      membersErrorFrom: 900,
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
    expect(memberPageRequests.map(({ from }) => from)).toEqual([0, 900]);
    expect(deleteGroup).not.toHaveBeenCalled();
    expect(legacyUpdates).toEqual([]);
    expect(mockReportError).toHaveBeenCalledWith(
      'user/group:delete_group:members',
      readError,
      { groupId: 'group-123' },
    );
  });

  it('delete_group_削除前メンバーが安全上限を超えた場合は削除しない', async () => {
    const {
      deleteGroup,
      legacyUpdates,
    } = setupDeleteGroupMocks({
      members: Array.from(
        { length: 10001 },
        (_, index) => ({ user_id: `member-${index.toString().padStart(5, '0')}` }),
      ),
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
      expect.objectContaining({
        name: 'PaginationLimitError',
        message: 'Paginated query exceeded 10000 rows',
      }),
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
