'use client';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 */

const EMOJIS = [
  // Row 1 (top: 5%)
  { emoji: '🏃', size: 'text-3xl', left: '5%',  top: '5%',  anim: 'animate-float' },
  { emoji: '✨', size: 'text-2xl', left: '20%', top: '5%',  anim: 'animate-float-delayed' },
  { emoji: '💪', size: 'text-4xl', left: '35%', top: '5%',  anim: 'animate-float' },
  { emoji: '🎯', size: 'text-2xl', left: '50%', top: '5%',  anim: 'animate-float-delayed' },
  { emoji: '🏆', size: 'text-3xl', left: '65%', top: '5%',  anim: 'animate-float' },
  { emoji: '⚡', size: 'text-2xl', left: '80%', top: '5%',  anim: 'animate-float-delayed' },
  { emoji: '🔥', size: 'text-4xl', left: '95%', top: '5%',  anim: 'animate-float' },
  // Row 2 (top: 20%)
  { emoji: '👟', size: 'text-4xl', left: '12%', top: '20%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-2xl', left: '27%', top: '20%', anim: 'animate-float' },
  { emoji: '💫', size: 'text-3xl', left: '42%', top: '20%', anim: 'animate-float-delayed' },
  { emoji: '🏃', size: 'text-2xl', left: '57%', top: '20%', anim: 'animate-float' },
  { emoji: '✨', size: 'text-4xl', left: '72%', top: '20%', anim: 'animate-float-delayed' },
  { emoji: '🔥', size: 'text-2xl', left: '87%', top: '20%', anim: 'animate-float' },
  // Row 3 (top: 35%)
  { emoji: '💪', size: 'text-2xl', left: '5%',  top: '35%', anim: 'animate-float' },
  { emoji: '🏆', size: 'text-3xl', left: '20%', top: '35%', anim: 'animate-float-delayed' },
  { emoji: '⚡', size: 'text-4xl', left: '35%', top: '35%', anim: 'animate-float' },
  { emoji: '🎉', size: 'text-2xl', left: '50%', top: '35%', anim: 'animate-float-delayed' },
  { emoji: '👟', size: 'text-3xl', left: '65%', top: '35%', anim: 'animate-float' },
  { emoji: '💫', size: 'text-2xl', left: '80%', top: '35%', anim: 'animate-float-delayed' },
  { emoji: '🎯', size: 'text-4xl', left: '95%', top: '35%', anim: 'animate-float' },
  // Row 4 (top: 50%)
  { emoji: '🔥', size: 'text-3xl', left: '12%', top: '50%', anim: 'animate-float-delayed' },
  { emoji: '🏃', size: 'text-2xl', left: '27%', top: '50%', anim: 'animate-float' },
  { emoji: '✨', size: 'text-4xl', left: '42%', top: '50%', anim: 'animate-float-delayed' },
  { emoji: '💪', size: 'text-2xl', left: '57%', top: '50%', anim: 'animate-float' },
  { emoji: '🏆', size: 'text-3xl', left: '72%', top: '50%', anim: 'animate-float-delayed' },
  { emoji: '⚡', size: 'text-2xl', left: '87%', top: '50%', anim: 'animate-float' },
  // Row 5 (top: 65%)
  { emoji: '🎉', size: 'text-4xl', left: '5%',  top: '65%', anim: 'animate-float' },
  { emoji: '👟', size: 'text-2xl', left: '20%', top: '65%', anim: 'animate-float-delayed' },
  { emoji: '💫', size: 'text-3xl', left: '35%', top: '65%', anim: 'animate-float' },
  { emoji: '🎯', size: 'text-2xl', left: '50%', top: '65%', anim: 'animate-float-delayed' },
  { emoji: '🔥', size: 'text-4xl', left: '65%', top: '65%', anim: 'animate-float' },
  { emoji: '🏃', size: 'text-2xl', left: '80%', top: '65%', anim: 'animate-float-delayed' },
  { emoji: '✨', size: 'text-3xl', left: '95%', top: '65%', anim: 'animate-float' },
  // Row 6 (top: 80%)
  { emoji: '💪', size: 'text-2xl', left: '12%', top: '80%', anim: 'animate-float-delayed' },
  { emoji: '🏆', size: 'text-4xl', left: '27%', top: '80%', anim: 'animate-float' },
  { emoji: '⚡', size: 'text-2xl', left: '42%', top: '80%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-3xl', left: '57%', top: '80%', anim: 'animate-float' },
  { emoji: '👟', size: 'text-2xl', left: '72%', top: '80%', anim: 'animate-float-delayed' },
  { emoji: '💫', size: 'text-4xl', left: '87%', top: '80%', anim: 'animate-float' },
  // Row 7 (top: 93%)
  { emoji: '🎯', size: 'text-3xl', left: '5%',  top: '93%', anim: 'animate-float' },
  { emoji: '🔥', size: 'text-2xl', left: '25%', top: '93%', anim: 'animate-float-delayed' },
  { emoji: '🏃', size: 'text-4xl', left: '45%', top: '93%', anim: 'animate-float' },
  { emoji: '✨', size: 'text-2xl', left: '65%', top: '93%', anim: 'animate-float-delayed' },
  { emoji: '💪', size: 'text-3xl', left: '85%', top: '93%', anim: 'animate-float' },
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
