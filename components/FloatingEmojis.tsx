'use client';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 */

const EMOJIS = [
  { emoji: '🏃', size: 'text-4xl', left: '2%',  top: '3%',  anim: 'animate-float' },
  { emoji: '✨', size: 'text-2xl', left: '21%', top: '14%', anim: 'animate-float-delayed' },
  { emoji: '💪', size: 'text-3xl', left: '41%', top: '1%',  anim: 'animate-float' },
  { emoji: '👟', size: 'text-2xl', left: '67%', top: '9%',  anim: 'animate-float-delayed' },
  { emoji: '🎯', size: 'text-3xl', left: '88%', top: '6%',  anim: 'animate-float' },
  { emoji: '🔥', size: 'text-3xl', left: '11%', top: '29%', anim: 'animate-float-delayed' },
  { emoji: '🏆', size: 'text-4xl', left: '33%', top: '19%', anim: 'animate-float' },
  { emoji: '⚡', size: 'text-2xl', left: '56%', top: '31%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-3xl', left: '79%', top: '22%', anim: 'animate-float' },
  { emoji: '💫', size: 'text-2xl', left: '4%',  top: '48%', anim: 'animate-float' },
  { emoji: '🏃', size: 'text-2xl', left: '26%', top: '41%', anim: 'animate-float-delayed' },
  { emoji: '✨', size: 'text-2xl', left: '49%', top: '53%', anim: 'animate-float' },
  { emoji: '💪', size: 'text-2xl', left: '71%', top: '44%', anim: 'animate-float-delayed' },
  { emoji: '🎯', size: 'text-2xl', left: '94%', top: '50%', anim: 'animate-float' },
  { emoji: '🔥', size: 'text-2xl', left: '16%', top: '63%', anim: 'animate-float' },
  { emoji: '👟', size: 'text-3xl', left: '38%', top: '71%', anim: 'animate-float-delayed' },
  { emoji: '🏆', size: 'text-2xl', left: '59%', top: '62%', anim: 'animate-float' },
  { emoji: '⚡', size: 'text-2xl', left: '83%', top: '73%', anim: 'animate-float-delayed' },
  { emoji: '🎉', size: 'text-2xl', left: '7%',  top: '82%', anim: 'animate-float-delayed' },
  { emoji: '💫', size: 'text-3xl', left: '30%', top: '89%', anim: 'animate-float' },
  { emoji: '🏃', size: 'text-2xl', left: '52%', top: '84%', anim: 'animate-float-delayed' },
  { emoji: '✨', size: 'text-2xl', left: '73%', top: '91%', anim: 'animate-float' },
  { emoji: '🔥', size: 'text-2xl', left: '46%', top: '37%', anim: 'animate-float' },
  { emoji: '💪', size: 'text-2xl', left: '91%', top: '35%', anim: 'animate-float-delayed' },
  { emoji: '🏆', size: 'text-2xl', left: '63%', top: '78%', anim: 'animate-float' },
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
