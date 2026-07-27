import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}));

import { POST } from './route';

const validBatch = {
  surface: 'public-landing',
  viewport: 'mobile',
  metrics: [
    { name: 'LCP', value: 3_550, rating: 'needs-improvement' },
    { name: 'INP', value: 180, rating: 'good' },
    { name: 'CLS', value: 0.05, rating: 'good' },
    { name: 'TTFB', value: 2_100, rating: 'poor' },
  ],
};

function createRequest(
  body: unknown = validBatch,
  headers: HeadersInit = {},
): Request {
  return new Request('http://localhost:3000/api/analytics/public-landing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/analytics/public-landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.rateLimitResponse.mockImplementation((retryAfterSeconds: number) => (
      Response.json({ error: 'Too many requests' }, {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      })
    ));
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['cross-origin', validBatch, { Origin: 'https://attacker.example' }, 403, true],
    ['Cookie付き', validBatch, { Cookie: 'session=sensitive' }, 403, true],
    ['JSON以外', validBatch, { 'Content-Type': 'text/plain' }, 415, true],
    ['過大Content-Length', validBatch, { 'Content-Length': '769' }, 413, true],
    ['不正Content-Length', validBatch, { 'Content-Length': 'invalid' }, 413, true],
    ['過大stream', 'x'.repeat(769), {}, 413, false],
  ])('%sの場合、境界で拒否する', async (_case, body, headers, status, beforeRateLimit) => {
    const response = await POST(createRequest(body, headers));
    expect(response.status).toBe(status);
    if (beforeRateLimit) expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it('集約レート上限の場合、識別子なしの固定bucketで429を返す', async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 9 });

    const response = await POST(createRequest());

    expect(mocks.checkRateLimit).toHaveBeenCalledWith('public-landing-vitals', 600, 60_000);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('9');
  });

  it.each([
    '{"surface":"public-landing","viewport":"mobile","metrics":[{"name":"LCP","value":1e309,"rating":"poor"}]}',
    '{"surface":"public-landing","viewport":"mobile","metrics":[{"name":"CLS","value":10.01,"rating":"poor"}]}',
    '{"surface":"public-landing","viewport":"mobile","metrics":[{"name":"TTFB","value":2111,"rating":"poor"}]}',
  ])('不正・範囲外・未量子化値の場合、400を返す', async (body) => {
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
  });

  it('識別子候補を追加した場合、ログへ出さず400を返す', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await POST(createRequest({ ...validBatch, userId: 'sensitive-user-id' }));

    expect(response.status).toBe(400);
    expect(consoleInfo).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('sensitive-user-id');
  });

  it('有効な4指標の場合、許可済みaggregateだけをログへ出す', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await POST(createRequest(validBatch, {
      Referer: 'http://localhost:3000/ja/?secret=query',
      'User-Agent': 'sensitive-user-agent',
      'X-Forwarded-For': '192.0.2.10',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: 4 });
    expect(consoleInfo).toHaveBeenCalledWith('PUBLIC_LANDING_VITALS', JSON.stringify(validBatch));
    const serializedLog = JSON.stringify(consoleInfo.mock.calls);
    for (const sensitive of ['secret=query', 'sensitive-user-agent', '192.0.2.10']) {
      expect(serializedLog).not.toContain(sensitive);
    }
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
