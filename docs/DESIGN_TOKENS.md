# UCFitness デザイントークンシステム

UCFitness の全 UI コンポーネントで使用されるデザイントークンの定義。
Material Design 3 (M3) と Apple HIG のハイブリッド設計言語に基づく。

---

## カラートークン

### プロ品質リデザイン用セマンティックトークン

大幅リデザイン以降は、画面実装ではまず意味ベースの `--color-*` を優先する。
既存の `--theme-*` は互換性とテーマ切替のために残すが、通常 UI の色判断は以下の契約に寄せる。

| トークン | 用途 | Default |
|----------|------|---------|
| `--color-bg` | ページ背景 | `#F6F7F9` |
| `--color-surface` | 基本カード・面 | `#FFFFFF` |
| `--color-surface-muted` | 進捗バー背景・薄い面 | `#EEF1F5` |
| `--color-surface-raised` | 強調面 | `#FFFFFF` |
| `--color-text` | 主要テキスト | `#111827` |
| `--color-text-muted` | 補助テキスト | `#5B6472` |
| `--color-border` | 境界線 | `#DDE3EA` |
| `--color-primary` | 主 CTA・選択状態 | `#2563EB` |
| `--color-primary-strong` | 主色の淡い面上に置く文字・アイコン | `#1D4ED8` |
| `--color-primary-soft` | 主 CTA の淡い背景 | `#DBEAFE` |
| `--color-primary-solid` | 白文字を載せるプライマリ塗り面 | `#1D4ED8` |
| `--color-success` | 達成・同期成功 | `#16A34A` |
| `--color-success-strong` | 達成面上の文字・アイコン | `#166534` |
| `--color-success-soft` | 達成・同期成功の淡い面 | `#DCFCE7` |
| `--color-warning` | 注意・期限間近 | `#D97706` |
| `--color-danger` | エラー・破壊的操作 | `#DC2626` |
| `--color-reward` | UC・報酬・バッジ | `#B7791F` |
| `--color-reward-strong` | 報酬面上の文字・アイコン | `#92400E` |
| `--color-reward-soft` | UC・報酬の淡い面 | `#FEF3C7` |
| `--color-reward-solid` | 白文字を載せる報酬塗り面 | `#92400E` |
| `--color-competition` | 順位・対戦・グループ競争 | `#7C3AED` |
| `--color-competition-strong` | 競争面上の文字・アイコン | `#5B21B6` |
| `--color-competition-soft` | 競争・順位の淡い面 | `#EDE9FE` |
| `--color-competition-solid` | 白文字を載せる競争色の塗り面 | `#6D28D9` |
| `--color-play` | 公開 LP の楽しさ・最終導線 | `#E11D48` |
| `--color-play-soft` | 楽しさ・最終導線の淡い面 | `#FFE4E6` |
| `--color-inverse-surface` | 濃色ヒーロー・黒系CTA・プロダクトモック背景 | `#0F172A` |
| `--color-inverse-text` | 濃色面の文字 | `#FFFFFF` |

#### 使用ルール

- 通常画面は `--color-bg` と `--color-surface` を基本にし、装飾目的の全面グラデーションを避ける。
- `--color-primary` はアクセント文字、選択状態、重要な進捗だけに使う。
- 淡い主色面の文字には `--color-primary-strong`、白文字を載せる塗り面には `--color-primary-solid` を使い分ける。
- 白文字を載せる塗り CTA には `--color-primary` ではなく `--color-primary-solid` を使う。
- 報酬表現は `--color-reward` に限定し、健康データより前面に出しすぎない。
- 白文字付きの報酬ボタン・アイコンには `--color-reward-solid` を使用し、境界用の `--color-reward` を背景へ流用しない。
- 競争表現は `--color-competition`、達成表現は `--color-success` に分け、色だけでなくラベルやアイコンも併用する。
- 競争色を白文字付きの塗り面に使う場合は `--color-competition-solid` を使用し、文字・境界用の `--color-competition` と兼用しない。
- 公開 LP は Full Palette の例外とし、青=目標、緑=達成、紫=競争、アンバー=報酬を同一画面で使える。ただし各色の意味を混在させない。
- 保存済みテーマは公開 LP にも適用されるため、暗色テーマでは `strong` / `soft` の組を同時に上書きし、各 `strong` 色を対応する `soft` 面と基本 `surface` 面の両方で検証する。
- 公開 LP でもグラデーション文字、暗色全面ヒーロー、青紫ぼかし中心の SaaS 表現は使わない。
- 濃色面や黒系 CTA には `--color-text` を背景として使わず、必ず `--color-inverse-surface` と `--color-inverse-text` を使う。
- 半透明テキストや低コントラストの淡色文字は避ける。
- 旧 `--accent-*` は Pop テーマや限定演出用とし、通常 UI では新規使用しない。

### テーマカラー (CSS カスタムプロパティ)

全テーマ共通の契約。テーマ切替は `data-theme` 属性で制御。

| トークン | 用途 | Classic (デフォルト) |
|----------|------|---------------------|
| `--theme-primary` | メインブランドカラー | `var(--color-primary)` |
| `--theme-primary-light` | 淡い背景・バッジ | `var(--color-primary-soft)` |
| `--theme-secondary` | セカンダリカラー | `#1D4ED8` |
| `--theme-accent` | アクセント | `var(--color-primary)` |
| `--theme-gradient-from` | 限定グラデーション開始 | `var(--color-primary)` |
| `--theme-gradient-to` | 限定グラデーション終了 | `#0F172A` |
| `--theme-badge-bg` | バッジ背景 | `var(--color-primary-soft)` |
| `--theme-badge-text` | バッジテキスト | `var(--color-primary)` |
| `--theme-page-bg` | ページ背景 | `var(--color-bg)` |
| `--theme-header-bg` | ヘッダー背景 | `var(--color-surface)` |

### テーマ一覧

| テーマ名 | `data-theme` | Primary | 種別 |
|----------|-------------|---------|------|
| Classic | (なし) | `#2563EB` | ライト・無料 |
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

### 公開LPのモーション契約

- 初回表示はヒーロー本文とプロダクトプレビューの短い導入に限定し、コンテンツを `opacity: 0` のまま待機させない。
- 歩数リングと進捗バーは前進、順位グラフは成長、報酬は一度だけの到達として動きを割り当てる。
- 読めるテキストを含む要素はアニメーション中も `opacity: 1` を維持し、変形・SVG描画・独立した装飾レイヤーで動きを表現する。
- Scroll-driven Animations は `@supports (animation-timeline: ...)` 内だけで使用し、未対応ブラウザでは完成状態をそのまま表示する。
- `prefers-reduced-motion: reduce` ではスクロール進捗を非表示にし、変形・反復・描画アニメーションを停止する。
- 複数の `animation` shorthand を同一要素へ重ねず、導入と常時の微細な動きは親子要素へ分離する。

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
| `.glass-card` | 限定的なガラスモーフィズムカード | ヘッダー・特別演出のみ。通常カードには使わない |
| `.card-elevated` | M3 浮き上がりカード | `surface-container-low` + 多層シャドウ |
| `.card-filled` | M3 塗りつぶしカード | `surface-container-high` |
| `.card-outlined` | M3 アウトラインカード | 白背景 + ボーダー |
| `.midnight-solid-panel` | Midnight テーマ専用の不透明パネル | 多層グラデーション + `backdrop-filter` |

通常の情報カードは `bg-[var(--color-surface)] border border-[var(--color-border)]` を基本とし、
影は `shadow-sm` または `--shadow-professional-soft` までに抑える。

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

### 認証ページ導入部

- 標準認証ページは`AuthenticatedPageHeader` + `PageIntro`を使用する。
- ヘッダーのブランドは多色`AppBrandMark` + solid wordmarkとし、見出し階層へ含めない。
- `PageIntro`がパンくず、ページ唯一の`h1`、説明、意味色アイコン、単色アクセントを持つ。
- ページタイトルへグラデーション文字や広域CSSによるサイズ上書きを適用しない。
- 基準幅は`max-w-7xl`、左右余白は`px-4 sm:px-6 lg:px-8`、導入部の縦余白は`py-4 sm:py-6`とする。

### 狭幅・Sidebar境界

- 320〜767px: 1列、BottomNav、全幅Footer、全操作44×44px以上。
- 768〜1023px: 1〜2列。カード幅を優先し、詳細な3列化を行わない。
- 1024〜1279px: Sidebarは表示するが、本文の実効幅は約768px。Home/Groups/Settingsは単列または2列、Shopは3列を上限とする。
- 1280px以上: main+asideと2〜3列を許可する。Sidebar後のHome 4モジュールは2列を維持し、4列化は1536px以上に限定する。
- 通常ページはdocumentの自然スクロールを使用し、`max-height` + `overflow-y-auto`で本文を固定しない。
- `sr-only` tableはwrapperをabsolute 1×1pxにし、Footer後の残余高を作らない。

### Home Quest / Delight

- Quest面: `--color-primary-*`で今日の進捗を主役化し、同じ面内で競争=`--color-competition-*`、歩いた価値=`--color-reward-*`、達成=`--color-success-*`へ接続する。
- 緊急期限は`--color-danger-strong`を使用し、competition soft面でも通常文字4.5:1以上を維持する。
- 通知バッジ等の白文字付き危険色面は`--color-danger-solid`を使用する。Midnightの前景用`--color-danger`を塗り面へ流用しない。
- 情報順: 進捗 → ライバル → 歩いた価値 → 次の一歩。後続はMission → Weekly → Reward → Challenge → Utility → Ranking。
- Utility Dockは全認証幅で表示し、BottomNav・Sidebar・Reward panelと重ならないAnalytics / Link Builder / Group Create / Settingsだけを表示する。Challenge後は「任意探索」の見出しを置き、日次必須導線の終点を明示する。
- 低活動時は`0`を反復せず、「ここから」「次の100歩」「まず500歩」等の未来志向を使用する。
- Motionはscale/translate/進捗描画のみ、120〜650ms、状態変化1回。`prefers-reduced-motion`ではanimation/transitionともcomputed `0s`にする。
- 同一カード文法を繰り返さず、Quest・Mission・Weekly・Reward・Challengeで面・区切り・アイコンの役割を変える。
- 0歩コピーは未記録・記録済み0歩・ランキング参加済みを分離する。ミッションの短い祝福motionは補助とし、状態通知と獲得報酬を時間制限なしでも確認できるようにする。

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
<button className="bg-[var(--color-primary-solid)] text-white rounded-full px-6 py-2">
  アクション
</button>

// 意味色を使った見出し
<h1 className="text-[var(--color-primary-strong)]">
  タイトル
</h1>

// ガラスカード
<div className="glass-card rounded-2xl p-4">
  コンテンツ
</div>
```

### テーマの変更

テーマは `ThemeProvider` (`components/ThemeProvider.tsx`) で管理。
明示的な端末内選択は `localStorage` に保存され、`document.documentElement` の `data-theme` 属性で切替。
保存値がない端末では、DBの装備テーマを初期フォールバックとして使う。フォールバック自体は
`localStorage` へ固定せず、別端末で装備を変更した際に古い値が優先され続けないようにする。
item codeとアプリテーマの変換は `lib/theme.ts` を単一の正本とする。

```tsx
import { useTheme } from '@/components/ThemeProvider';

const { theme, setTheme } = useTheme();
setTheme('sakura'); // テーマを変更
```
