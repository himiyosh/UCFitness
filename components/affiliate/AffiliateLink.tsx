'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useTranslations } from 'next-intl';

import { AFFILIATE_EXPERIMENT_ID, getAffiliateAssignment, isJapaneseAmazonUrl } from '@/lib/affiliate-experiment';
import type { AffiliateAssignment, AffiliateEventName, AffiliateSurface, AffiliateTargetType } from '@/lib/affiliate-experiment';
interface AffiliateLinkProps {
  href: string; surface: AffiliateSurface; targetType: AffiliateTargetType; targetId: string;
  className?: string; contentClassName?: string;
  showMerchantDetails?: boolean;
  children: ReactNode;
}
export default function AffiliateLink({
  href,
  surface,
  targetType,
  targetId,
  className = '',
  contentClassName = '',
  showMerchantDetails = true,
  children,
}: AffiliateLinkProps) {
  const t = useTranslations('AffiliateExperiment');
  const linkRef = useRef<HTMLAnchorElement>(null);
  const impressionSentRef = useRef(false);
  const [assignment, setAssignment] = useState<AffiliateAssignment | null>(null);
  const isValid = isJapaneseAmazonUrl(href);
  useEffect(() => {
    try {
      setAssignment(getAffiliateAssignment(window.sessionStorage));
    } catch {
      setAssignment(getAffiliateAssignment());
    }
  }, []);
  const sendEvent = useCallback((event: AffiliateEventName) => {
    if (!assignment?.measurementEnabled) return;
    void fetch('/api/analytics/affiliate', {
      method: 'POST', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema: 1, event, experiment: AFFILIATE_EXPERIMENT_ID,
        positionVariant: assignment.positionVariant, copyVariant: assignment.copyVariant,
        surface, targetType, targetId,
      }),
    }).then(response => {
      if (!response.ok) console.warn('Affiliate analytics was not accepted');
    }).catch(error => console.warn('Affiliate analytics unavailable', error));
  }, [assignment, surface, targetId, targetType]);
  useEffect(() => {
    const target = linkRef.current;
    if (!target || !isValid || !assignment?.measurementEnabled || impressionSentRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null, visibleEnough = false;
    const stopTimer = () => { if (timer) clearTimeout(timer); timer = null; };
    const startTimer = () => {
      stopTimer();
      if (!visibleEnough || document.visibilityState !== 'visible') return;
      timer = setTimeout(() => {
        if (!visibleEnough || document.visibilityState !== 'visible' || impressionSentRef.current) return;
        impressionSentRef.current = true;
        sendEvent('impression');
        observer.disconnect();
      }, 1000);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visibleEnough = entry.intersectionRatio >= 0.5; startTimer();
    }, { threshold: 0.5 });
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') stopTimer(); else startTimer();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    observer.observe(target);
    return () => {
      stopTimer(); observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [assignment, isValid, sendEvent]);
  const positionVariant = assignment?.positionVariant ?? 'A';
  const copyVariant = assignment?.copyVariant ?? 'A';
  const details = (
    <span className={`${positionVariant === 'B' ? 'order-first mb-2 border-b pb-2' : 'order-last mt-2 border-t pt-2'} grid gap-1 border-[var(--color-border)] text-xs`}>
      {showMerchantDetails && <span className="text-[var(--color-text-muted)]">{t('priceUnknown')}</span>}
      {showMerchantDetails && <span className="text-[var(--color-text-muted)]">{t('deliveryUnknown')}</span>}
      <span className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary-solid)] px-3 py-2 text-center font-bold text-white">
        {t(copyVariant === 'A' ? 'ctaDetails' : 'ctaCheck')}
      </span>
    </span>
  );
  const content = <div className={contentClassName}>{children}</div>;
  if (!isValid) {
    return (
      <div className={`flex flex-col ${className}`}>
        {content}<p role="alert" className="mt-2 text-xs text-[var(--color-danger)]">{t('invalidLink')}</p>
      </div>
    );
  }
  return (
    <a
      ref={linkRef} href={href} target="_blank" rel="sponsored noopener noreferrer"
      onClick={() => sendEvent('click')}
      className={`flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-solid)] focus-visible:ring-offset-2 ${assignment ? 'visible' : 'invisible'} ${className}`}
      data-affiliate-position={positionVariant}
      data-affiliate-copy={copyVariant}
    >
      {content}
      {details}
      <span className="sr-only">{t('opensNewTab')}</span>
    </a>
  );
}
