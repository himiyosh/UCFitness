'use client';

import { useState, useCallback } from 'react';
import { Link, usePathname } from '@/navigation';
import { useTranslations } from 'next-intl';

/**
 * ネイティブアプリ風の固定ボトムナビゲーションバー
 * モバイルで常時表示、sm 以上では非表示（ヘッダーナビで代替）
 * 5つ目の「その他」メニューで Wallet / Shop / Challenges / Settings にアクセス可能
 */
export default function BottomNavBar() {
  const pathname = usePathname();
  const t = useTranslations('BottomNav');
  const dashT = useTranslations('Dashboard');
  const [moreOpen, setMoreOpen] = useState(false);

  const toggleMore = useCallback(() => setMoreOpen(prev => !prev), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  const navItems = [
    { href: '/' as const, icon: HomeIcon, label: t('home') },
    { href: '/groups' as const, icon: GroupIcon, label: t('groups') },
    { href: '/leaderboard' as const, icon: RankingIcon, label: t('ranking') },
    { href: '/profile' as const, icon: ProfileIcon, label: t('profile') },
  ];

  // 「その他」メニューの項目
  const moreItems = [
    { href: '/wallet' as const, emoji: '💰', label: dashT('wallet') },
    { href: '/shop' as const, emoji: '🛍️', label: dashT('shop') },
    { href: '/challenges' as const, emoji: '🎯', label: dashT('challenges') },
    { href: '/analytics' as const, emoji: '📊', label: dashT('analytics') },
    { href: '/settings' as const, emoji: '⚙️', label: dashT('settings') },
  ];

  const isMoreActive = moreItems.some(item => pathname.startsWith(item.href));

  return (
    <>
      {/* 「その他」メニューの背景オーバーレイ */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 sm:hidden"
          onClick={closeMore}
          aria-hidden="true"
        />
      )}

      {/* 「その他」ポップアップメニュー */}
      {moreOpen && (
        <div className="fixed bottom-[72px] right-2 z-50 sm:hidden safe-area-bottom" role="menu" aria-label={t('more')}>
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/60 p-2 min-w-[160px] animate-fadeInUp">
            {moreItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={closeMore}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                    isActive
                      ? 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)]'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-base">{item.emoji}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white/90 backdrop-blur-xl border-t border-gray-200/60 safe-area-bottom m3-nav-bar"
        role="navigation"
        aria-label={t('label')}
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {navItems.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : item.href === '/profile'
                ? pathname === '/profile' || pathname.startsWith('/user/')
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMore}
                className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] m3-transition ${
                  isActive
                    ? 'text-[var(--theme-primary)]'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span
                  className={`absolute top-1 w-14 h-7 rounded-full m3-transition ${
                    isActive
                      ? 'bg-[var(--theme-primary-light)] scale-100 opacity-100'
                      : 'scale-75 opacity-0'
                  }`}
                  aria-hidden="true"
                />
                <span className="relative z-10 mt-1">
                  <item.icon active={isActive} />
                </span>
                <span className={`relative z-10 text-[10px] leading-none mt-0.5 font-medium ${isActive ? 'font-semibold' : ''}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* 「その他」ボタン */}
          <button
            onClick={toggleMore}
            className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] m3-transition ${
              isMoreActive || moreOpen
                ? 'text-[var(--theme-primary)]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-expanded={moreOpen}
            aria-haspopup="true"
            aria-label={t('more')}
          >
            <span
              className={`absolute top-1 w-14 h-7 rounded-full m3-transition ${
                isMoreActive || moreOpen
                  ? 'bg-[var(--theme-primary-light)] scale-100 opacity-100'
                  : 'scale-75 opacity-0'
              }`}
              aria-hidden="true"
            />
            <span className="relative z-10 mt-1">
              <MoreIcon active={isMoreActive || moreOpen} />
            </span>
            <span className={`relative z-10 text-[10px] leading-none mt-0.5 font-medium ${isMoreActive || moreOpen ? 'font-semibold' : ''}`}>
              {t('more')}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

// SVG アイコンコンポーネント（SF Symbols / Material 風）
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5}>
      {active ? (
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      )}
    </svg>
  );
}

function GroupIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5}>
      {active ? (
        <path d="M17 20c0-2.761-3.134-5-7-5s-7 2.239-7 5h14zM10 12a4 4 0 100-8 4 4 0 000 8zM21 20c0-1.657-1.343-3-3-3-.693 0-1.332.228-1.848.613M18 8a3 3 0 11-6 0 3 3 0 016 0z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      )}
    </svg>
  );
}

function RankingIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5}>
      {active ? (
        <>
          <rect x="3" y="14" width="5" height="7" rx="1" />
          <rect x="9.5" y="8" width="5" height="13" rx="1" />
          <rect x="16" y="11" width="5" height="10" rx="1" />
        </>
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4 21V14a1 1 0 011-1h3a1 1 0 011 1v7M10 21V8a1 1 0 011-1h2a1 1 0 011 1v13M16 21v-6a1 1 0 011-1h2a1 1 0 011 1v6" />
      )}
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5}>
      {active ? (
        <path d="M12 12a5 5 0 100-10 5 5 0 000 10zM21 20c0-3.866-4.03-7-9-7s-9 3.134-9 7h18z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      )}
    </svg>
  );
}

function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      {active ? (
        <>
          <circle cx="12" cy="5" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="19" r="2" fill="currentColor" stroke="none" />
        </>
      ) : (
        <>
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </>
      )}
    </svg>
  );
}
