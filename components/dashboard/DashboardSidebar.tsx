'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/navigation';
import UserAvatar from '@/components/UserAvatar';

interface SidebarNavItem {
  href: '/' | '/challenges' | '/leaderboard' | '/shop' | '/groups';
  labelKey: string;
  icon: React.ReactNode;
}

interface DashboardSidebarProps {
  userName: string | null;
  userImage: string | null;
  username: string;
  /** 装備中称号テキスト */
  titleName?: string | null;
  /** 装備中称号絵文字 */
  titleEmoji?: string | null;
  /** 装備中フレームカラー (hex) */
  frameColor?: string | null;
}

/**
 * デスクトップ用サイドバーナビゲーション (lg: 以上のみ表示)
 * Stitch デザイン仕様: 左固定 w-64, glassmorphism, ユーザーアバター + ナビリンク + CTA
 */
export default function DashboardSidebar({
  userName,
  userImage,
  username,
  titleName,
  titleEmoji,
  frameColor,
}: DashboardSidebarProps) {
  const t = useTranslations('Sidebar');
  const dashT = useTranslations('Dashboard');
  const pathname = usePathname();

  const navItems = useMemo<SidebarNavItem[]>(() => [
    { href: '/', labelKey: 'dashboard', icon: <DashboardIcon /> },
    { href: '/challenges', labelKey: 'missions', icon: <MissionsIcon /> },
    { href: '/leaderboard', labelKey: 'leaderboard', icon: <LeaderboardIcon /> },
    { href: '/shop', labelKey: 'gear', icon: <GearIcon /> },
    { href: '/groups', labelKey: 'groups', icon: <GroupsIcon /> },
  ], []);

  return (
    <aside
      className="hidden lg:flex flex-col w-64 2xl:w-72 shrink-0 sticky top-0 glass-card !rounded-none border-r border-[var(--theme-primary)]/10 z-40 hover:!transform-none hover:!shadow-none"
      style={{ height: 'var(--sidebar-h, 100vh)' }}
      role="navigation"
      aria-label={t('label')}
    >
      {/* ロゴ */}
      <div className="px-5 pt-5 pb-2">
        <Link href="/" className="flex items-center gap-2 group">
          <h2
            className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity"
            style={{ fontFamily: 'var(--font-inter), sans-serif' }}
          >
            {dashT('title', { defaultMessage: 'UCFitness' })}
          </h2>
          <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] text-white text-[9px] font-bold tracking-wide uppercase shadow-sm">
            {dashT('beta')}
          </span>
        </Link>
      </div>

      {/* ユーザーセクション */}
      <div className="px-5 py-4">
        <Link
          href={`/user/${username}`}
          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--theme-primary)]/5 transition-colors group"
        >
          <UserAvatar
            src={userImage}
            name={userName}
            size="md"
            frameColor={frameColor}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[var(--theme-primary)] transition-colors">
              {userName || username}
            </p>
            {titleName ? (
              <p className="text-xs text-gray-500 truncate">
                {titleEmoji && <span className="mr-0.5">{titleEmoji}</span>}
                {titleName}
              </p>
            ) : (
              <p className="text-xs text-gray-400">@{username}</p>
            )}
          </div>
        </Link>
      </div>

      {/* ナビゲーションリンク */}
      <nav className="flex-1 px-3 2xl:px-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/' || pathname === ''
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                isActive
                  ? 'bg-[var(--theme-primary)] text-white shadow-md shadow-[var(--theme-primary)]/25'
                  : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400'}`}>
                {item.icon}
              </span>
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* CTA: Start Workout (歩数同期) */}
      <div className="px-4 py-4 mt-auto">
        <Link
          href="/challenges"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] text-white text-sm font-bold shadow-lg shadow-[var(--theme-primary)]/25 hover:shadow-xl hover:shadow-[var(--theme-primary)]/30 hover:-translate-y-0.5 transition-all min-h-[44px]"
        >
          <StartWorkoutIcon />
          <span>{t('startWorkout')}</span>
        </Link>
      </div>
    </aside>
  );
}

// ===== SVG アイコン (Material Icons 風) =====

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
    </svg>
  );
}

function MissionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
    </svg>
  );
}

function LeaderboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z" />
    </svg>
  );
}

function GroupsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function StartWorkoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
    </svg>
  );
}
