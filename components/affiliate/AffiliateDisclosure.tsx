'use client';

import { useTranslations } from 'next-intl';
interface AffiliateDisclosureProps {
  className?: string;
}
export default function AffiliateDisclosure({ className = '' }: AffiliateDisclosureProps) {
  const t = useTranslations('AffiliateExperiment');
  return <div className={`text-xs leading-5 text-[var(--color-text-muted)] ${className}`}><p>{t('disclosure')}</p><p>{t('priceUnknown')} · {t('deliveryUnknown')}</p></div>;
}
