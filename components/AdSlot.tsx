'use client';

// ============================================
// AdSlot — 広告スロット共通コンポーネント
// AdSense 導入準備用。現在はプレースホルダーのみ。
// 将来的に Google AdSense またはアフィリエイトウィジェットを挿入可能。
// ============================================

export type AdSlotType = 'header-banner' | 'content-between' | 'sidebar' | 'footer';

interface AdSlotProps {
    slot: AdSlotType;
    className?: string;
}

/**
 * 広告スロットコンポーネント
 *
 * 現段階では空の div を出力するのみ（AdSense 準備中）。
 * AdSense 承認後に `data-ad-client` / `data-ad-slot` を追加し、
 * Google AdSense スクリプトを layout.tsx に挿入することで有効化。
 *
 * 使用例:
 * ```tsx
 * <AdSlot slot="content-between" />
 * ```
 */
export default function AdSlot({ slot, className = '' }: AdSlotProps) {
    // 現在は広告を表示しない（AdSense 準備中）
    // 有効化時はここに AdSense コードを挿入
    return (
        <div
            data-ad-slot={slot}
            className={`ad-slot ad-slot-${slot} ${className}`}
            aria-hidden="true"
        />
    );
}
