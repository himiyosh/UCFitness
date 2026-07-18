export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { parseAffiliateEvent } from '@/lib/affiliate-experiment';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
export const dynamic = 'force-dynamic';
async function readLimitedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0, result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return result + decoder.decode();
    size += value.byteLength;
    if (size > 1024) {
      await reader.cancel(); return null;
    }
    result += decoder.decode(value, { stream: true });
  }
}
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1024) return Response.json({ error: 'Payload too large' }, { status: 413 });
  const rateLimit = checkRateLimit(`affiliate-analytics:${session.user.id}`, 120, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const rawBody = await readLimitedBody(request);
  if (rawBody === null) return Response.json({ error: 'Payload too large' }, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const event = parseAffiliateEvent(input);
  if (!event) return Response.json({ error: 'Invalid event' }, { status: 400 });
  // The event schema excludes user identifiers and URLs; platform logs provide aggregate CTR input.
  console.info('AFFILIATE_ANALYTICS', JSON.stringify(event));
  return Response.json({ accepted: true }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
