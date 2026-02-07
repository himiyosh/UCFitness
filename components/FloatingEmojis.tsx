'use client';

import { useTheme } from './ThemeProvider';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * フィットネス関連の絵文字がゆっくり漂い、サイトにポップな雰囲気を与える
 */

const EMOJIS = [
  { emoji: '🏃', size: 'text-2xl', left: '3%', top: '8%' },
  { emoji: '💪', size: 'text-xl', left: '14%', top: '35%' },
  { emoji: '🎯', size: 'text-2xl', left: '25%', top: '65%' },
  { emoji: '✨', size: 'text-lg', left: '38%', top: '15%' },
  { emoji: '🏆', size: 'text-2xl', left: '52%', top: '80%' },
  { emoji: '⚡', size: 'text-lg', left: '62%', top: '28%' },
  { emoji: '🔥', size: 'text-xl', left: '75%', top: '55%' },
  { emoji: '👟', size: 'text-lg', left: '85%', top: '12%' },
  { emoji: '🎉', size: 'text-xl', left: '92%', top: '45%' },
  { emoji: '💫', size: 'text-lg', left: '45%', top: '90%' },
  { emoji: '🏃', size: 'text-lg', left: '8%', top: '72%' },
  { emoji: '🎯', size: 'text-lg', left: '70%', top: '88%' },
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
          className={`absolute emoji-twinkle ${item.size}`}
          style={{
            left: item.left,
            top: item.top,
            animationDelay: `${(i * 2.3) % 12}s`,
            '--emoji-opacity': isMidnight ? 0.2 : 0.14,
          } as React.CSSProperties}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
}
