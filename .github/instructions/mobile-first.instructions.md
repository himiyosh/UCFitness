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

## 高解像度ディスプレイ対応 (QHD+ / 4K+)

UCFitness は 0.9x デスクトップスケーリング (`body { transform: scale(0.9) }`) を 1024px+ で適用している。
高解像度ディスプレイでは `max-w-7xl` (1280px) だと左右の余白が過大になるため、以下の対応が必要。

### コンテンツ幅の段階拡張

| ビューポート幅 | `max-w-7xl` の実効値 | 備考 |
|---|---|---|
| 〜2559px | 1280px (デフォルト) | FHD / WQXGA |
| 2560px〜3839px | 1536px (globals.css で上書き) | QHD / WQHD |
| 3840px〜 | 1920px (globals.css で上書き) | 4K UHD |

- **globals.css で `@media (min-width: 2560px) / (min-width: 3840px)` により `.max-w-7xl` を上書き済み**
- 個別ページで `max-w-7xl` を変更する必要はない

### グリッドカラム拡張

高解像度ではカード一覧のカラム数を `2xl:` ブレイクポイント (1536px) で拡張する:

| コンテンツ種別 | 通常 | 2xl+ |
|---|---|---|
| ショップアイテム | `lg:grid-cols-4` | `2xl:grid-cols-5` |
| チャレンジ一覧 | `md:grid-cols-2` | `2xl:grid-cols-3` |
| グループ一覧 | `md:grid-cols-2` | `2xl:grid-cols-3` |

### 禁止パターン

- `max-w-full` や `max-w-none` でコンテンツ幅を無制限にしない
- テキスト行長が 80 文字を超えないように `max-w-prose` を適用（テキスト中心セクション）
- 4K でカードが水平に引き伸ばされないように、カードには `max-w-*` またはグリッドの固定幅を使用
