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
    // モバイル: 100dvh からヘッダー(48px) + ボトムナビ(64px) を差し引いた固定高さ
    // デスクトップ: 自然な高さ（サイドバー側で overflow-y-auto を担当）
    <div className="flex flex-col h-[calc(100dvh-48px-64px)] sm:h-auto overflow-hidden sm:overflow-visible">

      {/* ===== ヒーローセクション ===== */}
      <section
        className="relative flex-shrink-0 bg-gradient-to-br from-[var(--theme-gradient-from)] via-[var(--theme-secondary)] to-[var(--theme-gradient-to)] text-white px-4 pt-3 pb-5 sm:px-6 sm:pt-6 sm:pb-8 overflow-hidden"
        aria-label={pt('heroLabel')}
      >
        {/* 装飾 — Apple-style mesh gradient feel */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-56 h-56 bg-white/8 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-40 h-40 bg-white/8 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 flex items-center gap-4 sm:gap-6 max-w-lg mx-auto">
          {/* 歩数リング — Apple Watch風 */}
          <div className="relative flex-shrink-0">
            <svg className="w-[104px] h-[104px] sm:w-[120px] sm:h-[120px] -rotate-90 drop-shadow-lg" viewBox="0 0 100 100" aria-hidden="true">
              {/* 背景リング */}
              <circle cx="50" cy="50" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="7" />
              {/* 進捗リング — Round cap + subtle glow */}
              <circle
                cx="50" cy="50" r={ringRadius}
                fill="none" stroke="#fff" strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className="transition-all duration-1000 ring-glow"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl sm:text-2xl font-black leading-none tracking-tight">{todaySteps.toLocaleString()}</span>
              <span className="text-[10px] sm:text-xs opacity-70 mt-0.5 font-medium">/ {stepGoal.toLocaleString()}</span>
            </div>
          </div>

          {/* 統計情報 */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* ユーザー挨拶 */}
            <div className="flex items-center gap-2">
              <UserAvatar src={userImage} name={userName || username} size="sm" />
              <p className="text-sm sm:text-base font-bold truncate tracking-tight">
                {userName || username}
              </p>
            </div>

            {/* 歩数達成率 — M3 chip 風 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1">
                {progressPercent}% {progressPercent >= 100 ? '🎉' : progressPercent >= 50 ? '🔥' : '👟'}
              </span>
              <span className={`text-xs font-medium ${vsDiff >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                {vsSign}{vsDiff.toLocaleString()} {pt('stepsUnit')} {t('vsYesterday')}
              </span>
            </div>

            {/* 週間・月間・ランク — Apple HIG 風の統計グリッド */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="text-center bg-white/10 backdrop-blur-sm rounded-xl py-1.5 px-1">
                <div className="text-sm sm:text-base font-bold tracking-tight">{formatK(weeklySteps)}</div>
                <div className="text-[9px] sm:text-[10px] opacity-60 font-medium uppercase tracking-wider">{t('thisWeek')}</div>
              </div>
              <div className="text-center bg-white/10 backdrop-blur-sm rounded-xl py-1.5 px-1">
                <div className="text-sm sm:text-base font-bold tracking-tight">{formatK(monthlySteps)}</div>
                <div className="text-[9px] sm:text-[10px] opacity-60 font-medium uppercase tracking-wider">{t('thisMonth')}</div>
              </div>
              <div className="text-center bg-white/10 backdrop-blur-sm rounded-xl py-1.5 px-1">
                <div className="text-sm sm:text-base font-bold tracking-tight">
                  {globalRank ? `#${globalRank}` : '—'}
                </div>
                <div className="text-[9px] sm:text-[10px] opacity-60 font-medium uppercase tracking-wider">{pt('rank')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== クイックアクション ===== */}
      <section className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-[var(--theme-page-bg)]" aria-label={pt('quickActions')}>
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3 max-w-lg mx-auto">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group relative flex flex-col items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-gray-100/80 min-h-[76px] m3-transition card-elevated"
            >
              {/* M3 State Layer */}
              <span className="absolute inset-0 rounded-2xl bg-[var(--theme-primary)] opacity-0 group-hover:opacity-[0.08] group-active:opacity-[0.12] transition-opacity duration-200 pointer-events-none" aria-hidden="true" />
              <span className="text-2xl sm:text-3xl transition-transform duration-300 group-hover:scale-110 group-active:scale-95 spring-transition">{action.emoji}</span>
              <span className="text-[11px] sm:text-xs font-semibold text-gray-600 group-hover:text-gray-900 transition-colors duration-200">{action.label}</span>
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
