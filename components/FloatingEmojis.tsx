'use client';

import { useTheme } from './ThemeProvider';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * フィットネス関連の絵文字がゆっくり漂い、サイトにポップな雰囲気を与える
 */

const EMOJIS = [
  { emoji: '🏃', size: 'text-2xl', delay: '0s', duration: '18s', left: '5%', top: '-5%' },
  { emoji: '💪', size: 'text-xl', delay: '3s', duration: '22s', left: '15%', top: '-8%' },
  { emoji: '🎯', size: 'text-2xl', delay: '7s', duration: '20s', left: '25%', top: '-6%' },
  { emoji: '✨', size: 'text-lg', delay: '1s', duration: '24s', left: '35%', top: '-4%' },
  { emoji: '🏆', size: 'text-2xl', delay: '5s', duration: '19s', left: '50%', top: '-7%' },
  { emoji: '⚡', size: 'text-lg', delay: '9s', duration: '21s', left: '60%', top: '-5%' },
  { emoji: '🔥', size: 'text-xl', delay: '2s', duration: '23s', left: '70%', top: '-8%' },
  { emoji: '👟', size: 'text-lg', delay: '6s', duration: '17s', left: '80%', top: '-6%' },
  { emoji: '🎉', size: 'text-xl', delay: '11s', duration: '25s', left: '90%', top: '-4%' },
  { emoji: '💫', size: 'text-lg', delay: '4s', duration: '20s', left: '42%', top: '-9%' },
  { emoji: '🏃', size: 'text-lg', delay: '8s', duration: '26s', left: '55%', top: '-3%' },
  { emoji: '🎯', size: 'text-lg', delay: '13s', duration: '22s', left: '10%', top: '-7%' },
];

export default function FloatingEmojis() {
  const { theme } = useTheme();
  const isMidnight = theme === 'midnight';

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {EMOJIS.map((item, i) => (
        <span
          key={i}
          className={`absolute floating-emoji ${item.size}`}
          style={{
            left: item.left,
            top: item.top,
            animationDelay: item.delay,
            animationDuration: item.duration,
            opacity: isMidnight ? 0.18 : 0.12,
          }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
}
