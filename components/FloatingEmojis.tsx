'use client';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 */

const EMOJIS = [
  // Row 1 (top: 8%)
  { emoji: '🏃', size: 'text-5xl', left: '8%',  top: '8%',  anim: 'animate-float' },
  { emoji: '✨', size: 'text-lg',  left: '35%', top: '8%',  anim: 'animate-float-delayed' },
  { emoji: '💪', size: 'text-3xl', left: '62%', top: '8%',  anim: 'animate-float' },
  { emoji: '🎯', size: 'text-xl',  left: '88%', top: '8%',  anim: 'animate-float-delayed' },
  // Row 2 (top: 28%)
  { emoji: '🔥', size: 'text-2xl', left: '20%', top: '28%', anim: 'animate-float' },
  { emoji: '🏆', size: 'text-5xl', left: '50%', top: '28%', anim: 'animate-float-delayed' },
  { emoji: '⚡', size: 'text-lg',  left: '78%', top: '28%', anim: 'animate-float' },
  // Row 3 (top: 48%)
  { emoji: '👟', size: 'text-4xl', left: '8%',  top: '48%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-xl',  left: '35%', top: '48%', anim: 'animate-float' },
  { emoji: '💫', size: 'text-5xl', left: '62%', top: '48%', anim: 'animate-float-delayed' },
  { emoji: '🏃', size: 'text-lg',  left: '88%', top: '48%', anim: 'animate-float' },
  // Row 4 (top: 68%)
  { emoji: '✨', size: 'text-3xl', left: '20%', top: '68%', anim: 'animate-float-delayed' },
  { emoji: '💪', size: 'text-lg',  left: '50%', top: '68%', anim: 'animate-float' },
  { emoji: '🔥', size: 'text-5xl', left: '78%', top: '68%', anim: 'animate-float-delayed' },
  // Row 5 (top: 88%)
  { emoji: '🏆', size: 'text-xl',  left: '8%',  top: '88%', anim: 'animate-float' },
  { emoji: '⚡', size: 'text-4xl', left: '35%', top: '88%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-lg',  left: '62%', top: '88%', anim: 'animate-float' },
  { emoji: '👟', size: 'text-3xl', left: '88%', top: '88%', anim: 'animate-float-delayed' },
];

export default function FloatingEmojis() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 10 }}
      aria-hidden="true"
    >
      {EMOJIS.map((item, i) => (
        <span
          key={i}
          className={`absolute emoji-float ${item.anim} ${item.size}`}
          style={{
            left: item.left,
            top: item.top,
          }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
}
