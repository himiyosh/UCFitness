import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}));

import { AFFILIATE_EXPERIMENT_ID } from '@/lib/affiliate-experiment';

import { POST } from './route';

const validEvent = {
  schema: 1,
  event: 'impression',
  experiment: AFFILIATE_EXPERIMENT_ID,
  positionVariant: 'A',
  copyVariant: 'B',
  surface: 'shop',
  targetType: 'product',
  targetId: 'B012345678',
};

function createRequest(
  body: unknown = validEvent,
  origin = 'http://localhost:3000',
  headers: HeadersInit = {},
): Request {
  return new Request('http://localhost:3000/api/analytics/affiliate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/analytics/affiliate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'viewer-1' } });
    mocks.checkRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
    mocks.rateLimitResponse.mockImplementation((retryAfterSeconds: number) => (
      Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      )
    ));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未認証の場合、イベントを受理しない', async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it('cross-originの場合、イベントを受理しない', async () => {
    const response = await POST(createRequest(validEvent, 'https://attacker.example'));

    expect(response.status).toBe(403);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it('rate-limit超過の場合、Retry-After付き429を返す', async () => {
    mocks.checkRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 17,
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('17');
  });

  it('1KiBを超えるstream bodyの場合、イベントを受理しない', async () => {
    const response = await POST(createRequest('x'.repeat(1_025)));

    expect(response.status).toBe(413);
  });

  it('PII候補フィールドを含む場合、イベントを受理しない', async () => {
    const response = await POST(createRequest({ ...validEvent, userId: 'viewer-1' }));

    expect(response.status).toBe(400);
  });

  it('有効なイベントの場合、許可済みフィールドだけを構造化ログへ出力する', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(consoleInfo).toHaveBeenCalledWith(
      'AFFILIATE_ANALYTICS',
      JSON.stringify(validEvent),
    );
    expect(JSON.stringify(consoleInfo.mock.calls)).not.toContain('viewer-1');
  });
});
