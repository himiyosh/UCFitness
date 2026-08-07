import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { mockAuth, mockFrom } = vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockFrom: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/errors', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { from: mockFrom },
}));

const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('GET /api/group/[groupId]/messages', () => {
    const membershipQuery = {
        select: vi.fn(),
        eq: vi.fn(),
        single: vi.fn(),
    };
    const messagesQuery = {
        data: [],
        error: null,
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        lt: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({ user: { id: USER_ID } });

        membershipQuery.select.mockReturnValue(membershipQuery);
        membershipQuery.eq.mockReturnValue(membershipQuery);
        membershipQuery.single.mockResolvedValue({
            data: { role: 'MEMBER' },
            error: null,
        });

        messagesQuery.select.mockReturnValue(messagesQuery);
        messagesQuery.eq.mockReturnValue(messagesQuery);
        messagesQuery.order.mockReturnValue(messagesQuery);
        messagesQuery.limit.mockReturnValue(messagesQuery);
        messagesQuery.lt.mockReturnValue(messagesQuery);

        mockFrom.mockImplementation((table: string) => (
            table === 'group_members' ? membershipQuery : messagesQuery
        ));
    });

    it('offsetなしbefore cursorの場合、先頭ページへ偽装せず400を返す', async () => {
        const response = await GET(
            new NextRequest(
                `http://localhost/api/group/${GROUP_ID}/messages?before=2026-07-28T12%3A34%3A56`,
            ),
            { params: Promise.resolve({ groupId: GROUP_ID }) },
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid message cursor' });
        expect(messagesQuery.lt).not.toHaveBeenCalled();
    });

    it('明示offset付きbefore cursorの場合、DB cursorへそのまま渡す', async () => {
        const cursor = '2026-07-28T12:34:56Z';
        const response = await GET(
            new NextRequest(
                `http://localhost/api/group/${GROUP_ID}/messages?before=${encodeURIComponent(cursor)}`,
            ),
            { params: Promise.resolve({ groupId: GROUP_ID }) },
        );

        expect(response.status).toBe(200);
        expect(messagesQuery.lt).toHaveBeenCalledWith('created_at', cursor);
    });
});
