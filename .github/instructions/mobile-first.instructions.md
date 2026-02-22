---
applyTo: "components/**/*.tsx,app/**/*.tsx"
---

# モバイルファースト設計ルール

UCFitness は PWA であり、**モバイル端末での利用が主要ユースケース**。
すべての UI 変更・新規コンポーネント作成時に以下を厳守すること。

## レイアウト原則

- **モバイルファースト**: まずモバイル（`w-full`, `flex-col`）でレイアウトし、`sm:` / `md:` / `lg:` で拡張
- **横スクロール禁止**: `overflow-x-hidden` を意識し、`w-screen` や固定幅（`w-[500px]` 等）を使わない
- **画像・カード**: `w-full` + `max-w-*` で制御し、固定幅を使わない
- **モーダル・ドロップダウン**: モバイルでは全幅 or ボトムシート風にする

## タッチターゲット

- ボタン・リンクは最低 **44×44px** のタップ領域を確保する（`min-h-[44px] min-w-[44px]`）
- インタラクティブ要素同士が近接しすぎないように margin / gap を確保

## テキストサイズ階層

| 要素 | モバイル | sm 以上 |
|---|---|---|
| 本文 | `text-sm` / `text-xs` | `sm:text-base` |
| 見出し | `text-xl` ～ `text-2xl` | `sm:text-3xl` ～ `sm:text-4xl` |
| ラベル | `text-xs` | `sm:text-sm` |

## スペーシング

| 要素 | モバイル | sm / lg |
|---|---|---|
| パディング | `px-4 py-3` | `sm:px-6 lg:px-8` |
| グリッド | `grid-cols-1` | `sm:grid-cols-2 lg:grid-cols-3` |

## 禁止パターン

- `text-[9px]`, `text-[10px]`, `text-[11px]` — すべて `text-xs` (12px) 以上にする（Beta バッジのみ例外）
- カスタムフォントサイズ指定 (`text-[Npx]`) より Tailwind のユーティリティクラスを優先
