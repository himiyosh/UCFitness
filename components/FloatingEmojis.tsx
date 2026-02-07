'use client';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 */

const EMOJIS = [
  // Row 1: 上部エリア
  { emoji: '🏃', size: 'text-4xl', left: '3%',  top: '5%',  anim: 'animate-float' },
  { emoji: '✨', size: 'text-2xl', left: '18%', top: '10%', anim: 'animate-float-delayed' },
  { emoji: '💪', size: 'text-3xl', left: '35%', top: '3%',  anim: 'animate-float' },
  { emoji: '⚡', size: 'text-2xl', left: '55%', top: '8%',  anim: 'animate-float-delayed' },
  { emoji: '👟', size: 'text-2xl', left: '72%', top: '4%',  anim: 'animate-float' },
  { emoji: '🎯', size: 'text-3xl', left: '90%', top: '10%', anim: 'animate-float-delayed' },
  // Row 2: 中上部
  { emoji: '🔥', size: 'text-3xl', left: '8%',  top: '25%', anim: 'animate-float-delayed' },
  { emoji: '🏆', size: 'text-4xl', left: '28%', top: '22%', anim: 'animate-float' },
  { emoji: '💫', size: 'text-2xl', left: '48%', top: '28%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-3xl', left: '68%', top: '24%', anim: 'animate-float' },
  { emoji: '🏃', size: 'text-2xl', left: '85%', top: '30%', anim: 'animate-float-delayed' },
  // Row 3: 中央
  { emoji: '💪', size: 'text-2xl', left: '5%',  top: '45%', anim: 'animate-float' },
  { emoji: '🎯', size: 'text-2xl', left: '22%', top: '50%', anim: 'animate-float-delayed' },
  { emoji: '⚡', size: 'text-3xl', left: '42%', top: '44%', anim: 'animate-float' },
  { emoji: '✨', size: 'text-2xl', left: '60%', top: '48%', anim: 'animate-float-delayed' },
  { emoji: '🔥', size: 'text-2xl', left: '78%', top: '52%', anim: 'animate-float' },
  { emoji: '🏆', size: 'text-2xl', left: '93%', top: '46%', anim: 'animate-float-delayed' },
  // Row 4: 中下部
  { emoji: '👟', size: 'text-3xl', left: '10%', top: '68%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-2xl', left: '32%', top: '72%', anim: 'animate-float' },
  { emoji: '💫', size: 'text-2xl', left: '50%', top: '66%', anim: 'animate-float-delayed' },
  { emoji: '🏃', size: 'text-3xl', left: '75%', top: '70%', anim: 'animate-float' },
  // Row 5: 下部
  { emoji: '🎯', size: 'text-2xl', left: '2%',  top: '88%', anim: 'animate-float' },
  { emoji: '🔥', size: 'text-2xl', left: '20%', top: '92%', anim: 'animate-float-delayed' },
  { emoji: '💪', size: 'text-3xl', left: '40%', top: '86%', anim: 'animate-float' },
  { emoji: '✨', size: 'text-2xl', left: '58%', top: '90%', anim: 'animate-float-delayed' },
  { emoji: '🏆', size: 'text-2xl', left: '80%', top: '85%', anim: 'animate-float' },
  { emoji: '⚡', size: 'text-2xl', left: '95%', top: '92%', anim: 'animate-float-delayed' },
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
