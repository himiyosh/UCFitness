'use client';

import { useTranslations } from 'next-intl';
interface AffiliateDisclosureProps {
  className?: string;
  showMerchantDetails?: boolean;
}
export default function AffiliateDisclosure({
  className = '',
  showMerchantDetails = true,
}: AffiliateDisclosureProps) {
  const t = useTranslations('AffiliateExperiment');
  return (
    <div className={`text-xs leading-5 text-[var(--color-text-muted)] ${className}`}>
      <p>{t('disclosure')}</p>
      {showMerchantDetails && <p>{t('priceUnknown')} · {t('deliveryUnknown')}</p>}
    </div>
  );
}
