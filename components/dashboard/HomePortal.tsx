'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import HomeHero from '@/components/dashboard/HomeHero';
import QuickActions from '@/components/dashboard/QuickActions';
import DailyMissions from '@/components/dashboard/DailyMissions';
import DashboardChallenges from '@/components/dashboard/DashboardChallenges';
import FollowingPanel from '@/components/dashboard/FollowingPanel';

// ============================================
// HomePortal — ネイティブアプリ風ポータル + タブ切替
// ヒーロー + クイックアクション + タブ(ミッション/チャレンジ/フォロー)
// パターン C: タブバー + ヒーロー型 (Instagram/LINE風)
// ============================================

type MobileTab = 'missions' | 'challenges' | 'following';

const MOBILE_TABS: { key: MobileTab; emoji: string; labelKey: string }[] = [
  { key: 'missions', emoji: '🎯', labelKey: 'missions' },
  { key: 'challenges', emoji: '🏆', labelKey: 'challenges' },
  { key: 'following', emoji: '👥', labelKey: 'following' },
];

interface HomePortalProps {
  todaySteps: number;
  yesterdaySteps: number;
  weeklySteps: number;
  monthlySteps: number;
  stepGoal: number;
  userName: string | null;
  userImage: string | null;
  username: string;
  globalRank: number | null;
  hideHero?: boolean;
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
  hideHero = false,
}: HomePortalProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>('missions');
  const t = useTranslations('HomePortal');

  return (
    <div className="flex flex-col h-[calc(100dvh-48px-64px)] sm:h-auto overflow-hidden sm:overflow-visible">

      {/* ===== ヒーローセクション ===== */}
      {!hideHero && (
        <HomeHero
          todaySteps={todaySteps}
          yesterdaySteps={yesterdaySteps}
          weeklySteps={weeklySteps}
          monthlySteps={monthlySteps}
          stepGoal={stepGoal}
          userName={userName}
          userImage={userImage}
          username={username}
          globalRank={globalRank}
          className="rounded-none sm:rounded-none"
        />
      )}

      {/* ===== クイックアクション ===== */}
      <QuickActions className="bg-transparent sm:bg-transparent shadow-none sm:shadow-none border-none sm:border-none" />

      {/* ===== モバイルタブ切替 ===== */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* タブバー */}
        <div className="flex border-b border-gray-200/60 bg-white/60 backdrop-blur-sm px-2" role="tablist">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 text-center text-xs font-semibold transition-colors min-h-[36px] ${
                activeTab === tab.key
                  ? 'text-[var(--theme-primary)] border-b-2 border-[var(--theme-primary)]'
                  : 'text-gray-400'
              }`}
            >
              {tab.emoji} {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* タブコンテンツ（スクロール可能） */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {activeTab === 'missions' && <DailyMissions />}
          {activeTab === 'challenges' && <DashboardChallenges />}
          {activeTab === 'following' && <FollowingPanel />}
        </div>
      </div>
    </div>
  );
}
