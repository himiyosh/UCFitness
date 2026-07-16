'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/Spinner';

interface SmartGoalAdvisorProps {
  currentGoal: number;
  recentSteps: { date: string; steps: number }[];
  percentile: number | null;
  bestStreak: number;
  currentStreak: number;
}

interface GoalSuggestion {
  level: 'easy' | 'moderate' | 'challenge';
  goal: number;
  label: string;
  description: string;
  emoji: string;
}

// 目標値を500の倍数に丸める
function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

export default function SmartGoalAdvisor({
  currentGoal,
  recentSteps,
  percentile,
  bestStreak,
  currentStreak,
}: SmartGoalAdvisorProps) {
  const t = useTranslations('GoalAdvisor');
  const [isApplying, setIsApplying] = useState(false);
  const [appliedGoal, setAppliedGoal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 直近30日の統計を算出
  const stats = useMemo(() => {
    if (recentSteps.length === 0) {
      return { average: 0, activeDays: 0, totalDays: 0, consistency: 0, bestDay: 0 };
    }
    const activeDays = recentSteps.filter(d => d.steps > 0).length;
    const totalSteps = recentSteps.reduce((sum, d) => sum + d.steps, 0);
    const average = activeDays > 0 ? Math.round(totalSteps / activeDays) : 0;
    const bestDay = Math.max(...recentSteps.map(d => d.steps));
    const consistency = Math.round((activeDays / recentSteps.length) * 100);
    return { average, activeDays, totalDays: recentSteps.length, consistency, bestDay };
  }, [recentSteps]);

  // 3段階のゴール提案を生成
  const suggestions = useMemo((): GoalSuggestion[] => {
    const avg = stats.average;
    if (avg === 0) {
      return [
        { level: 'easy', goal: 5000, label: t('levelEasy'), description: t('startGentle'), emoji: '🌱' },
        { level: 'moderate', goal: 8000, label: t('levelModerate'), description: t('standardGoal'), emoji: '🎯' },
        { level: 'challenge', goal: 10000, label: t('levelChallenge'), description: t('ambitiousGoal'), emoji: '🔥' },
      ];
    }

    const easyGoal = roundToNearest(avg * 0.85, 500);
    const moderateGoal = roundToNearest(avg * 1.0, 500);
    const challengeGoal = roundToNearest(avg * 1.2, 500);

    return [
      {
        level: 'easy',
        goal: Math.max(easyGoal, 1000),
        label: t('levelEasy'),
        description: t('easyDesc'),
        emoji: '🌱',
      },
      {
        level: 'moderate',
        goal: Math.max(moderateGoal, 2000),
        label: t('levelModerate'),
        description: t('moderateDesc'),
        emoji: '🎯',
      },
      {
        level: 'challenge',
        goal: Math.max(challengeGoal, 3000),
        label: t('levelChallenge'),
        description: t('challengeDesc'),
        emoji: '🔥',
      },
    ];
  }, [stats.average, t]);

  // ゴール適用ハンドラー
  const handleApplyGoal = useCallback(async (newGoal: number) => {
    setIsApplying(true);
    setError(null);
    try {
      const res = await fetch('/api/user/step-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_goal: newGoal }),
      });
      if (!res.ok) throw new Error('Failed to update goal');
      setAppliedGoal(newGoal);
    } catch {
      setError(t('error'));
    } finally {
      setIsApplying(false);
    }
  }, [t]);

  // 現状の分析メッセージ
  const analysisMessage = useMemo(() => {
    if (stats.average === 0) return t('noDataYet');
    const ratio = stats.average / currentGoal;
    if (ratio > 1.3) return t('tooEasy');
    if (ratio > 1.0) return t('goodBalance');
    if (ratio > 0.7) return t('challenging');
    return t('tooHard');
  }, [stats.average, currentGoal, t]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/40 shadow-lg p-4 sm:p-5">
      {/* ヘッダー */}
      <h3 className="text-lg font-bold flex items-center gap-2 mb-3">
        <span>🎯</span>
        <span className="text-[var(--color-primary-strong)]">
          {t('title')}
        </span>
      </h3>

      {/* 現在の統計 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500">{t('recentAverage')}</div>
          <div className="text-base font-bold text-gray-900">{stats.average.toLocaleString()}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500">{t('consistency')}</div>
          <div className="text-base font-bold text-gray-900">{stats.consistency}%</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500">{t('currentGoal')}</div>
          <div className="text-base font-bold text-[var(--theme-primary)]">{currentGoal.toLocaleString()}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500">{t('percentileLabel')}</div>
          <div className="text-base font-bold text-gray-900">
            {percentile !== null ? `${t('top')} ${100 - percentile}%` : '-'}
          </div>
        </div>
      </div>

      {/* 分析メッセージ */}
      <div className="bg-[var(--theme-primary)]/5 border border-[var(--theme-primary)]/10 rounded-lg p-3 mb-4">
        <p className="text-sm text-gray-700">
          <span className="font-semibold text-[var(--theme-primary)]">{t('analysis')}:</span>{' '}
          {analysisMessage}
        </p>
      </div>

      {/* 目標提案カード */}
      <div className="space-y-2.5">
        {suggestions.map((s) => {
          const isApplied = appliedGoal === s.goal;
          const isCurrent = currentGoal === s.goal;
          return (
            <div
              key={s.level}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                isApplied
                  ? 'bg-green-50 border-green-200'
                  : isCurrent
                    ? 'bg-[var(--theme-primary)]/5 border-[var(--theme-primary)]/20'
                    : 'bg-white border-gray-200 hover:border-[var(--theme-primary)]/30'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-xl flex-shrink-0">{s.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">{s.label}</span>
                    {isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] font-bold">
                        {t('current')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{s.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="font-bold text-sm tabular-nums">{s.goal.toLocaleString()}</span>
                {!isCurrent && !isApplied && (
                  <button
                    onClick={() => handleApplyGoal(s.goal)}
                    disabled={isApplying}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--theme-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 min-w-[52px]"
                  >
                    {isApplying ? <Spinner size="sm" /> : t('apply')}
                  </button>
                )}
                {isApplied && (
                  <span className="text-green-600 text-xs font-bold">✓ {t('applied')}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
