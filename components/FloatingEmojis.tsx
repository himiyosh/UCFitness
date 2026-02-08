'use client';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 */

const EMOJIS = [
  // 散布配置: モバイルで見える12個がグリッドに見えないよう、不規則な座標に配置
  // --- 上部エリア ---
  { emoji: '💪', size: 'text-3xl', left: '38%', top: '3%',  anim: 'animate-float',          mobileHide: false },
  { emoji: '🏃', size: 'text-5xl', left: '3%',  top: '5%',  anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '✨', size: 'text-lg',  left: '72%', top: '10%', anim: 'animate-float',           mobileHide: false },
  { emoji: '🎯', size: 'text-xl',  left: '88%', top: '15%', anim: 'animate-float-delayed',  mobileHide: false },
  // --- 上中部 (モバイル非表示で隙間を埋める) ---
  { emoji: '🏆', size: 'text-5xl', left: '60%', top: '20%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '🔥', size: 'text-2xl', left: '25%', top: '22%', anim: 'animate-float',          mobileHide: true },
  { emoji: '⚡', size: 'text-lg',  left: '90%', top: '26%', anim: 'animate-float',          mobileHide: true },
  // --- 中部エリア ---
  { emoji: '🎉', size: 'text-xl',  left: '55%', top: '32%', anim: 'animate-float',          mobileHide: false },
  { emoji: '👟', size: 'text-4xl', left: '15%', top: '38%', anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '💫', size: 'text-5xl', left: '82%', top: '42%', anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '🏃', size: 'text-lg',  left: '30%', top: '48%', anim: 'animate-float',          mobileHide: false },
  // --- 下中部 (モバイル非表示) ---
  { emoji: '🔥', size: 'text-5xl', left: '75%', top: '55%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '✨', size: 'text-3xl', left: '18%', top: '58%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '💪', size: 'text-lg',  left: '45%', top: '62%', anim: 'animate-float',          mobileHide: true },
  // --- 下部エリア ---
  { emoji: '🎉', size: 'text-lg',  left: '70%', top: '70%', anim: 'animate-float',          mobileHide: false },
  { emoji: '🏆', size: 'text-xl',  left: '8%',  top: '75%', anim: 'animate-float',          mobileHide: false },
  { emoji: '⚡', size: 'text-4xl', left: '48%', top: '82%', anim: 'animate-float-delayed',  mobileHide: false },
  { emoji: '👟', size: 'text-3xl', left: '92%', top: '85%', anim: 'animate-float-delayed',  mobileHide: false },
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
