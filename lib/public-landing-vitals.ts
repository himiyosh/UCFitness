export const PUBLIC_LANDING_SURFACE = 'public-landing';

export const PUBLIC_LANDING_METRIC_NAMES = ['LCP', 'INP', 'CLS', 'TTFB'] as const;
const PUBLIC_LANDING_RATINGS = ['good', 'needs-improvement', 'poor'] as const;
const PUBLIC_LANDING_VIEWPORTS = ['mobile', 'desktop'] as const;

type PublicLandingMetricName = (typeof PUBLIC_LANDING_METRIC_NAMES)[number];
type PublicLandingMetricRating = (typeof PUBLIC_LANDING_RATINGS)[number];
export type PublicLandingViewport = (typeof PUBLIC_LANDING_VIEWPORTS)[number];

export interface PublicLandingMetric {
  name: PublicLandingMetricName;
  value: number;
  rating: PublicLandingMetricRating;
}
export interface PublicLandingVitalsBatch {
  surface: typeof PUBLIC_LANDING_SURFACE;
  viewport: PublicLandingViewport;
  metrics: PublicLandingMetric[];
}

const METRIC_QUANTIZATION: Record<
  PublicLandingMetricName,
  { quantum: number; maximum: number; decimals: number }
> = {
  LCP: { quantum: 50, maximum: 60_000, decimals: 0 },
  INP: { quantum: 10, maximum: 10_000, decimals: 0 },
  CLS: { quantum: 0.01, maximum: 10, decimals: 2 },
  TTFB: { quantum: 50, maximum: 60_000, decimals: 0 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isAllowed<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string'
    && values.some((candidate) => candidate === value);
}

function quantizePublicLandingMetric(name: PublicLandingMetricName, value: number): number | null {
  const config = METRIC_QUANTIZATION[name];
  if (!Number.isFinite(value) || value < 0 || value > config.maximum) return null;
  const quantized = Math.round(value / config.quantum) * config.quantum;
  return Number(Math.max(0, quantized).toFixed(config.decimals));
}

export function toPublicLandingMetric(
  name: unknown,
  value: unknown,
  rating: unknown,
): PublicLandingMetric | null {
  if (
    !isAllowed(name, PUBLIC_LANDING_METRIC_NAMES)
    || typeof value !== 'number'
    || !isAllowed(rating, PUBLIC_LANDING_RATINGS)
  ) {
    return null;
  }
  const quantizedValue = quantizePublicLandingMetric(name, value);
  if (quantizedValue === null) return null;
  return { name, value: quantizedValue, rating };
}

function parseMetric(value: unknown): PublicLandingMetric | null {
  if (!isRecord(value) || !hasExactKeys(value, ['name', 'value', 'rating'])) {
    return null;
  }
  const metric = toPublicLandingMetric(value.name, value.value, value.rating);
  return metric?.value === value.value ? metric : null;
}

export function parsePublicLandingVitalsBatch(
  input: unknown,
): PublicLandingVitalsBatch | null {
  if (!isRecord(input) || !hasExactKeys(input, ['surface', 'viewport', 'metrics'])) {
    return null;
  }
  if (
    input.surface !== PUBLIC_LANDING_SURFACE
    || !isAllowed(input.viewport, PUBLIC_LANDING_VIEWPORTS)
    || !Array.isArray(input.metrics)
    || input.metrics.length < 1
    || input.metrics.length > PUBLIC_LANDING_METRIC_NAMES.length
  ) {
    return null;
  }

  const metrics: PublicLandingMetric[] = [];
  const names = new Set<PublicLandingMetricName>();
  for (const inputMetric of input.metrics) {
    const metric = parseMetric(inputMetric);
    if (!metric || names.has(metric.name)) return null;
    names.add(metric.name);
    metrics.push(metric);
  }
  return { surface: PUBLIC_LANDING_SURFACE, viewport: input.viewport, metrics };
}
