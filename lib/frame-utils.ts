/**
 * フレームカラー変換ユーティリティ
 * Server Component / Client Component 両方から安全に使用可能
 * ('use client' 宣言なし = 共有モジュール)
 */

/** Tailwind ring クラス → CSS hex カラー変換マップ */
const FRAME_COLOR_MAP: Record<string, string> = {
  'ring-green-400': '#4ade80',
  'ring-blue-400': '#60a5fa',
  'ring-yellow-400': '#facc15',
  'ring-cyan-300': '#67e8f9',
  'ring-purple-500': '#a855f7',
  'ring-rose-400': '#fb7185',
  'ring-orange-400': '#fb923c',
  'ring-teal-400': '#2dd4bf',
  'ring-red-500': '#ef4444',
  'ring-indigo-500': '#6366f1',
  'ring-emerald-500': '#10b981',
  'ring-amber-500': '#f59e0b',
  'ring-pink-500': '#ec4899',
  'ring-sky-400': '#38bdf8',
  'ring-rainbow': 'rainbow',
};

/** フレームの preview_value (Tailwind クラス名) から CSS カラーに変換 */
export function getFrameColor(previewValue: string): string {
  return FRAME_COLOR_MAP[previewValue] || '#d1d5db';
}

/** レインボーフレームかどうか */
export function isRainbowFrame(color: string): boolean {
  return color === 'rainbow';
}
