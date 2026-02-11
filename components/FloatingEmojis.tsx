'use client';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 */

const EMOJIS = [
  // 最適化: 18→12要素に削減（パフォーマンス改善）
  // --- 上部エリア ---
  { emoji: '💪', size: 'text-3xl', left: '38%', top: '3%',  anim: 'animate-float',          mobileHide: false },
  { emoji: '🏃', size: 'text-5xl', left: '3%',  top: '5%',  anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '✨', size: 'text-lg',  left: '72%', top: '10%', anim: 'animate-float',           mobileHide: false },
  { emoji: '🎯', size: 'text-xl',  left: '88%', top: '15%', anim: 'animate-float-delayed',  mobileHide: false },
  // --- 中部エリア ---
  { emoji: '🏆', size: 'text-5xl', left: '60%', top: '20%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '🎉', size: 'text-xl',  left: '55%', top: '32%', anim: 'animate-float',          mobileHide: false },
  { emoji: '👟', size: 'text-4xl', left: '15%', top: '38%', anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '💫', size: 'text-5xl', left: '82%', top: '42%', anim: 'animate-float-delayed',  mobileHide: false },
  // --- 下部エリア ---
  { emoji: '🔥', size: 'text-5xl', left: '75%', top: '55%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '🎉', size: 'text-lg',  left: '70%', top: '70%', anim: 'animate-float',          mobileHide: false },
  { emoji: '🏆', size: 'text-xl',  left: '8%',  top: '75%', anim: 'animate-float',          mobileHide: false },
  { emoji: '⚡', size: 'text-4xl', left: '48%', top: '82%', anim: 'animate-float-delayed',  mobileHide: false },
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
