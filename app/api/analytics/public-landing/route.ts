export const runtime = 'edge';

import { parsePublicLandingVitalsBatch } from '@/lib/public-landing-vitals';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 768;
const REQUEST_LIMIT = 600;
const REQUEST_WINDOW_MS = 60_000;

async function readLimitedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let size = 0;
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return result + decoder.decode();

    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    result += decoder.decode(value, { stream: true });
  }
}

function hasValidContentLength(request: Request): boolean {
  const rawContentLength = request.headers.get('content-length');
  if (rawContentLength === null) return true;
  if (!/^(0|[1-9]\d*)$/.test(rawContentLength)) return false;
  return Number(rawContentLength) <= MAX_BODY_BYTES;
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (request.headers.get('content-type') !== 'application/json') {
    return Response.json({ error: 'Unsupported media type' }, { status: 415 });
  }
  if (request.headers.has('cookie')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!hasValidContentLength(request)) {
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  }

  const rateLimit = checkRateLimit(
    'public-landing-vitals',
    REQUEST_LIMIT,
    REQUEST_WINDOW_MS,
  );
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const rawBody = await readLimitedBody(request);
  if (rawBody === null) {
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const batch = parsePublicLandingVitalsBatch(input);
  if (!batch) {
    return Response.json({ error: 'Invalid metrics' }, { status: 400 });
  }

  console.info('PUBLIC_LANDING_VITALS', JSON.stringify(batch));
  return Response.json(
    { accepted: batch.metrics.length },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
