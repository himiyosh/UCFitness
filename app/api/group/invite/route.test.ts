import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const { mockAuth, mockReportError, mockRpc } = vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockReportError: vi.fn(),
    mockRpc: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/errors', () => ({ reportError: mockReportError }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: { rpc: mockRpc },
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';

function request(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/group/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/group/invite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({ user: { id: USER_ID } });
    });

    it('denies unauthenticated requests before reading invite data', async () => {
        mockAuth.mockResolvedValue(null);

        const response = await POST(request({ action: 'join', token: 'A'.repeat(43) }));

        expect(response.status).toBe(401);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it('returns forbidden when the atomic create RPC denies the caller', async () => {
        mockRpc.mockResolvedValue({ data: { status: 'forbidden' }, error: null });

        const response = await POST(request({ action: 'create', groupId: GROUP_ID }));

        expect(response.status).toBe(403);
        expect(mockRpc).toHaveBeenCalledWith('create_group_invite', expect.objectContaining({
            p_group_id: GROUP_ID,
            p_created_by: USER_ID,
        }));
    });

    it('returns 429 when the group has reached its active invite limit', async () => {
        mockRpc.mockResolvedValue({ data: { status: 'rate_limited' }, error: null });

        const response = await POST(request({ action: 'create', groupId: GROUP_ID }));

        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({ code: 'INVITE_LIMIT_REACHED' });
    });

    it('returns a one-time 256-bit token while persisting only its SHA-256 hash', async () => {
        mockRpc.mockResolvedValue({
            data: { status: 'created', expiresAt: '2026-07-26T00:00:00.000Z' },
            error: null,
        });

        const response = await POST(request({ action: 'create', groupId: GROUP_ID }));
        const payload = await response.json();
        const rpcArgs = mockRpc.mock.calls[0][1];

        expect(response.status).toBe(200);
        expect(payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(rpcArgs.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(rpcArgs.p_token_hash).not.toBe(payload.token);
        expect(JSON.stringify(rpcArgs)).not.toContain(payload.token);
    });

    it('rejects an offset-free invite expiration instead of returning a local-time timestamp', async () => {
        mockRpc.mockResolvedValue({
            data: { status: 'created', expiresAt: '2026-07-26T00:00:00' },
            error: null,
        });

        const response = await POST(request({ action: 'create', groupId: GROUP_ID }));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ code: 'INVITE_CREATE_FAILED' });
    });

    it('rejects malformed tokens without querying the database', async () => {
        const response = await POST(request({ action: 'join', token: 'not-a-token' }));

        expect(response.status).toBe(404);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it('returns 410 for an expired invite', async () => {
        mockRpc.mockResolvedValue({ data: { status: 'expired' }, error: null });

        const response = await POST(request({ action: 'join', token: 'A'.repeat(43) }));

        expect(response.status).toBe(410);
        expect(await response.json()).toEqual({ code: 'INVITE_EXPIRED' });
    });

    it('does not distinguish a nonexistent invite from other unavailable tokens', async () => {
        mockRpc.mockResolvedValue({ data: { status: 'invalid' }, error: null });

        const response = await POST(request({ action: 'join', token: 'A'.repeat(43) }));

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: 'INVITE_UNAVAILABLE' });
    });

    it('joins through the RPC without forwarding the raw token', async () => {
        const token = 'B'.repeat(43);
        mockRpc.mockResolvedValue({
            data: { status: 'joined', groupId: GROUP_ID },
            error: null,
        });

        const response = await POST(request({ action: 'join', token }));
        const rpcArgs = mockRpc.mock.calls[0][1];

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ groupId: GROUP_ID, alreadyMember: false });
        expect(rpcArgs.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(rpcArgs)).not.toContain(token);
    });

    it('omits the raw token and hash from database error logs', async () => {
        const token = 'C'.repeat(43);
        mockRpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });

        const response = await POST(request({ action: 'join', token }));

        expect(response.status).toBe(500);
        expect(mockReportError).toHaveBeenCalledWith(
            'group/invite:join',
            expect.any(Object),
            { userId: USER_ID },
        );
        expect(JSON.stringify(mockReportError.mock.calls)).not.toContain(token);
    });
});

describe('group invite migration', () => {
    it('retains expired hashes for 410 responses while limiting only active invites', () => {
        const migration = readFileSync('migrations/20260719_add_group_invite_links.sql', 'utf8');

        expect(migration).not.toContain('DELETE FROM public.group_invites');
        expect(migration).toContain('WHERE group_id = p_group_id AND expires_at > now()');
    });
});
