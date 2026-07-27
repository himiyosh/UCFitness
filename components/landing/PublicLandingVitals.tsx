'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useReportWebVitals } from 'next/web-vitals';

import {
  createPublicLandingVitalsDelivery,
  getPublicLandingViewport,
} from '@/lib/public-landing-vitals-client';

import type { PublicLandingVitalsDelivery } from '@/lib/public-landing-vitals-client';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

export default function PublicLandingVitals(): null {
  const activeRef = useRef(true);
  const deliveryRef = useRef<PublicLandingVitalsDelivery | null>(null);
  const reportWebVital = useCallback<ReportWebVitalsCallback>((metric) => {
    if (!activeRef.current) return;
    deliveryRef.current ??= createPublicLandingVitalsDelivery({
      viewport: getPublicLandingViewport(window.innerWidth),
    });
    deliveryRef.current.record({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
    });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      // Next.js may retain its PerformanceObserver callback after this island unmounts.
      activeRef.current = false;
      deliveryRef.current?.dispose();
      deliveryRef.current = null;
    };
  }, []);

  useReportWebVitals(reportWebVital);
  return null;
}
