'use client';

import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { Link } from '@/navigation';
import UserAvatar from '@/components/UserAvatar';
import ActivityFeed from '@/components/ActivityFeed';

// ============================================
// HomePortal — ネイティブアプリ風の1画面ポータル
// スクロールなし（100dvh）でヒーロー + クイックアクション + フィードを表示
// パターン C: タブバー + ヒーロー型 (Instagram/LINE風)
// ============================================

interface HomePortalProps {
  todaySteps: number;
  yesterdaySteps: number;
  weeklySteps: number;
  monthlySteps: number;
  stepGoal: number;
  userName: string | null;
  userImage: string | null;
  username: string;
  /** グローバルランキングでの順位（例: 5位 → 5） */
  globalRank: number | null;
}

export default function HomePortal({
  todaySteps,
  yesterdaySteps,
  weeklySteps,
  monthlySteps,
  stepGoal,
  userName,
  userImage,
  username,
  globalRank,
}: HomePortalProps) {
  const t = useTranslations('Dashboard');
  const pt = useTranslations('Portal');

  // 歩数の達成率 (0〜100)
  const progressPercent = useMemo(
    () => Math.min(100, Math.round((todaySteps / stepGoal) * 100)),
    [todaySteps, stepGoal]
  );

  // 昨日比の差分
  const vsDiff = todaySteps - yesterdaySteps;
  const vsSign = vsDiff >= 0 ? '+' : '';

  // SVG リングのパラメータ
  const ringRadius = 44;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progressPercent / 100) * ringCircumference;

  // クイックアクション定義
  const quickActions = useMemo(() => [
    { href: '/groups' as const, emoji: '👥', label: t('groups'), color: 'from-blue-500 to-blue-600' },
    { href: '/challenges' as const, emoji: '🏆', label: t('challenges'), color: 'from-amber-500 to-orange-500' },
    { href: '/wallet' as const, emoji: '💰', label: t('wallet'), color: 'from-emerald-500 to-green-600' },
    { href: '/shop' as const, emoji: '🛍️', label: t('shop'), color: 'from-pink-500 to-rose-500' },
  ], [t]);

  return (
    // モバイル: 100dvh からヘッダー(48px) + ボトムナビ(56px) を差し引いた固定高さ
    // デスクトップ: 自然な高さ（サイドバー側で overflow-y-auto を担当）
    <div className="flex flex-col h-[calc(100dvh-48px-56px)] sm:h-auto overflow-hidden sm:overflow-visible">

      {/* ===== ヒーローセクション ===== */}
      <section
        className="relative flex-shrink-0 bg-gradient-to-br from-[var(--theme-gradient-from)] via-[var(--theme-secondary)] to-[var(--theme-gradient-to)] text-white px-4 pt-3 pb-4 sm:px-6 sm:pt-6 sm:pb-8"
        aria-label={pt('heroLabel')}
      >
        {/* 装飾 */}
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 flex items-center gap-4 sm:gap-6 max-w-lg mx-auto">
          {/* 歩数リング */}
          <div className="relative flex-shrink-0">
            <svg className="w-24 h-24 sm:w-28 sm:h-28 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
              {/* 背景リング */}
              <circle cx="50" cy="50" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
              {/* 進捗リング */}
              <circle
                cx="50" cy="50" r={ringRadius}
                fill="none" stroke="#fff" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg sm:text-xl font-black leading-none">{todaySteps.toLocaleString()}</span>
              <span className="text-[10px] sm:text-xs opacity-80 mt-0.5">/ {stepGoal.toLocaleString()}</span>
            </div>
          </div>

          {/* 統計情報 */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* ユーザー挨拶 */}
            <div className="flex items-center gap-2">
              <UserAvatar src={userImage} name={userName || username} size="sm" />
              <p className="text-sm sm:text-base font-bold truncate">
                {userName || username}
              </p>
            </div>

            {/* 歩数達成率 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold bg-white/20 rounded-full px-2 py-0.5">
                {progressPercent}% {progressPercent >= 100 ? '🎉' : progressPercent >= 50 ? '🔥' : '👟'}
              </span>
              <span className={`text-xs font-medium ${vsDiff >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                {vsSign}{vsDiff.toLocaleString()} {pt('stepsUnit')} {t('vsYesterday')}
              </span>
            </div>

            {/* 週間・月間・ランク */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs sm:text-sm font-bold">{formatK(weeklySteps)}</div>
                <div className="text-[10px] sm:text-xs opacity-70">{t('thisWeek')}</div>
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold">{formatK(monthlySteps)}</div>
                <div className="text-[10px] sm:text-xs opacity-70">{t('thisMonth')}</div>
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold">
                  {globalRank ? `#${globalRank}` : '—'}
                </div>
                <div className="text-[10px] sm:text-xs opacity-70">{pt('rank')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== クイックアクション ===== */}
      <section className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-[var(--theme-page-bg)]" aria-label={pt('quickActions')}>
        <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-lg mx-auto">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow min-h-[72px]"
            >
              <span className="text-2xl sm:text-3xl">{action.emoji}</span>
              <span className="text-xs font-semibold text-gray-700">{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== アクティビティフィード ===== */}
      <section
        className="flex-1 sm:flex-none min-h-0 flex flex-col px-4 sm:px-6 pb-2 sm:pb-4 bg-[var(--theme-page-bg)]"
        aria-label={pt('recentActivity')}
      >
        <div className="flex items-center justify-between mb-2 max-w-lg mx-auto w-full">
          <h2 className="text-xs sm:text-sm font-bold text-gray-700 flex items-center gap-1">
            <span>📢</span> {pt('recentActivity')}
          </h2>
          <Link
            href={`/user/${username}`}
            className="text-xs text-[var(--theme-primary)] font-medium hover:underline"
          >
            {pt('viewAll')} →
          </Link>
        </div>
        {/* フィードはスクロール可能なエリア（この領域のみスクロール） */}
        <div className="flex-1 sm:flex-none min-h-0 overflow-y-auto sm:overflow-visible max-w-lg mx-auto w-full rounded-xl scrollbar-thin">
          <ActivityFeed />
        </div>
      </section>
    </div>
  );
}

/**
 * 歩数を読みやすい形式に短縮（52340 → 52.3K）
 */
function formatK(steps: number): string {
  if (steps >= 1000) {
    return `${(steps / 1000).toFixed(steps % 1000 < 100 ? 0 : 1)}K`;
  }
  return steps.toLocaleString();
}
