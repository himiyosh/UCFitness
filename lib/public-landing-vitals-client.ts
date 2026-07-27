import {
  PUBLIC_LANDING_METRIC_NAMES,
  PUBLIC_LANDING_SURFACE,
  toPublicLandingMetric,
} from '@/lib/public-landing-vitals';

import type {
  PublicLandingMetric,
  PublicLandingViewport,
  PublicLandingVitalsBatch,
} from '@/lib/public-landing-vitals';

const PUBLIC_LANDING_VITALS_ENDPOINT = '/api/analytics/public-landing';
const MOBILE_VIEWPORT_MAX = 767;

interface FetchLaterResult {
  readonly activated: boolean;
}

type FetchLaterFunction = (input: RequestInfo | URL, init?: RequestInit) => FetchLaterResult;

interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: EventListener): void;
  removeEventListener(type: 'visibilitychange', listener: EventListener): void;
}

interface PublicLandingVitalsDeliveryOptions {
  viewport: PublicLandingViewport;
  endpoint?: string;
  fetchLater?: FetchLaterFunction | null;
  fallbackFetch?: typeof fetch;
  visibilitySource?: VisibilitySource;
}

interface PublicLandingWebVitalSample {
  name: unknown;
  value: unknown;
  rating: unknown;
}

export interface PublicLandingVitalsDelivery {
  record(sample: PublicLandingWebVitalSample): void;
  dispose(): void;
}

function getNativeFetchLater(): FetchLaterFunction | null {
  const candidate: unknown = Reflect.get(globalThis, 'fetchLater');
  if (typeof candidate !== 'function') return null;
  return (input, init) => candidate(input, init);
}

function createBatch(
  viewport: PublicLandingViewport,
  metricMap: ReadonlyMap<string, PublicLandingMetric>,
): PublicLandingVitalsBatch | null {
  const metrics = PUBLIC_LANDING_METRIC_NAMES.flatMap((name) => {
    const metric = metricMap.get(name);
    return metric ? [metric] : [];
  });
  if (metrics.length === 0) return null;

  return {
    surface: PUBLIC_LANDING_SURFACE,
    viewport,
    metrics,
  };
}

function createRequestInit(body: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    cache: 'no-store',
    credentials: 'omit',
    mode: 'same-origin',
    referrerPolicy: 'no-referrer',
  };
}

export function getPublicLandingViewport(width: number): PublicLandingViewport {
  return width <= MOBILE_VIEWPORT_MAX ? 'mobile' : 'desktop';
}

export function createPublicLandingVitalsDelivery(
  options: PublicLandingVitalsDeliveryOptions,
): PublicLandingVitalsDelivery {
  const endpoint = options.endpoint ?? PUBLIC_LANDING_VITALS_ENDPOINT;
  const fallbackFetch = options.fallbackFetch
    ?? ((input, init) => globalThis.fetch(input, init));
  const visibilitySource = options.visibilitySource ?? document;
  let preferredFetchLater = options.fetchLater === undefined
    ? getNativeFetchLater()
    : options.fetchLater;
  let pendingController: AbortController | null = null;
  let pendingResult: FetchLaterResult | null = null;
  let visibilityListenerAttached = false;
  let fallbackFlushQueued = false;
  let delivered = false;
  let disposed = false;
  const metrics = new Map<string, PublicLandingMetric>();

  const clearFallbackSchedule = (): void => {
    if (!visibilityListenerAttached) return;
    visibilitySource.removeEventListener('visibilitychange', onVisibilityChange);
    visibilityListenerAttached = false;
  };

  const getBody = (): string | null => {
    const batch = createBatch(options.viewport, metrics);
    return batch ? JSON.stringify(batch) : null;
  };

  const flushFallback = (): void => {
    if (delivered) return;
    const body = getBody();
    clearFallbackSchedule();
    if (!body) return;
    delivered = true;
    metrics.clear();
    void fallbackFetch(endpoint, { ...createRequestInit(body), keepalive: true }).catch(() => {
      console.warn('PUBLIC_LANDING_VITALS_DELIVERY_FAILED');
    });
  };

  const queueFallbackFlush = (): void => {
    if (delivered || fallbackFlushQueued) return;
    fallbackFlushQueued = true;
    queueMicrotask(() => {
      fallbackFlushQueued = false;
      flushFallback();
    });
  };

  function onVisibilityChange(): void {
    if (visibilitySource.visibilityState === 'hidden') queueFallbackFlush();
  }

  const schedule = (): void => {
    const body = getBody();
    if (!body) return;
    pendingController?.abort();

    if (preferredFetchLater) {
      const controller = new AbortController();
      pendingController = controller;
      try {
        pendingResult = preferredFetchLater(endpoint, {
          ...createRequestInit(body),
          signal: controller.signal,
        });
        return;
      } catch {
        preferredFetchLater = null;
        pendingController = null;
        pendingResult = null;
      }
    }

    if (!visibilityListenerAttached) {
      visibilitySource.addEventListener('visibilitychange', onVisibilityChange);
      visibilityListenerAttached = true;
    }
    if (visibilitySource.visibilityState === 'hidden') queueFallbackFlush();
  };

  return {
    record(sample): void {
      if (disposed || delivered) return;
      if (pendingResult?.activated) {
        delivered = true;
        metrics.clear();
        pendingController = null;
        pendingResult = null;
        return;
      }

      const metric = toPublicLandingMetric(sample.name, sample.value, sample.rating);
      if (!metric) return;
      metrics.set(metric.name, metric);
      schedule();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (!preferredFetchLater) flushFallback();
      clearFallbackSchedule();
    },
  };
}
