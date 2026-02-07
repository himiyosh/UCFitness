'use client';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 */

const EMOJIS = [
  { emoji: '🏃', size: 'text-4xl', left: '3%',  top: '8%',  anim: 'animate-float' },
  { emoji: '💪', size: 'text-3xl', left: '14%', top: '35%', anim: 'animate-float-delayed' },
  { emoji: '🎯', size: 'text-3xl', left: '25%', top: '65%', anim: 'animate-float' },
  { emoji: '✨', size: 'text-2xl', left: '38%', top: '15%', anim: 'animate-float-delayed' },
  { emoji: '🏆', size: 'text-4xl', left: '52%', top: '80%', anim: 'animate-float' },
  { emoji: '⚡', size: 'text-2xl', left: '62%', top: '28%', anim: 'animate-float-delayed' },
  { emoji: '🔥', size: 'text-3xl', left: '75%', top: '55%', anim: 'animate-float' },
  { emoji: '👟', size: 'text-2xl', left: '85%', top: '12%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-3xl', left: '92%', top: '45%', anim: 'animate-float' },
  { emoji: '💫', size: 'text-2xl', left: '45%', top: '90%', anim: 'animate-float-delayed' },
  { emoji: '🏃', size: 'text-2xl', left: '8%',  top: '72%', anim: 'animate-float' },
  { emoji: '🎯', size: 'text-2xl', left: '70%', top: '88%', anim: 'animate-float-delayed' },
];

export default function FloatingEmojis() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: -1 }}
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
