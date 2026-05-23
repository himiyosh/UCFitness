# UCFitness デザイントークンシステム

UCFitness の全 UI コンポーネントで使用されるデザイントークンの定義。
Material Design 3 (M3) と Apple HIG のハイブリッド設計言語に基づく。

---

## カラートークン

### テーマカラー (CSS カスタムプロパティ)

全テーマ共通の契約。テーマ切替は `data-theme` 属性で制御。

| トークン | 用途 | Classic (デフォルト) |
|----------|------|---------------------|
| `--theme-primary` | メインブランドカラー | `#4F46E5` |
| `--theme-primary-light` | 淡い背景・バッジ | `#EEF2FF` |
| `--theme-secondary` | セカンダリカラー | `#9333EA` |
| `--theme-accent` | アクセント | `#4F46E5` |
| `--theme-gradient-from` | グラデーション開始 | `#4F46E5` |
| `--theme-gradient-to` | グラデーション終了 | `#9333EA` |
| `--theme-badge-bg` | バッジ背景 | `#EEF2FF` |
| `--theme-badge-text` | バッジテキスト | `#4F46E5` |
| `--theme-page-bg` | ページ背景 | `transparent` |
| `--theme-header-bg` | ヘッダー背景 | `#EEF2FF` |

### テーマ一覧

| テーマ名 | `data-theme` | Primary | 種別 |
|----------|-------------|---------|------|
| Classic | (なし) | `#4F46E5` | ライト・無料 |
| Pop & Fun | `pop` | `#FF6B6B` | ライト・無料 |
| Midnight | `midnight` | `#6366f1` | ダーク・有料 |
| Sakura | `sakura` | `#EC4899` | ライト・有料 |
| Ocean | `ocean` | `#0891B2` | ライト・有料 |
| Forest | `forest` | `#059669` | ライト・有料 |
| Sunset | `sunset` | `#EA580C` | ライト・有料 |
| Cyberpunk | `cyberpunk` | `#7C3AED` | ライト・有料 |
| Galaxy | `galaxy` | `#8B5CF6` | ライト・有料 |

### アクセントカラー

| トークン | 値 | 用途 |
|----------|-----|------|
| `--accent-coral` | `#FF6B6B` | Pop テーマ・ハイライト |
| `--accent-turquoise` | `#4ECDC4` | ターコイズアクセント |
| `--accent-lime` | `#95E500` | 達成・成功 |
| `--accent-pink` | `#FF85A2` | ピンクアクセント |
| `--accent-yellow` | `#FFE66D` | イエロー・ゴールド |
| `--accent-purple` | `#A855F7` | パープルアクセント |

### M3 Surface トークン

| トークン | 値 | 用途 |
|----------|-----|------|
| `--surface-dim` | `rgba(0,0,0,0.03)` | 薄い影 |
| `--surface-base` | `rgba(255,255,255,1)` | 基本面 |
| `--surface-container-low` | `rgba(247,248,250,1)` | 低コントラスト面 |
| `--surface-container` | `rgba(243,244,248,1)` | 標準コンテナ |
| `--surface-container-high` | `rgba(236,238,243,1)` | 高コントラスト面 |
| `--surface-container-highest` | `rgba(229,231,237,1)` | 最高コントラスト面 |

---

## シェイプトークン (M3)

| トークン | 値 | 用途 |
|----------|-----|------|
| `--radius-xs` | `4px` | チップ、バッジ |
| `--radius-sm` | `8px` | 小ボタン、入力フィールド |
| `--radius-md` | `12px` | カード、ダイアログ |
| `--radius-lg` | `16px` | 大きなカード、シート |
| `--radius-xl` | `24px` | FAB、ボトムシート |
| `--radius-full` | `9999px` | ピル型ボタン |

---

## モーショントークン (M3)

| トークン | 持続時間 | イージング | 用途 |
|----------|----------|-----------|------|
| `--motion-emphasized` | `--motion-emphasized-duration: 500ms` | `cubic-bezier(0.2, 0, 0, 1)` | ページ遷移、モーダル |
| `--motion-standard` | `--motion-standard-duration: 300ms` | `cubic-bezier(0.2, 0, 0, 1)` | カード、ボタン等 |
| `--motion-deemphasized` | `--motion-deemphasized-duration: 200ms` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | 微細なフィードバック |
| `--spring` | — | `cubic-bezier(0.22, 1, 0.36, 1)` | Apple 風スプリング |

---

## シャドウトークン

Tailwind `@theme` でオーバーライド済み:

| トークン | 値 |
|----------|-----|
| `--shadow-sm` | `0 4px 16px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.02)` |
| `--shadow-md` | `0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)` |
| `--shadow-lg` | `0 16px 48px rgba(0,0,0,0.1), 0 4px 16px rgba(0,0,0,0.06)` |

---

## ユーティリティクラス

### カードスタイル

| クラス | 用途 | 特徴 |
|--------|------|------|
| `.glass-card` | ガラスモーフィズムカード | `backdrop-blur(12px)`, 半透明白背景 |
| `.card-elevated` | M3 浮き上がりカード | `surface-container-low` + 多層シャドウ |
| `.card-filled` | M3 塗りつぶしカード | `surface-container-high` |
| `.card-outlined` | M3 アウトラインカード | 白背景 + ボーダー |
| `.midnight-solid-panel` | Midnight テーマ専用の不透明パネル | 多層グラデーション + `backdrop-filter` |

### ボタンスタイル

| クラス | 用途 | 特徴 |
|--------|------|------|
| `.btn-filled` | プライマリボタン | テーマカラー塗り + 白テキスト + ピル型 |
| `.btn-tonal` | トーナルボタン | `primary-light` 背景 + テーマカラーテキスト |

### インタラクション

| クラス | 用途 | 特徴 |
|--------|------|------|
| `.state-layer` | M3 ステートレイヤー | `::after` 疑似要素 (hover 0.08, focus 0.12) |
| `.glass` | Apple 風 glass morphism | `backdrop-filter: blur(20px) saturate(180%)` |

### スクロールバー

| クラス | 用途 |
|--------|------|
| `.scrollbar-thin` | 細いスクロールバー（フィードエリア） |
| `.styled-scrollbar` | カスタムスクロールバー |
| `.scrollbar-hide` | スクロールバー非表示 |

---

## タイポグラフィ

### フォントファミリー

```css
body {
  font-family: var(--font-inter), var(--font-noto-sans-jp), -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

### テキストサイズ指針（Tailwind ユーティリティ）

| モバイル | デスクトップ | 用途 |
|----------|-------------|------|
| `text-xs` (12px) | `sm:text-sm` (14px) | キャプション、ヒント |
| `text-sm` (14px) | `sm:text-base` (16px) | 本文テキスト |
| `text-base` (16px) | `sm:text-lg` (18px) | エンファサイズ |
| `text-xl` (20px) | `sm:text-2xl` (24px) | セクション見出し |
| `text-2xl` (24px) | `sm:text-3xl` (30px) | ページタイトル |

---

## アクセシビリティトークン

### コントラスト基準 (WCAG AA)

- 通常テキスト: 4.5:1 以上
- 大きなテキスト (24px+): 3:1 以上
- フォーカスインジケーター: 3:1 以上

### メディアクエリ

| メディアクエリ | 用途 |
|---------------|------|
| `prefers-reduced-motion: reduce` | 全アニメーション無効化 |
| `forced-colors: active` | Windows ハイコントラスト対応 |

### Forced Colors モードの対応

Forced Colors モードでは `backdrop-filter`, `box-shadow`, グラデーションが無効化されるため、
`border` と system color keywords (`ButtonBorder`, `Canvas`, `CanvasText`, `Highlight` 等) で視認性を確保。

---

## 使用例

### テーマカラーの使用

```tsx
// プライマリボタン
<button className="bg-[var(--theme-primary)] text-white rounded-full px-6 py-2">
  アクション
</button>

// グラデーションテキスト
<h1 className="bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
  タイトル
</h1>

// ガラスカード
<div className="glass-card rounded-2xl p-4">
  コンテンツ
</div>
```

### テーマの変更

テーマは `ThemeProvider` (`components/ThemeProvider.tsx`) で管理。
`localStorage` に保存され、`document.documentElement` の `data-theme` 属性で切替。

```tsx
import { useTheme } from '@/components/ThemeProvider';

const { theme, setTheme } = useTheme();
setTheme('sakura'); // テーマを変更
```
