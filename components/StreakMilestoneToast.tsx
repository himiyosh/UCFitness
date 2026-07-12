'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// ストリークマイルストーン閾値
const MILESTONES = [100, 50, 30, 14, 7, 3] as const;

interface StreakMilestoneToastProps {
  currentStreak: number;
  multiplier: number;
}

export default function StreakMilestoneToast({ currentStreak, multiplier }: StreakMilestoneToastProps) {
  const t = useTranslations('StreakMilestone');
  const [visible, setVisible] = useState(false);
  const [milestone, setMilestone] = useState<number | null>(null);

  useEffect(() => {
    // ストリークがマイルストーンにちょうど一致した場合にのみ表示
    const hit = MILESTONES.find(m => currentStreak === m);
    if (!hit) return;

    // 同一セッションで表示済みか確認（localStorage で重複防止）
    const storageKey = `streak_milestone_${hit}`;
    try {
      const shown = sessionStorage.getItem(storageKey);
      if (shown) return;
      sessionStorage.setItem(storageKey, '1');
    } catch {
      // sessionStorage unavailable
    }

    setMilestone(hit);
    setVisible(true);

    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [currentStreak]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible || milestone === null) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fadeInUp pointer-events-auto">
      <div
        className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[var(--theme-primary)]/20 px-5 py-4 max-w-sm mx-auto"
        role="alert"
        aria-live="polite"
      >
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center"
          aria-label="Close"
        >
          ×
        </button>

        {/* 祝賀コンテンツ */}
        <div className="text-center">
          <div className="text-4xl mb-2 animate-bounce">
            {milestone >= 30 ? '🏆' : milestone >= 7 ? '🔥' : '⚡'}
          </div>
          <h4 className="text-lg font-black text-[var(--color-success-strong)]">
            {t('title')}
          </h4>
          <p className="text-2xl font-black text-gray-900 mt-1">
            {milestone} {t('days')} 🎉
          </p>
          {multiplier > 1 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] text-sm font-bold">
              ×{multiplier} {t('bonusActive')}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">{t('keepItUp')}</p>
        </div>
      </div>
    </div>
  );
}
