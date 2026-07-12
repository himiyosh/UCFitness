'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/navigation';
import UserAvatar from '@/components/UserAvatar';

import type { ReactNode } from 'react';

interface SidebarNavItem {
  href: '/' | '/challenges' | '/leaderboard' | '/groups' | '/shop' | '/wallet' | '/profile';
  labelKey: string;
  labelNamespace?: 'sidebar' | 'dashboard' | 'bottomNav';
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
 * デスクトップの恒久ナビゲーション。余白と不透明サーフェスでプロ品質の安定感を出す。
 */
export default function DashboardSidebar({
  userName,
  userImage,
  username,
  titleName,
  titleEmoji,
  frameColor,
}: DashboardSidebarProps): ReactNode {
  const t = useTranslations('Sidebar');
  const dashT = useTranslations('Dashboard');
  const navT = useTranslations('BottomNav');
  const pathname = usePathname();

  const navItems: SidebarNavItem[] = [
    { href: '/', labelKey: 'home', labelNamespace: 'bottomNav', icon: <DashboardIcon /> },
    { href: '/leaderboard', labelKey: 'ranking', labelNamespace: 'bottomNav', icon: <LeaderboardIcon /> },
    { href: '/challenges', labelKey: 'challenges', labelNamespace: 'dashboard', icon: <MissionsIcon /> },
    { href: '/groups', labelKey: 'groups', icon: <GroupsIcon /> },
    { href: '/shop', labelKey: 'gear', icon: <GearIcon /> },
    { href: '/wallet', labelKey: 'wallet', labelNamespace: 'dashboard', icon: <WalletIcon /> },
    { href: '/profile', labelKey: 'profile', labelNamespace: 'dashboard', icon: <ProfileIcon /> },
  ];

  return (
    <aside
      className="sticky top-0 z-40 hidden w-48 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] 2xl:w-52 lg:flex"
      style={{ height: 'var(--sidebar-h, 100vh)' }}
    >
      {/* ロゴ */}
      <div className="px-3 pb-1.5 pt-3">
        <Link href="/" className="group flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] ring-1 ring-[var(--color-primary)]/20">
            <BrandMark />
          </span>
          <span
            className="text-base font-semibold tracking-tight text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]"
            style={{ fontFamily: 'var(--font-inter), sans-serif' }}
          >
            <span className="font-black text-[var(--color-primary-strong)]">UC</span>
            <span className="font-black text-[var(--color-text)]">Fitness</span>
          </span>
          <span className="rounded-full bg-[var(--color-primary-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-primary)]">
            {dashT('beta')}
          </span>
        </Link>
      </div>

      {/* ユーザーセクション */}
      <div className="px-3 py-2">
        <Link
          href={`/user/${username}`}
          className="group flex items-center gap-2 rounded-xl p-2 transition-colors hover:bg-[var(--color-surface-muted)]"
        >
          <UserAvatar
            src={userImage}
            name={userName}
            size="sm"
            frameColor={frameColor}
          />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]">
              {userName || username}
            </p>
            {titleName ? (
              <p className="truncate text-xs text-[var(--color-text-muted)]">
                {titleEmoji && <span className="mr-0.5">{titleEmoji}</span>}
                {titleName}
              </p>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">@{username}</p>
            )}
          </div>
        </Link>
      </div>

      {/* ナビゲーションリンク */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5" aria-label={t('label')}>
        {navItems.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/' || pathname === ''
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] shadow-sm ring-1 ring-[var(--color-primary)]/20'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`h-4 w-4 ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                {item.icon}
              </span>
               <span>
                 {item.labelNamespace === 'dashboard'
                   ? dashT(item.labelKey)
                   : item.labelNamespace === 'bottomNav'
                     ? navT(item.labelKey)
                     : t(item.labelKey)}
               </span>
            </Link>
          );
        })}
      </nav>

      {/* CTA: Start Workout (歩数同期) */}
      <div className="mt-auto px-3 py-3">
        <Link
          href="/challenges"
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary-solid)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
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

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" strokeWidth={2.3} d="M4 15.5 8.5 11l3 3L20 5.5" />
      <path strokeLinecap="round" strokeLinejoin="round" stroke="var(--color-reward)" strokeWidth={2.3} d="M5 19h14" />
      <circle cx="18.5" cy="5.5" r="2.15" fill="var(--color-success)" />
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

function GroupsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12 12a5 5 0 100-10 5 5 0 000 10zM21 20c0-3.866-4.03-7-9-7s-9 3.134-9 7h18z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.6-.22l-2.49 1a7.28 7.28 0 00-1.69-.98L14.5 2.42A.5.5 0 0014 2h-4a.5.5 0 00-.5.42L9.12 5.07c-.61.24-1.18.57-1.69.98l-2.49-1a.5.5 0 00-.6.22l-2 3.46a.5.5 0 00.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.13.23.4.32.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.2.1.47.01.6-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 016.5 4H18a2 2 0 012 2v1H6.5A2.5 2.5 0 004 9.5v7A2.5 2.5 0 006.5 19H20v1a2 2 0 01-2 2H6.5A4.5 4.5 0 012 17.5v-7a4.5 4.5 0 012-4z" />
      <path d="M6.5 8H21a1 1 0 011 1v8a1 1 0 01-1 1H6.5A1.5 1.5 0 015 16.5v-7A1.5 1.5 0 016.5 8zm11 6.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" />
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
