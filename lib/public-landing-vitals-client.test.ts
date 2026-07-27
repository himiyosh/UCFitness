import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPublicLandingVitalsDelivery,
  getPublicLandingViewport,
} from '@/lib/public-landing-vitals-client';

function createVisibility() {
  let listener: EventListener | null = null;
  const source = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: vi.fn((_type: 'visibilitychange', next: EventListener) => {
      listener = next;
    }),
    removeEventListener: vi.fn((_type: 'visibilitychange', current: EventListener) => {
      if (listener === current) listener = null;
    }),
  };
  return {
    source,
    set(state: DocumentVisibilityState): void {
      source.visibilityState = state;
      listener?.(new Event('visibilitychange'));
    },
  };
}

describe('createPublicLandingVitalsDelivery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchLater対応時、最新値だけを置換したcompact batchを再予約する', () => {
    const fetchLater = vi.fn().mockReturnValue({ activated: false });
    const delivery = createPublicLandingVitalsDelivery({
      viewport: 'mobile',
      fetchLater,
      fallbackFetch: vi.fn(),
      visibilitySource: createVisibility().source,
    });

    delivery.record({ name: 'LCP', value: 3_555, rating: 'needs-improvement' });
    delivery.record({ name: 'LCP', value: 3_601, rating: 'needs-improvement' });
    delivery.record({ name: 'INP', value: 184, rating: 'good' });

    expect(fetchLater).toHaveBeenCalledTimes(3);
    const firstInit = fetchLater.mock.calls[0]?.[1] as RequestInit;
    const secondInit = fetchLater.mock.calls[1]?.[1] as RequestInit;
    const finalInit = fetchLater.mock.calls[2]?.[1] as RequestInit;
    expect(firstInit.signal?.aborted).toBe(true);
    expect(secondInit.signal?.aborted).toBe(true);
    expect(finalInit).toMatchObject({
      method: 'POST', cache: 'no-store', credentials: 'omit',
      mode: 'same-origin', referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(String(finalInit.body))).toEqual({
      surface: 'public-landing',
      viewport: 'mobile',
      metrics: [
        { name: 'LCP', value: 3_600, rating: 'needs-improvement' },
        { name: 'INP', value: 180, rating: 'good' },
      ],
    });
    expect(String(finalInit.body)).not.toMatch(
      /(?:id|url|path|query|referrer|userAgent|locale|cookie|health|steps)/i,
    );
  });

  it('fetchLater非対応時、同じhidden taskの最新指標を1 batchへまとめる', async () => {
    const fallbackFetch = vi.fn().mockResolvedValue(new Response());
    const visibility = createVisibility();
    const delivery = createPublicLandingVitalsDelivery({
      viewport: 'desktop',
      fetchLater: null,
      fallbackFetch,
      visibilitySource: visibility.source,
    });

    delivery.record({ name: 'TTFB', value: 2_111, rating: 'poor' });
    delivery.record({ name: 'CLS', value: 0.054, rating: 'good' });
    expect(fallbackFetch).not.toHaveBeenCalled();

    visibility.set('hidden');
    delivery.record({ name: 'LCP', value: 3_555, rating: 'needs-improvement' });
    expect(fallbackFetch).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(fallbackFetch).toHaveBeenCalledTimes(1);
    const init = fallbackFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init).toMatchObject({
      method: 'POST', cache: 'no-store', credentials: 'omit', keepalive: true,
      mode: 'same-origin', referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      surface: 'public-landing',
      viewport: 'desktop',
      metrics: [
        { name: 'LCP', value: 3_550, rating: 'needs-improvement' },
        { name: 'CLS', value: 0.05, rating: 'good' },
        { name: 'TTFB', value: 2_100, rating: 'poor' },
      ],
    });

    visibility.set('visible');
    delivery.record({ name: 'INP', value: 180, rating: 'good' });
    visibility.set('hidden');
    await Promise.resolve();
    expect(fallbackFetch).toHaveBeenCalledTimes(1);
  });

  it('island終了時のfallback失敗は、生errorを出さず固定警告だけを残す', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fallbackFetch = vi.fn().mockRejectedValue(new Error('sensitive network details'));
    const delivery = createPublicLandingVitalsDelivery({
      viewport: 'mobile',
      fetchLater: null,
      fallbackFetch,
      visibilitySource: createVisibility().source,
    });

    delivery.record({ name: 'CLS', value: 0.01, rating: 'good' });
    delivery.dispose();
    await Promise.resolve();

    expect(fallbackFetch).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith('PUBLIC_LANDING_VITALS_DELIVERY_FAILED');
    expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain('sensitive network details');
  });

  it('fetchLaterがquota errorを投げた場合、fallbackへ切り替える', () => {
    const fetchLater = vi.fn(() => {
      throw new DOMException('quota details', 'QuotaExceededError');
    });
    const fallbackFetch = vi.fn().mockResolvedValue(new Response());
    const delivery = createPublicLandingVitalsDelivery({
      viewport: 'desktop',
      fetchLater,
      fallbackFetch,
      visibilitySource: createVisibility().source,
    });

    delivery.record({ name: 'INP', value: 205, rating: 'needs-improvement' });
    expect(fetchLater).toHaveBeenCalledTimes(1);
    expect(fallbackFetch).not.toHaveBeenCalled();

    delivery.dispose();

    expect(fallbackFetch).toHaveBeenCalledTimes(1);
  });

  it('fetchLater送信済みの場合、同じ訪問の後続指標を再送しない', () => {
    const result = { activated: false };
    const fetchLater = vi.fn().mockReturnValue(result);
    const delivery = createPublicLandingVitalsDelivery({
      viewport: 'mobile',
      fetchLater,
      fallbackFetch: vi.fn(),
      visibilitySource: createVisibility().source,
    });

    delivery.record({ name: 'LCP', value: 2_500, rating: 'good' });
    result.activated = true;
    delivery.record({ name: 'INP', value: 200, rating: 'good' });

    expect(fetchLater).toHaveBeenCalledTimes(1);
  });

  it('対象外指標の場合、配送を予約しない', () => {
    const fetchLater = vi.fn();
    const delivery = createPublicLandingVitalsDelivery({
      viewport: 'mobile',
      fetchLater,
      fallbackFetch: vi.fn(),
      visibilitySource: createVisibility().source,
    });

    delivery.record({ name: 'FCP', value: 1_000, rating: 'good' });

    expect(fetchLater).not.toHaveBeenCalled();
  });
});

describe('getPublicLandingViewport', () => {
  it('767px以下をmobile、768px以上をdesktopへ粗く分類する', () => {
    expect([320, 767].map(getPublicLandingViewport)).toEqual(['mobile', 'mobile']);
    expect([768, 1_920].map(getPublicLandingViewport)).toEqual(['desktop', 'desktop']);
  });
});
