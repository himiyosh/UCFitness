'use client';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 */

const EMOJIS = [
  // Row 1 (top: 6%) — left: 5%, 32%, 58%, 85%
  { emoji: '🏃', size: 'text-5xl', left: '5%',  top: '6%',  anim: 'animate-float',         mobileHide: false },
  { emoji: '✨', size: 'text-lg',  left: '32%', top: '6%',  anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '💪', size: 'text-3xl', left: '58%', top: '6%',  anim: 'animate-float',          mobileHide: false },
  { emoji: '🎯', size: 'text-xl',  left: '85%', top: '6%',  anim: 'animate-float-delayed',  mobileHide: false },
  // Row 2 (top: 28%) — モバイル非表示
  { emoji: '🔥', size: 'text-2xl', left: '20%', top: '28%', anim: 'animate-float',          mobileHide: true },
  { emoji: '🏆', size: 'text-5xl', left: '50%', top: '28%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '⚡', size: 'text-lg',  left: '78%', top: '28%', anim: 'animate-float',          mobileHide: true },
  // Row 3 (top: 42%) — left: 18%, 45%, 72%, 94%（Row 1から+13%オフセット）
  { emoji: '👟', size: 'text-4xl', left: '18%', top: '42%', anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '🎉', size: 'text-xl',  left: '45%', top: '42%', anim: 'animate-float',          mobileHide: false },
  { emoji: '💫', size: 'text-5xl', left: '72%', top: '42%', anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '🏃', size: 'text-lg',  left: '94%', top: '42%', anim: 'animate-float',          mobileHide: false },
  // Row 4 (top: 68%) — モバイル非表示
  { emoji: '✨', size: 'text-3xl', left: '20%', top: '68%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '💪', size: 'text-lg',  left: '50%', top: '68%', anim: 'animate-float',          mobileHide: true },
  { emoji: '🔥', size: 'text-5xl', left: '78%', top: '68%', anim: 'animate-float-delayed',  mobileHide: true },
  // Row 5 (top: 82%) — left: 10%, 38%, 65%, 90%（Row 1/3の中間）
  { emoji: '🏆', size: 'text-xl',  left: '10%', top: '82%', anim: 'animate-float',          mobileHide: false },
  { emoji: '⚡', size: 'text-4xl', left: '38%', top: '82%', anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '🎉', size: 'text-lg',  left: '65%', top: '82%', anim: 'animate-float',          mobileHide: false },
  { emoji: '👟', size: 'text-3xl', left: '90%', top: '82%', anim: 'animate-float-delayed',  mobileHide: false },
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
          className={`absolute emoji-float ${item.anim} ${item.size}${item.mobileHide ? ' hidden sm:block' : ''}`}
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
