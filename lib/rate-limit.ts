interface RateLimitResult {
    allowed: boolean;
    retryAfterSeconds: number;
}

interface RateBucket {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, RateBucket>();

function pruneExpiredBuckets(now: number): void {
    if (buckets.size < 1_000) return;

    for (const [bucketKey, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
            buckets.delete(bucketKey);
        }
    }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    pruneExpiredBuckets(now);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
    }

    if (bucket.count >= limit) {
        return {
            allowed: false,
            retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
        };
    }

    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
    return Response.json(
        { error: 'Too many requests' },
        {
            status: 429,
            headers: {
                'Retry-After': String(Math.max(1, retryAfterSeconds)),
            },
        },
    );
}
