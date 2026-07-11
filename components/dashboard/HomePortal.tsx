import HomeHero from '@/components/dashboard/HomeHero';

import type { ReactNode } from 'react';

// ============================================
// HomePortal — モバイルホーム
// 最初に今日の進捗と到達可能な競争差だけを示す
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
}: HomePortalProps): ReactNode {
  return (
    <div className="flex flex-col overflow-visible">
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
          className="rounded-none"
          compact
          showMetricTiles={false}
          showNextAction={false}
        />
      )}
    </div>
  );
}
