'use client';

import { memo, useEffect, useState } from 'react';

/**
 * 背景に浮遊する絵文字を表示するデコレーションコンポーネント
 * Landing Page と同じ float アニメーション + テーマ別フィルターで
 * ダッシュボードにもポップな雰囲気を与える
 *
 * prefers-reduced-motion が有効な場合はアニメーションを停止し静的表示にする
 */

// 絵文字の配置を最適化: コンテンツ領域と重ならないようにマージン周辺に配置
// モバイルでは全て非表示 (コンテンツ密度が高いためノイジーになる)
const EMOJIS = [
  // --- デスクトップの余白エリアのみに配置 (右端のデッドスペース) ---
  { emoji: '💪', size: 'text-2xl', left: '2%',  top: '12%', anim: 'animate-float',          mobileHide: true },
  { emoji: '✨', size: 'text-lg',  left: '95%', top: '8%',  anim: 'animate-float',          mobileHide: true },
  { emoji: '🎯', size: 'text-xl',  left: '93%', top: '25%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '🏃', size: 'text-2xl', left: '1%',  top: '45%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '👟', size: 'text-xl',  left: '94%', top: '50%', anim: 'animate-float',          mobileHide: true },
  { emoji: '🎉', size: 'text-lg',  left: '96%', top: '72%', anim: 'animate-float-delayed',  mobileHide: true },
  { emoji: '🏆', size: 'text-xl',  left: '2%',  top: '78%', anim: 'animate-float',          mobileHide: true },
  { emoji: '⚡', size: 'text-lg',  left: '93%', top: '88%', anim: 'animate-float-delayed',  mobileHide: true },
] as const;

const FloatingEmojis = memo(function FloatingEmojis() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: -1 }}
      aria-hidden="true"
    >
      {EMOJIS.map((item, i) => (
        <span
          key={i}
          className={`absolute emoji-float ${reducedMotion ? '' : item.anim} ${item.size}${item.mobileHide ? ' hidden sm:block' : ''}`}
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
});

export default FloatingEmojis;
