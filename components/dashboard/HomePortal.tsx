'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

import HomeHero from '@/components/dashboard/HomeHero';
import QuickActions from '@/components/dashboard/QuickActions';

// ============================================
// HomePortal — モバイルホーム
// ヒーロー + クイックアクション + 要約CTA
// ============================================

interface HomePortalProps {
  todaySteps: number;
  stepGoal: number;
  userName: string | null;
  userImage: string | null;
  username: string;
  globalRank: number | null;
  hasTodaySteps?: boolean;
  nextRankGap?: number | null;
  hideHero?: boolean;
}

export default function HomePortal({
  todaySteps,
  stepGoal,
  userName,
  userImage,
  username,
  globalRank,
  hasTodaySteps = false,
  nextRankGap = null,
  hideHero = false,
}: HomePortalProps) {
  const t = useTranslations('HomePortal');
  const dashboardT = useTranslations('Dashboard');
  const syncLabel = hasTodaySteps ? dashboardT('fitbitSyncedToday') : dashboardT('fitbitSyncPending');
  const rankLabel = globalRank ? `#${globalRank}` : dashboardT('rankUnavailable');
  const gapLabel = nextRankGap !== null
    ? dashboardT('rankGap', { amount: nextRankGap.toLocaleString() })
    : dashboardT('rankGapPending');


  return (
    <div className="flex flex-col sm:h-auto overflow-visible">

      {/* ===== ヒーローセクション ===== */}
      {!hideHero && (
        <HomeHero
          todaySteps={todaySteps}
          stepGoal={stepGoal}
          userName={userName}
          userImage={userImage}
          username={username}
          globalRank={globalRank}
          hasTodaySteps={hasTodaySteps}
          nextRankGap={nextRankGap}
          className="rounded-none sm:rounded-none"
          compact
          showMetricTiles={false}
        />
      )}

      {/* ===== クイックアクション ===== */}
      <QuickActions className="bg-transparent sm:bg-transparent shadow-none sm:shadow-none border-none sm:border-none" />

      <div className="mx-3 grid grid-cols-3 gap-1.5">
        <MobileSummaryTile label={dashboardT('syncStatus')} value={syncLabel} />
        <MobileSummaryTile label={dashboardT('globalRankLabel')} value={rankLabel} />
        <MobileSummaryTile label={dashboardT('rankInsight')} value={gapLabel} />
      </div>
      <div className="mx-3 mt-2 grid grid-cols-2 gap-1.5">
        <Link
          href="/challenges"
          className="flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-inverse-surface)] px-3 text-xs font-bold text-[var(--color-inverse-text)]"
        >
          {t('challenges')}
        </Link>
        <Link
          href="/leaderboard"
          className="flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold text-[var(--color-text)]"
        >
          {dashboardT('globalRankLabel')}
        </Link>
      </div>
    </div>
  );
}

function MobileSummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 shadow-sm">
      <p className="truncate text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-[var(--color-text)]">{value}</p>
    </div>
  );
}
