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
  { emoji: '💪', size: 'text-xl', left: '1.5%',  top: '14%', anim: 'animate-float',         mobileHide: true },
  { emoji: '✨', size: 'text-base', left: '97.5%', top: '10%', anim: 'animate-float',        mobileHide: true },
  { emoji: '🎯', size: 'text-lg', left: '97%', top: '30%', anim: 'animate-float-delayed',   mobileHide: true },
  { emoji: '🏃', size: 'text-xl', left: '1%', top: '52%', anim: 'animate-float-delayed',    mobileHide: true },
  { emoji: '👟', size: 'text-lg', left: '97%', top: '64%', anim: 'animate-float',           mobileHide: true },
  { emoji: '🏆', size: 'text-lg', left: '1.5%', top: '82%', anim: 'animate-float',          mobileHide: true },
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
      style={{ zIndex: 30 }}
      aria-hidden="true"
    >
      {EMOJIS.map((item, i) => (
        <span
          key={i}
          className={`absolute emoji-float ${reducedMotion ? '' : item.anim} ${item.size}${item.mobileHide ? ' hidden sm:block' : ''}`}
          style={{
            left: item.left,
            top: item.top,
            opacity: 0.18,
            filter: 'saturate(0.9) brightness(0.95)',
          }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
});

export default FloatingEmojis;
