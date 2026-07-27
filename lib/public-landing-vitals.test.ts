import { describe, expect, it } from 'vitest';

import { parsePublicLandingVitalsBatch, toPublicLandingMetric } from '@/lib/public-landing-vitals';

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

const FORBIDDEN_FIELDS = [
  'id', 'metricId', 'randomId', 'sessionId', 'accountId', 'userId', 'deviceId',
  'url', 'path', 'query', 'referrer', 'userAgent', 'ip', 'locale', 'cookie',
  'localStorage', 'sessionStorage', 'healthData', 'steps',
] as const;

describe('parsePublicLandingVitalsBatch', () => {
  it('4指標が量子化済みの場合、固定公開LP契約として受理する', () => {
    expect(parsePublicLandingVitalsBatch(validBatch)).toEqual(validBatch);
  });

  it.each(FORBIDDEN_FIELDS)(
    '%sを含む場合、識別子候補を受理しない',
    (field) => {
      expect(parsePublicLandingVitalsBatch({ ...validBatch, [field]: 'sensitive' })).toBeNull();
    },
  );

  it.each([
    { ...validBatch, surface: 'authenticated-home' },
    { ...validBatch, viewport: 'tablet' },
    { ...validBatch, metrics: [] },
    { ...validBatch, metrics: [...validBatch.metrics, validBatch.metrics[0]] },
    { ...validBatch, metrics: [{ ...validBatch.metrics[0], id: 'metric-id' }] },
    { ...validBatch, metrics: [{ name: 'LCP', value: 3_555, rating: 'needs-improvement' }] },
    { ...validBatch, metrics: [{ name: 'LCP', value: Number.NaN, rating: 'poor' }] },
    { ...validBatch, metrics: [{ name: 'LCP', value: Number.POSITIVE_INFINITY, rating: 'poor' }] },
    { ...validBatch, metrics: [{ name: 'LCP', value: -1, rating: 'poor' }] },
    { ...validBatch, metrics: [{ name: 'LCP', value: 60_050, rating: 'poor' }] },
    { ...validBatch, metrics: [
      { name: 'CLS', value: 0.05, rating: 'good' },
      { name: 'CLS', value: 0.06, rating: 'good' },
    ] },
  ])('固定schema・有限範囲・一意性の境界外の場合、受理しない', (input) => {
    expect(parsePublicLandingVitalsBatch(input)).toBeNull();
  });
});

describe('toPublicLandingMetric', () => {
  it.each([
    ['LCP', 3_555, 'needs-improvement', 3_550],
    ['INP', 184, 'good', 180],
    ['CLS', 0.054, 'good', 0.05],
    ['TTFB', 2_111, 'poor', 2_100],
  ])('%s実測値を粗い単位へ量子化する', (name, value, rating, expected) => {
    expect(toPublicLandingMetric(name, value, rating)).toEqual({ name, value: expected, rating });
  });

  it('対象外指標の場合、FCP等を公開LPbatchへ追加しない', () => {
    expect(toPublicLandingMetric('FCP', 1_000, 'good')).toBeNull();
  });
});
