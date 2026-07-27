# UCFitness — GitHub Copilot 共通指示

## アプリケーション概要

UCFitness は Fitbit 連携の歩数トラッキング・フィットネス競争アプリ (PWA)。

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router), React 18.3.1, TypeScript
- **スタイリング**: Tailwind CSS v4, CSS カスタムプロパティ (テーマ)
- **認証**: NextAuth v5 (beta)
- **DB**: Supabase (PostgreSQL)
- **i18n**: next-intl (ja/en)
- **デプロイ**: Cloudflare Pages
- **チャート**: Recharts
- **MCP サーバー**: Supabase MCP (`com.supabase/mcp`) — SQL 実行・テーブル管理・マイグレーション・ログ取得に使用。プロジェクト ID: `lmqpkoyypxccdbtgycty`

## 絶対遵守ルール

### ブランチ保護

- **main/master への直接 push は禁止** — 必ずユーザーの明示的な承認を得ること
- **PR merge (gh pr merge, git merge) も承認なしに禁止**
- PR の作成 (`gh pr create`) までは許可

### コーディング規約

- テーマ: `var(--theme-primary)` 等の CSS カスタムプロパティを使用
- `dark:` は使用しない (テーマシステムで対応済み)
- `framer-motion` は使用しない
- 新しい外部ライブラリは追加しない
- 既存の関数・export は絶対に削除しない
- ファイル末尾には必ず改行を入れる

### Modern Web Guidance 適用ルール

- **対象タスク**: HTML / CSS / クライアントサイド JS / React UI / フォーム / ダイアログ / ポップオーバー / スクロール / モーション / LCP・INP・CLS 改善では、実装前に必ず `modern-web-guidance` skill を参照する
- **検索優先**: まず `npx -y modern-web-guidance@latest search "<具体的なユースケース>" --skill-version 2026_05_16-c5e7870` で関連 guide ID を特定し、必要な guide を retrieve してから設計・実装する
- **ブラウザサポート方針**: UCFitness は Baseline 2024 を基準にする。Baseline 2024 以内の機能はフォールバックなしで使用可。Baseline 2025 以降または Newly available の機能は、機能検出と軽量フォールバックを用意できる場合のみ採用する。新規 polyfill や外部ライブラリ追加は事前確認必須
- **CSS 方針**: 既存の Tailwind + CSS カスタムプロパティを維持しつつ、状態表現は不要な JS state より `:has()` / `:where()` / `:not()` 等のブラウザ標準セレクタを優先する。ただしセレクタは狭く保ち、`body:has(...)` のような広域監視は避ける
- **レイアウト方針**: 固定幅・固定高さより intrinsic sizing、`aspect-ratio`、`minmax()`、container query units、`min-width: 0` を優先し、横スクロールと CLS を防ぐ
- **パフォーマンス方針**: Above-the-fold の LCP 画像は lazy load しない。必要な `width` / `height` / `sizes` / `fetchpriority` を明示する。長いクライアント処理は 50ms を目安に分割し、重い処理は `scheduler.yield()` フォールバックまたは Web Worker を検討する
- **公開面はServer-first**: 未認証LPの静的本文・翻訳はServer Componentで描画し、言語切替、ブラウザ保存値、局所スクロールなどにClient islandを限定する。ページ全体を`'use client'`へ戻さない
- **日本語Webフォントを無測定でグローバル配信しない**: `next/font`で日本語フォントを複数weight指定すると、unicode-range CSSとフォント転送がLCPを支配し得る。本文はHiragino Sans / Yu Gothic / Meiryoのシステムスタックを既定とし、Webフォント採用時は生成CSSサイズ、転送量、Fast 3G相当のLCPを実測する。リファレンス: `app/[locale]/layout.tsx`, `app/globals.css`
- **テキストLCP候補を初期モーションで遅延させない**: ファーストビューの主要見出し・説明へ初期`opacity`や`transform`アニメーションを適用せず、LighthouseのLCP要素とelement render delayを確認する。リファレンス: `components/LandingPage.tsx`
- **content-visibility 方針**: 長いリストや下部の重いセクションに限定して `content-visibility: auto` + `contain-intrinsic-size` を検討する。ファーストビューや検索・アクセシビリティ上 discoverable であるべき内容には安易に使わない

#### Import 整理ルール

import 文は以下の順序でグループ化し、グループ間に空行を入れること:

```ts
// 1. React / Next.js コアモジュール
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";

// 2. 外部ライブラリ（next-intl, recharts, supabase 等）
import { useTranslations } from "next-intl";

// 3. プロジェクト内部モジュール（@/ エイリアス）
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// 4. コンポーネント
import UserMenu from "@/components/UserMenu";
import Breadcrumbs from "@/components/Breadcrumbs";

// 5. 型定義（type-only import を推奨）
import type { User } from "@/types/user";

// 6. 相対パスのローカルモジュール
import { helpers } from "./utils";
```

- `import type { ... }` を積極的に使い、ランタイムインポートと型インポートを分離する
- 未使用の import は残さない（ESLint で自動検出）

#### TypeScript 厳格ルール

- **`any` よりも `unknown` を使用する** — やむを得ず `any` を使う場合は `// eslint-disable-next-line @typescript-eslint/no-explicit-any` コメントを付与
- **`interface` を優先する** — オブジェクト型の定義には `type` よりも `interface` を使う（extends による拡張が容易）
- **ユニオン型やマップ型など `interface` で表現できない場合のみ `type` を使用**
- **関数の戻り値型を明示する** — 特に公開 API（export される関数）は戻り値型を省略しない
- **オプショナルチェーン (`?.`) とNull合体演算子 (`??`) を積極活用** — `&&` チェーンの連鎖より可読性が高い
- **`as` 型アサーションは最小限に** — 必要な場合は理由をコメントで記載

### 確認ダイアログ・ローディング表示ルール

- **`window.confirm()` / `window.alert()` 等のブラウザ標準ダイアログは使用禁止** — 必ずアプリ内にカスタム確認ダイアログを実装すること
- 確認ダイアログは `createPortal(…, document.body)` で viewport 中央に表示する
- 破壊的操作（削除等）は赤いアクションボタン + キャンセルボタンの 2 択構成にする
- **処理中はスピナー（`animate-spin`）付きのローディングインジケーターを表示**し、ボタンを `disabled` にする
- 参考実装: `LeaveGroupButton.tsx`（インライン確認）、`RecommendedItems.tsx`（モーダル確認）

### React Hooks ルール（最重要 — 違反すると本番クラッシュ）

**⚠️ React Error #310 が頻発した経緯あり。以下を厳守すること。**

#### 原則

- **すべての Hooks（`useState`・`useMemo`・`useEffect`・`useCallback`・`useRef`・`useTranslations`・`useLocale` 等）は、コンポーネント内のいかなる条件付き早期 `return` よりも前に配置すること**
- React の Rules of Hooks: Hooks の呼び出し回数・順序はレンダーごとに同一でなければならない
- 条件付き `return` の後に Hooks を置くと、特定条件下で Hooks 数が変わり **本番で即クラッシュ** する

#### NG パターン（絶対禁止）

```tsx
// ❌ NG: useMemo が早期 return の後にある → 本番クラッシュ
if (loading) return <Skeleton />;
if (!data) return null;
const processed = useMemo(() => transform(data), [data]); // ← CRASH
```

#### OK パターン

```tsx
// ✅ OK: すべての Hooks を早期 return の前に配置し、null-safe にする
const processed = useMemo(
  () => (data ? transform(data) : defaultValue),
  [data],
);
if (loading) return <Skeleton />;
if (!data) return null;
// ここ以降は data が確実に存在する
```

#### 実行チェックリスト（コード変更時に必ず確認）

1. **新しい Hook を追加する場合**: 既存の Hooks 群の直後、最初の `if (...) return` の前に配置する
2. **`useMemo` / `useCallback` が外部データ（`data`, `items` 等）を参照する場合**: `data ?` や `data ?? []` で null/undefined を安全にハンドリングする
3. **早期 return を追加する場合**: その return の下に Hooks が存在しないことを確認する
4. **ファイル編集後の最終確認**: ファイル内で `useMemo|useCallback|useState|useEffect|useRef` を検索し、すべてが最初の条件付き `return` より上にあることを目視確認する

### React パフォーマンス最適化

#### メモ化の原則

- **不要なメモ化は避ける** — `useMemo` / `useCallback` はコストの高い計算やレンダリング最適化が必要な場合のみ使用
- **プリミティブ値は `useMemo` で包まない** — 文字列や数値の単純な計算はメモ化不要
- **子コンポーネントに渡すコールバックは `useCallback` で安定させる** — 特に `React.memo` 化されたコンポーネントに渡す場合
- **オブジェクト・配列リテラルを Props に直接書かない** — 毎回新しい参照が生成され再レンダリングの原因になる

```tsx
// ❌ NG: レンダーごとに新しいオブジェクトが生成される
<UserMenu user={{ id: 1, name: "test" }} />;

// ✅ OK: useMemo で参照を安定させる
const userProps = useMemo(() => ({ id: 1, name: "test" }), []);
<UserMenu user={userProps} />;
```

#### コンポーネント設計

- **Server Component を優先する** — `'use client'` は必要な場合のみ宣言（ユーザーインタラクション、ブラウザ API 使用時）
- **Client Component は小さく保つ** — ページ全体を `'use client'` にせず、インタラクティブ部分だけを切り出す
- **ビジネスロジックをコンポーネントに書かない** — ロジックは `lib/` や `hooks/` に分離し、コンポーネントは表示に専念
- **Props のバケツリレー（Prop Drilling）は 3 階層まで** — それ以上は Context や構造の見直しを検討

#### 再レンダリング防止

- **`key` プロパティには安定した一意値を使用** — 配列の `index` を `key` に使わない（並び替え・削除時にバグの原因）
- **`useEffect` の依存配列を正確に指定** — ESLint の `exhaustive-deps` ルールに従う
- **`useEffect` 内で state を更新する場合はループに注意** — 依存配列に更新対象の state を含めない設計にする

### モバイルファースト設計（必須）

UCFitness は PWA であり、**モバイル端末での利用が主要ユースケース**である。
すべての UI 変更・新規コンポーネント作成時に以下を厳守すること。

- **モバイルファースト**: まずモバイル（`w-full`, `flex-col`）でレイアウトし、`sm:` / `md:` / `lg:` で拡張する
- **`flex` / `flex-row` 横並び禁止（レスポンシブなし）**: 複数カード・パネルを横並びにする場合、`flex` のみは禁止。必ず `flex flex-col sm:flex-row` にする。モバイル幅 375px で `flex-1` × 3 = 125px/カードとなり内容が潰れる。リファレンス: `GroupWeeklyReport.tsx`
- **`absolute` 配置のレスポンシブ座標検証必須**: `position: absolute` + `top/left` + `-translate-x/y-1/2` で中央配置する要素に `sm:top-*` / `sm:left-*` のレスポンシブオーバーライドがある場合、親の `flex-direction` 変更（`flex-col` → `sm:flex-row`）に伴い座標が新レイアウトに対応しているか必ず検証する。古いレイアウト用の `sm:` 値が残存すると位置ずれの原因になる。リファレンス: `GroupList.tsx`（アイコン中央配置修正）
- **モバイルで root スクロールを殺さない**: `html/body` に `overflow: hidden` を適用する場合は、モバイルでスクロール不能・パネル見切れが発生しないかを必ず検証する。全画面スケーリング（`transform: scale(...)` など）は `lg:` 以上に限定し、モバイルでは通常スクロールを優先すること。
- **スクロール制御の原則**: ビューポート高さ (`100vh`, `100dvh`) や固定高さ (`h-[Npx]`) + `overflow-hidden` でコンテンツを固定範囲に閉じ込めるパターンは、ブラウザクロム・ツールバー・デバイスにより実際の表示領域が変動するため、見切れの原因になる。原則としてページ全体は `html/body` の自然スクロールに任せ、`overflow-hidden` + 固定高さはモーダルやドロップダウンなど「意図的に領域を限定する」コンポーネントのみに使用する。**デスクトップの root 0.9x transform スケーリングは禁止**。縮小表示で密度を作るのではなく、カード内余白・グリッド・情報設計で密度を調整すること
- **サイドパネルの `sticky` はデスクトップ限定**: 右カラムや補助パネルの `sticky top-*` は `lg:sticky` のようにブレイクポイント限定で適用する。モバイルで常時 `sticky` にすると、下部パネルや CTA が見切れ・操作不能になることがある。リファレンス: `app/[locale]/groups/page.tsx`
- **最小タッチターゲット**: ボタン・リンク・入力・select・summary・カルーセルドット等、すべての可視操作要素は最低 **44×44px** のタップ領域を確保する。小さなドットやアイコンは44pxボタン内のvisualとして描画する。通常状態だけでなく編集・エラー・空・disabled・カルーセル移動後の条件付き状態も実測する
- **固定ボトムナビのsafe-area予約を本文側にも反映する**: `padding-bottom: env(safe-area-inset-bottom)` を固定ナビへ付ける場合、本文・App Shellの下余白はナビ本体高に同じsafe-area値を加えた `calc()` で予約する。`pb-16`のような固定値だけではiPhoneのホームインジケータ領域で最下部CTAが隠れる。リファレンス: `app/[locale]/layout.tsx`, `components/layout/BottomNavBar.tsx`
- **モバイルアプリ出荷時はtop/bottom両方のsafe-areaを契約化する**: `viewportFit: "cover"` を指定し、固定ヘッダーへ `env(safe-area-inset-top)`、固定ボトムナビと本文へ `env(safe-area-inset-bottom)` を対称に適用する。375pxのブラウザ表示だけでなく、standalone PWA相当で最初・最後の操作要素が到達可能か確認する。リファレンス: `app/[locale]/layout.tsx`, `app/[locale]/page.tsx`
- **ヘッダー操作群のvisualは44pxターゲット内へ収める**: ヘッダー高44〜48pxでは、アバター・ベル等の見た目は最大32pxを基準とし、通知バッジを負の`top/right`でヘッダー外へ出さない。`headerRect`に対してavatar/badgeの`top >= header.top`かつ`bottom <= header.bottom`を375px/1280pxで実測する。タップ領域44pxとvisual 32pxを混同しない。リファレンス: `components/layout/UserMenu.tsx`, `components/layout/NotificationBell.tsx`
- **横スクロール禁止**: `w-screen` や固定幅（`w-[500px]` 等）を使わず、はみ出しの原因を解消する。sticky要素の祖先では `overflow-x-hidden` + `overflow-y-auto` が新しいスクロールコンテナを作ってstickyを無効化しうるため、ページ内の切り抜きには `overflow-x-clip` を使用する。ただし1ページのsticky修正を理由にグローバルな `html/body` のスクロール契約を変更してはならない。固定ヘッダーへ切り替える場合は同じページ内でヘッダー高のpaddingを確保し、アンカー移動・モーダルのスクロールロック・認証済みApp Shellを回帰確認する。リファレンス: `components/LandingPage.tsx`
- **ブレイクポイント境界の密度を実測する**: `sm` / `md` 等で内容を展開する場合は、ブレイクポイントの1px手前と境界値（例: 639px / 640px、767px / 768px）で `body.scrollHeight` と対象section高を比較する。説明文の表示開始と複数カラム化を別ブレイクポイントにして、1カラムのまま全内容だけを展開しない。開示UIから常時表示へ切り替える境界は、内容を横へ分散できるレイアウト境界と揃える。リファレンス: `components/LandingPage.tsx`
- **Sidebar出現と複雑な多列化を同じ`lg`境界で行わない**: 1024pxでは192px Sidebarを差し引いた実コンテンツ幅で判定する。Homeの3列、Groupsのmain+aside、Settingsの2列、Shopの4列、LPの詳細展開は`xl`またはcontainer queryへ遅らせ、1023/1024・1279/1280で対象カード幅と見出し行数を実測する
- **ページ本文を内部縦スクロールへ閉じ込めない**: Shop/Settings等の通常ページに`max-h-[calc(100dvh-...)]` + `overflow-y-auto`を適用せず、documentの自然スクロールへ統一する。内部縦スクロールはDialog、dropdown、明示的な仮想リストだけに限定する
- **法務Footerは全認証幅で到達可能にする**: 320pxからFooterを表示し、BottomNavのsafe-area予約後にTerms/Privacy/Contactを44px操作領域で提供する。モバイルだからFooterを`display:none`にしない
- **カードリストのレスポンシブ設計（必須）**: カード一覧（グループ・チャレンジ等）をモバイルとデスクトップで同じ形状にしない。モバイルは**横型コンパクトカード**（アイコン左 + テキスト右、バナーなし `hidden md:block`）、デスクトップ(md+)は**縦型リッチカード**（バナー上 + テキスト下）。`flex items-center gap-2.5 px-2.5 py-2 md:block md:px-4 md:pb-4 md:pt-10` でレイアウト方向を切替。プログレスバー等の補助情報はデスクトップのみ (`hidden md:block`)。**ブレイクポイントは `sm`(640px) ではなく `md`(768px) を使用**—タブレットや大型スマホでバナーが表示されるのを防止。モバイルで縦型バナーカードを並べると1枚 ~180px × N枚で「ぐちゃっとした印象」になる。モバイルカードの高さは ~56px 以下を目標とする。リファレンス: `GroupList.tsx`
- **モバイルカードの高さ制約**: モバイルではカード 1 枚の高さを **60px 以下** に拑えること。アイコン (`w-10 h-10`=40px)、パディング (`py-2`=8px+8px)、ギャップ (`gap-1.5`=6px)。バナー画像・プログレスバー・SVGアイコンなどの補助要素は `hidden md:block` / `hidden md:inline` でデスクトップのみ表示。リストグリッドのギャップは `gap-1.5 md:gap-3`
- **ハイライト・タグリストの横スクロール化**: 複数のタグ・ハイライト項目が `flex-wrap` で折り返すと、モバイルで複数行の密集テキストブロックになる。`overflow-x-auto` + `whitespace-nowrap shrink-0` のピルバッジ化で横スクロール対応にすること。リファレンス: `app/[locale]/groups/page.tsx` のハイライトバナー
- **モバイルパネルサイズ制約（必須）**: モバイルではフォームパネル・CTAパネル・サイドパネルの高さを最小限に抑えること。具体的なルール:
  - **装飾要素（アイキャッチイラスト・背景装飾）はデスクトップのみ表示** (`hidden md:block` / `hidden md:flex`)。モバイルでは装飾を削除し、フォーム・ボタン等の実用要素のみ表示する
  - **パネルのパディング**: モバイルは `p-3` (12px) を基本、デスクトップは `md:p-5` で拡張。`p-5`/`p-6` のモバイル適用は禁止
  - **CTA ボタン**: モバイルは横型（アイコン左 + テキスト右、`flex items-center gap-3 px-4 py-3`）、デスクトップは縦型（`md:block md:p-4 md:text-center`）
  - **見出しのマージン**: モバイルは `mb-2`、デスクトップは `md:mb-4`。`mb-4` 以上のモバイル適用は視覚的に間延びする
  - **セクション間スペース**: モバイルは `space-y-3`、デスクトップは `md:space-y-4`
  - **絵文字・アイコンサイズ**: モバイルは `text-xl`、デスクトップは `md:text-2xl`。`text-2xl` 以上のモバイル適用は禁止
  - リファレンス: `app/[locale]/groups/page.tsx` の aside パネル
- **テキストサイズ**: モバイルでは `text-sm` / `text-xs` を基本とし、`sm:text-base` 等で拡大する
- **パディング**: モバイルでは `px-4 py-3` を基本とし、`sm:px-6 lg:px-8` で拡張する
- **グリッド**: `grid-cols-1` をデフォルトとし、`sm:grid-cols-2` / `lg:grid-cols-3` で拡張する
- **画像・カード**: `w-full` + `max-w-*` で制御し、固定幅を使わない
- **モーダル・ドロップダウン**: モバイルでは全幅 or ボトムシート風にする
- **フォントサイズの階層**: モバイルの見出しは `text-xl` ～ `text-2xl`、`sm:text-3xl` ～ `sm:text-4xl` で拡大

### UI 密度ルール（間延び防止 — 必須遵守）

**「間延び」（余白が多すぎてコンテンツが疎に見える状態）は美しいデザインではない。** コンパクトで密度の高いレイアウトを常に目指すこと。

#### 間延び防止の原則

1. **`flex-1` による空白引き伸ばし禁止** — コンテンツが少ない場合に `flex-1` で空白を埋めるのは NG。コンテンツの自然な高さに委ね、余白は背景色・グラデーションで処理する
2. **`min-h-full` の安易な使用禁止** — 親要素の高さに合わせてコンテナを引き伸ばすと、コンテンツが少ない時に巨大な空白が発生する。フィード・リスト系コンポーネントでは `min-h-full` を使わない
3. **カード間ギャップは `gap-4` (16px) を標準とする** — `gap-5`（20px）以上はコンテンツが疎に見える。`gap-6` 以上は特別な理由がない限り使用しない
4. **セクションパディングは `py-4` を標準とする** — `py-6` 以上はコンテンツ密度が低下する。大きなパディングが必要な場合は `py-4 lg:py-5` のようにレスポンシブに設定
5. **デスクトップサイドバーで固定高さのコンテナに少ないコンテンツ**: サイドバー内のコンポーネントは `sm:h-auto` (自然な高さ) を使用し、サイドバーコンテナ側で `overflow-y-auto` と `bg-[var(--theme-page-bg)]` を設定する。コンテンツが少ない場合、余白はページ背景色で自然に処理される
6. **フィード・リストの空白対策**: コンテンツが少ない（5件未満）場合は「フォロー促進CTA」や「もっと活動しよう」などの補助コンテンツを表示し、空白を意味のあるコンテンツで埋める

#### リファレンス

- **良い例**: `HomePortal.tsx` — デスクトップで `sm:h-auto sm:overflow-visible`、モバイルで固定高さ
- **良い例**: `ActivityFeed.tsx` — `min-h-full` を使わず、少数アイテム時に `sparseHint` CTA を表示
- **悪い例（修正済み）**: `sm:h-full` + `flex-1` + `min-h-full` の3重引き伸ばし → 1アイテムで300px超の空白発生

#### `<details>` 折りたたみの使用制限

7. **主要パネル・機能を `<details>` で折りたたまない** — ユーザーが存在に気づかず、機能が使われない。`<details>` は FAQ・ヘルプ・補足情報等「必要な時だけ見る」コンテンツにのみ使用する。ファーストビュー外のパネルはスクロールで到達可能な状態で常時表示すること

#### `fixed` デコレーション要素の配置

8. **`position: fixed` のデコレーション要素（絵文字・パーティクル等）は、不透明背景を持つコンテナの内部に配置する** — コンテナ外に `fixed` + 低 `zIndex` で配置すると、コンテナの背景色 (`bg-[var(--theme-page-bg)]`) に覆い隠される。`pointer-events-none` + コンテンツより高い `zIndex` (例: 30) で操作透過を確保しつつ視認性を保つ。リファレンス: `FloatingEmojis.tsx` (`zIndex: 30`, `layout.tsx` の `#main-content` 内部に配置)

#### サマリーカードの情報密度

9. **複数指標を表示するサマリーカードでは、各指標を「ラベル＋バー＋数値」の 1 行にまとめる** — ラベル行・数値行・パーセント行を別々に表示すると行数が肥大する。`flex items-center gap-2` でラベル (`shrink-0`) → プログレスバー (`flex-1 h-1.5`) → 数値 (`shrink-0 tabular-nums`) の 3 要素を横一列に配置する。補足情報（パーセント・ペース等）は削除するかバッジで 1 行にまとめる。リファレンス: `StepCalendar.tsx` の Daily/Weekly ゴール表示

#### 2 カラムグリッドの高さバランス

10. **2 カラムグリッドの高さ合わせで `items-stretch` / `h-full` を安易に使わない** — 短いカラムを無理に引き伸ばすと、ページ外の空白は減っても**カード内部に意味のない余白**が発生し、見た目はむしろ悪化する。まずはカードを自然高さのまま保ち、`QuickActions` のような独立ウィジェットを別行へ移動する・近い密度のカード同士を並べるなど、**配置の再構成でバランスを取ること**。ただし、ユーザーが明示的に下端揃えを求める場合のみ、`items-stretch` / `h-full` を使ってよい。その際、余剰高さの吸収には **`grid auto-rows-fr`（リスト行が均等に高さを分担）** を使い、`mt-auto` だけでフッターを押し下げる方式は禁止（フッターとコンテンツの間に大きな空白帯が発生するため）。リファレンス: `app/[locale]/page.tsx`, `components/DailyMissions.tsx`
11. **デスクトップのフッター下にデッドスペースを残さない** — コンテンツ量が少ないページでは、デスクトップ側の最上位ラッパーを `sm:flex sm:flex-col sm:flex-1` にし、フッターを `mt-auto` で最下部へ押し出すこと。フッターの下に背景だけの空白帯が残る構成は禁止。リファレンス: `app/[locale]/page.tsx`, `components/Footer.tsx`
12. **グリッド子要素に `h-full` を付けて親の `items-start` を無効化しない** — CSS Grid で `items-start`（トップ揃え）を指定している場合、子要素に `h-full` を付けるとグリッドセルの全高まで引き延ばされ `items-start` が無効化される。さらに `justify-center` を併用すると、引き延ばされた高さの中でコンテンツが垂直中央配置され、上下に巨大な空白が発生する。**グリッド子要素は自然な高さに任せ、レイアウトの整列は親の `items-*` プロパティに委任すること。** `h-full` が必要な場合は、親を `items-stretch` に変更し、子の `justify-center` を削除する。リファレンス: `GroupRankingPanel.tsx`（左カラムから `h-full justify-center` を削除して修正）
13. **ブラウザ倍率 100% での密度検証を必須化** — root 全体を `zoom` / `transform: scale()` で縮小して密度を作るのは禁止。UI が大きすぎる場合は、コンポーネント単位で `font-size`、`line-height`、`gap`、`padding`、カード高さ、補助ビジュアルの表示条件を調整する。LP/ホームなど主要画面では 375px / 1280px / 1920px の 100% 表示で `body.scrollHeight`、ヒーロー高さ、ファーストビュー内の情報量を測定し、余白で画面を消費していないか確認する
14. **Footerは短いページでもviewport下端へ置く** — 認証後ホームは`min-h-dvh flex flex-col`を基準にし、Footer wrapperへ`mt-auto`を付ける。1280px/1920pxで`body.scrollHeight <= innerHeight`の場合、`footer.getBoundingClientRect().bottom`が`innerHeight`と一致することを実測する。Footerが画面中央に出た状態を「コンテンツ後だから正しい」と扱わない
15. **PC密度は横幅と配置再構成で改善する** — 1280px/1920pxのファーストビューに、今日の進捗・競争・報酬・次の行動の4要素が認識可能であること。単純なカード引き伸ばしやroot縮小ではなく、ホーム専用の上限幅、2段bento、compact action rowでデッドスペースを減らす
16. **リッチ化は実データを増やして行う** — 空白をカードの拡大・装飾・並べ替えだけで埋めない。認証後ホームでは、今日の値に加えて少なくとも1つの時系列可視化（例: 月曜起算の今週）と1つの蓄積状態（例: UC残高・ストリーク）を表示し、欠測・取得失敗を0へ偽装しない
17. **ホームは個人・競争・社会性を同時に見せる** — 個人トレンドだけで「リッチ」と判定しない。固定仕様に従う5行のランキングプレビュー/自分の順位と、フォロー中ユーザーの活動または次の発見CTAを常時表示する。既存ranking cache / following APIを再利用し、同じデータのために追加N+1を作らない
18. **ホームの社会データを成功形へ偽装しない** — followingのプロフィール・歩数取得失敗、歩数未記録、実際の0歩を分離する。friend activityは他者最大値との相対順位にせず、固定目標への進捗等の非ランキング表現にする。ホーム用APIはサーバー側limitで必要件数だけ取得し、5件未満では仲間発見CTAを表示する。詳細なranking/friend activityは次行動の後に置く。プロフィール行は可視の名前・歩数を`aria-label`で上書きせず、操作説明を`sr-only`で追加する
19. **「全ページ見直し」はルート台帳で管理する** — ホームや共通Shellの改善を全ページ完了の代理にしない。`app/[locale]/**/page.tsx`から対象ルートを列挙し、共通Shell / 競争 / アカウント / 商取引の監査群ごとに、表示・障害状態・認可・i18n・Dialog・チャート代替・320pxリフローを確認する。未認証で確認できない画面は、実配信ルート応答とソース/fixture監査を区別して記録する
20. **全モーダルは共通Dialog stackへ載せる** — Portal表示するDialogは`useDialogFocus`でEscape、Tab循環、背景`inert`、body scroll lock、トリガーへの焦点復帰を統一する。保存中でも永久トラップを作らず、同じ書き込みを再送しない状態を維持したままDialogから退出可能にする
21. **視覚チャートには数値へ到達できる代替を付ける** — `role="img"`の件数要約だけで完了しない。表示中の期間・系列・値を`caption` / `th`付きの`sr-only`表または同等のリストで提供し、画像生成専用の0×0カードは`aria-hidden="true"`にする。インタラクティブ凡例はnative button、選択状態、明示フォーカスを持つ
22. **`sr-only`はsemantic table本体ではなくwrapperへ適用する** — `<table className="sr-only">`はtableのintrinsic layoutがページ高へ残る実装差を起こし得る。`<div className="sr-only"><table>...</table></div>`とし、wrapperがabsolute 1×1pxで、Footer後にデッドスペースを作らないことを実測する
23. **テーマは明示ローカル選択を優先し、装備テーマは初期フォールバックにする** — 既存端末の`localStorage`選択を優先し、未保存端末だけDB装備テーマを初期値にする。装備フォールバックをローカルへ永続化して後日の装備変更を遮断しない。item code変換は`lib/theme.ts`へ集約する
24. **歩数分析は0・欠測・比較期間を混同しない** — 記録済み0歩は記録日平均の分母へ含め、活動日・ベストデーからは除外する。月途中は前月同日までのMTDと比較し、前月0歩では率を表示しない。低活動時のミッションと次行動は直近活動量に応じた100〜500歩の達成可能な入口を含める
25. **ホームの楽しさはカード追加ではなく実データの物語で作る** — ファーストビューは`進捗→競争→歩いた価値→次の一歩`を1つのQuest面で連続表示する。同じ導線をQuest・QuickActions・詳細パネルへ重複させず、Quick DockはBottomNav/Sidebarにない補助導線へ限定する。モーションは目標・順位・UC・完了の状態変化だけに650ms以内で適用し、無限装飾や全カード一斉浮遊を使わない。低活動時は0の反復ではなく「次の100歩」「まず500歩」等の未来志向を優先する

### UI 美学ルール（Design Aesthetics — 必須遵守）

**美しい UI は「画面を埋める」ことではない。** 以下のルールは Refactoring UI、Laws of UX 等のデザイン原則に基づく。

> _"You don't have to fill the whole screen. Just because you have the space, doesn't mean you need to use it."_ — Refactoring UI (p.65)

#### コンテンツ幅の制約

1. **`max-width` を必ず設定する** — コンテンツ領域は画面幅に無制限に追従させない。ワイドスクリーン（1920px+）でカードやテキストが水平に引き延ばされるのは最も一般的な「間延び」パターン
2. **推奨 `max-width` 値**:
   - ページコンテンツ全体: `max-w-7xl`（1280px）
   - 2 カラムレイアウトの右カラム内容: `max-w-[960px]`
   - テキスト中心のコンテンツ: `max-w-prose`（65ch ≈ 600px）
   - カード内のテキスト行長: 45〜75 文字が最適（それ以上は可読性が低下する）
3. **余った空間はページ背景色で処理する** — `var(--theme-page-bg)` のグラデーション背景がコンテンツの外側に自然に現れるようにする。空間を埋めるために不要な UI 要素を追加しない
4. **ナビゲーション幅は本文幅と必ず一致させる** — top header / desktop app header / landing header / page content / footer は同じ `mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8` 系の内側コンテナを共有する。サイドバー付きレイアウトでも、メイン領域の sticky header は `w-full px-*` で全幅にせず、必ず `mx-auto max-w-7xl w-full px-4 lg:px-6 xl:px-8` の内側コンテナで本文と左右端を揃える
5. **幅統一の検証を必須化** — UI 変更後は 1280px / 1920px で header 内側、最初の section、footer の `getBoundingClientRect().left/right` が一致していることを確認する。一致しない場合は完了報告禁止
6. **殺風景化禁止** — 素人感を削るために装飾を減らしても、ファーストビューが白背景 + テキスト + 白カードだけになってはいけない。UCFitness の主要画面では、歩数リング・進捗バー・ランキング差分・報酬カード・ブランド色面のうち最低 2 つをファーストビューに入れ、歩く/競う/報われる体験が 3 秒で伝わるようにする
7. **左サイドバーは認証済みアプリシェルの共通ナビゲーション** — デスクトップ (`lg:` 以上) ではホームだけでなく主要認証済みページ全体で `DashboardSidebar` を表示する。ページ単位で個別にサイドバーを追加・削除せず、`app/[locale]/layout.tsx` の共通 App Shell で管理する。新規ページ作成時に独自の左ナビを作らない
8. **色の熱量を最低限担保する** — 主要導線・クイックアクション・ランキング差分・チャレンジ・報酬には、青/エメラルド/アンバー/バイオレット等の意味色を少なくとも 2 系統使う。モノクロ（白/黒/グレー）だけで主要 UI を構成しない
9. **アプリロゴは色付きmark + solid wordmarkを使う** — 認証後App Shellのロゴを黒/白だけの記号へ戻さない。mark内で青=前進、緑=達成、アンバー=報酬のうち最低2役を使い、文字は可読性の高いsolid色とする。グラデーション文字だけでブランド感を代用しない。リファレンス: `app/[locale]/page.tsx`, `components/dashboard/DashboardSidebar.tsx`
10. **クリック可能パネルは静的カードと明確に区別する** — link/cardには`cursor-pointer`、hover、focus、active、chevronまたは動詞ラベルを揃える。静的status panelへ同じ影移動・矢印を付けない。色だけで押下可否を表現せず、キーボードfocusと44px操作領域を必須とする。リファレンス: `components/dashboard/QuickActions.tsx`, `components/dashboard/DashboardChallenges.tsx`
11. **公開ランディングページは Full Palette のブランド面として扱う** — 認証済みアプリ画面の抑制的な配色をそのまま公開 LP へ適用しない。公開 LP では、目標・主 CTA=青、達成・同期=緑、競争・順位=紫、UC・報酬=アンバーの 4 役を意味に沿って使う。`min-h-screen` + `flex-1` で空白を引き伸ばす暗色ヒーロー、青紫のぼかしだけで構成する SaaS 風表現、グラデーション文字は禁止。375px でも実際の歩数進捗・順位差・報酬・チャレンジのプロダクト UI を隠さず表示し、主要 CTA と最低 2 指標を最初のビューポートで認識できること。リファレンス: `components/LandingPage.tsx`, `docs/PRODUCT.md`
10. **公開ランディングページのアクセシビリティ構造を視覚設計と同時に固定する** — `header` / `main` / `footer` は兄弟ランドマークにし、グローバルスキップリンクは外側ラッパーではなく実際の `main` をフォーカス・スクロール対象にする。横スクロールが必要なピル列は、コンテナを `w-full min-w-0 overflow-x-auto`、子要素を `shrink-0` とし、コンテナ自身へ `min-w-max` を付けない。横スクロールを使う場合は320pxでも次カードを約40px見せ、見えている内容が装飾点にしか見えない場合は方向矢印も添えて、視覚利用者にも続きがあることを伝える。複数行の報酬・実績カードは、モバイルでは無名の横スクロール領域よりコンパクトな縦リストを優先し、320pxでも指標名・具体的な獲得閾値・数値を省略しない。狭幅で補助情報を段階表示する場合も `hidden sm:block` で内容ごと削除せず、ネイティブ `<details>` 等の名前付き・キーボード操作可能な開示で1操作以内に到達可能にする。リファレンス: `components/LandingPage.tsx`, `app/[locale]/layout.tsx`
11. **公開ランディングページを保存済みテーマでも検証する** — `ThemeProvider` は未認証時も `localStorage` のテーマを適用するため、公開 LP が常に Classic テーマとは仮定しない。Full Palette の `strong` / `soft` トークンを追加する場合は Midnight でも対になる値を上書きし、375px / 1280pxで文字コントラストと意味色の識別を確認する。淡色面の前景色と白文字付き塗り面は同じトークンを兼用せず、`strong` と `solid` に分離する。リファレンス: `app/globals.css`, `components/LandingPage.tsx`
12. **公開LPは一画面一メッセージと意味のあるモーションで構成する** — 色や機能を単純に削るのではなく、モバイルのヒーローは主CTA＋現在歩数＋残り歩数へ集中し、順位・UCは直後のプルーフ領域へ送る。デスクトップでも順位・UCは同じ進捗面の副指標として扱う。重複するハイライト・実績・説明カードを同一ビューポートへ並べず、今日の進捗→追いつける差→習慣ループ→報酬の順に段階表示する。全セクションへ同じfade-upを付けず、歩数リング=前進、順位バー=成長、報酬=到達、スクロール線=ページ進捗のように役割を対応させる。モバイルでは装飾用の無限オービットやカード浮遊を進捗モーションと同時再生しない。読めるテキストを含む要素はモーション中も `opacity: 1` を維持し、変形・SVG描画・独立装飾で表現して全フレームのコントラストを保つ。Scroll-driven Animations は `@supports` 内のProgressive Enhancementとし、低減モーションでは完成状態を即時表示する。リファレンス: `components/LandingPage.tsx`, `app/globals.css`, `docs/PRODUCT.md`

#### 視覚的階層（Visual Hierarchy）

4. **階層はサイズだけでなく色と太さで表現する** — 見出しを大きくする代わりに、太字 + テーマカラーで強調する。補助テキストは `text-gray-500` + `font-normal` で控えめにする
5. **セマンティックカラーを活用する**:
   - プライマリアクション: `var(--theme-primary)` + 白テキスト（塗りつぶしボタン）
   - セカンダリアクション: `var(--theme-primary)` + 透明背景（アウトラインボタン）
   - ターシャリアクション: テキストリンクスタイル（ボタン枠なし）
6. **すべてのラベルに `font-semibold` は不要** — ラベルが多い UI で全部太字にすると何も目立たない。重要なものだけに太さを使い、それ以外は `font-normal` + `text-gray-500`

#### 境界線と区切り（Borders & Separation）

7. **ボーダーを減らし、背景色・影・余白で区切る** — `border-b` の連続使用は視覚的ノイズを増やす。代替手段:
   - **背景色のコントラスト**: 隣接セクションに異なる背景色（`bg-white` と `bg-gray-50/50`）
   - **影（shadow）**: `shadow-sm` でカードを浮かせて区切る
   - **余白（spacing）**: `gap-4` や `py-4` で自然な区切りを作る
8. **アクセントボーダーで個性を出す** — 左端の装飾線（`border-l-4 border-[var(--theme-primary)]`）はカードに視覚的アクセントを与える。全辺のボーダーより軽く、かつ印象的

#### 近接と関連性（Law of Proximity & Common Region）

9. **関連要素はグループ化し、無関係な要素は離す** — 同じ機能グループのコンポーネントは `gap-2` で密接に配置し、異なるセクション間は `gap-4` 以上で区切る。等間隔に並べると機能的な違いが読み取れなくなる
10. **共通領域の法則** — 背景色やカード（`rounded-xl bg-white/80`）で囲むことで、要素の関連性を視覚的に示す。ボーダーだけでなく背景色の変化も「グループ」を表現する手段

#### 美的ユーザビリティ効果（Aesthetic-Usability Effect）

11. **見た目が美しいデザインは、ユーザーに「使いやすい」と感じさせる** — 軽微なユーザビリティの問題は、視覚的に洗練されたデザインによって許容される。逆に見た目が雑だと、機能的に正しくてもユーザーは不満を感じる。デザインの美しさへの投資は UX 品質に直結する

#### リファレンス

- **出典**: [Refactoring UI](https://www.refactoringui.com/) — "You don't have to fill the whole screen" (p.65), "Establish a spacing and sizing system" (p.60)
- **出典**: [Laws of UX](https://lawsofux.com/) — Aesthetic-Usability Effect, Law of Proximity, Law of Common Region
- **出典**: [7 Practical Tips for Cheating at Design](https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886) — 色・太さの階層、ボーダー削減、アクセントボーダー、ボタン階層
- **良い例**: `app/[locale]/page.tsx` — 右カラムに `max-w-[960px]` で幅制約、余白はページ背景色で処理
- **悪い例（修正済み）**: 右カラムに `max-width` なし → 1920px で全幅に引き延ばされ、カードが巨大化

### デザイン哲学 — 「訪れるのが楽しくなるサイト」(Design Delight)

UCFitness は**フィットネスゲーム**であり、ユーザーが**毎日開きたくなる**デザインを目指す。「機能的に正しい」だけでは不十分。**ワクワク感・達成感・遊び心**を視覚的に表現すること。

#### CSS アニメーションの安全ルール（競合防止 — 必須遵守）

**同一要素に複数の `animation` プロパティを持つクラスを付与しない。** CSS の `animation` は shorthand であり、後から適用されたクラスの `animation` が先のクラスを完全に上書きする。

- **特に危険**: 入場アニメーション (`opacity: 0` から開始) を持つ要素にデコレーション用の `animation` クラスを追加すると、入場アニメーションが実行されず要素が非表示のまま残る
- **対策**: 装飾エフェクトは `border` / `background` / `box-shadow` 等の非 animation プロパティで実現する。シマー等の繰り返しアニメーションは `::before` / `::after` 擬似要素に分離する
- **確認方法**: 要素に付与されるクラス一覧の中で `animation` プロパティを持つクラスが 2 つ以上ないことを確認
- リファレンス: `my-row-accent`（`animation` 非使用で `rank-row-enter` と競合しない）

#### `position: fixed` パネルのモバイル配置ルール（必須遵守）

`position: fixed` + 全幅パネル（`w-[calc(100vw-Npx)]`）を使う場合:

- **モバイル**: `left: Npx` で配置（`right` を使うと `right + width > 100vw` で左見切れが発生）
- **デスクトップ**: `right` 基準でトリガー要素に追従
- **検証**: `right + width <= 100vw` かつ `left >= 0` を必ず確認する
- リファレンス: `NotificationBell.tsx`

#### 2カラムグリッドの下端揃えルール（タブバー分離原則 — 必須遵守）

2カラムグリッドで下端を揃える必要がある場合:

1. **タブバー・フィルター等のコントロール要素はグリッドの外（上部）に配置** — グリッド内はカード本体のみにする。タブの高さ差がカラムの高さ差に直結する問題を防止
2. **グリッドに `items-stretch`** — 左右カラムが同じ高さになる
3. **カード内部: `flex flex-col h-full`** — リスト部分に `flex-1` で余剰高さを吸収させる
4. **フッター要素に `mt-auto`** — 常にカード下端に固定

- リファレンス: `DynamicLeaderboard.tsx`, `GroupRankingPanel.tsx`

#### 原則

1. **Motion = Emotion** — 静的な画面は退屈。CSS アニメーション (`@keyframes`) を活用し、カードの入場・数値のカウントアップ・達成時のお祝いなど、意味のあるモーションを追加する
2. **Glassmorphism & Depth** — フラットデザインに固執しない。`backdrop-blur` / `bg-white/80` / グラデーションシャドウで奥行きと高級感を出す
3. **Gamification Visual** — ランク表示、バッジ、ストリーク、レベルアップなどゲーム的な視覚フィードバックを積極的に採用
4. **Micro-Interactions** — ホバー、タップ、スクロールに対して小さな反応を返す。ボタンの `scale` / カードの `shadow` 変化 / アバターの `ring` 点灯など
5. **Color = Meaning** — 色は装飾ではなく意味を持たせる。達成=緑、警告=オレンジ、1位=ゴールド、自分=テーマカラーリング

#### 実装パターン

- **入場アニメーション**: `@keyframes fadeInUp` → `.animate-fadeInUp` でカードがフェードイン + 上昇
- **stagger 遅延**: 複数カードは `animation-delay` をずらして順番に入場
- **ホバーエフェクト**: カードは `hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`（ただしリーダーボード行は `transition-colors` のみ）
- **数値ハイライト**: 歩数・コインなどの重要数値は `bg-clip-text text-transparent bg-gradient-to-r` でグラデーション表示
- **達成バッジ**: ゴール達成時は `animate-bounce` + 緑のグロー (`shadow-green-500/30`)
- **プログレスバー**: `transition-all duration-700` で滑らかにアニメーション
- **ガラスカード**: `bg-white/80 backdrop-blur-sm border border-white/40 shadow-lg` で半透明ガラス効果
- **`prefers-reduced-motion`**: アニメーションを無効化するオプションを必ず提供

#### 禁止事項

- `framer-motion` は使用禁止（CSS アニメーション + Tailwind のみ）
- 意味のないアニメーション（ローディング以外の無限回転、点滅等）は禁止
- パフォーマンスを犠牲にする重いアニメーション（`filter: blur(20px)` の連続適用等）は禁止

### リーダーボード / ランキング統一ルール（変更厳禁）

**ユーザーから繰り返し指摘されている仕様。改善ループやリファクタリングで勝手に変更してはならない。**

対象コンポーネント: `AnimatedLeaderboard.tsx`, `GroupRankingPanel.tsx`, `GroupDetailLeaderboard.tsx`, `leaderboard/LeaderboardGroupSection.tsx` 等すべてのランキング系コンポーネント。

1. **行の最小高さ: `min-h-[4.5rem]`** — すべてのランキング行 (`.leaderboard-row`) に必ず設定。リアクション欄・称号の有無に関わらず行高が揃うようにする
2. **最低表示行数: `MIN_ROWS = 5`** — メンバー数が 5 未満の場合でも空行 (`emptyRowCount = Math.max(0, 5 - members.length)`) で埋めて 5 行分の高さを確保する
3. **行レイアウト: `flex flex-col justify-center`** — 行内コンテンツは垂直中央揃え
4. **パディング: `px-3 sm:px-6 py-2 sm:py-2.5`** — モバイルとデスクトップで統一
5. **ランク行の装飾クラス: `rank-row-1`, `rank-row-2`, `rank-row-3`** — 1〜3 位に適用
6. **リアクション欄は行内に固定高さ (`h-[22px]`) で表示** — 行高がリアクションの有無で変動しないようにする
7. **行の `transition` は `transition-colors` のみ使用** — `transition-all` は `shadow` / `scale` / `padding` 等すべてのプロパティをアニメーションし、ホバー時に行高が変動するため **絶対に使用しない**。リファレンス実装: `AnimatedLeaderboard.tsx`
8. **`hover:scale-*` をランキング行・ギアカードに使用しない** — 要素のサイズ変動はレイアウト崩れ・バルーン見切れの原因
9. **リアクションピッカー（バルーン）が表示される行は `overflow-visible` + ホバー時 `z-50`** — 親コンテナの `overflow-hidden` でバルーンが切れないようにする。z-index の動的切替パターン: `${(hoveredUserId === id || longPressUserId === id) ? 'z-50' : ''}`
10. **リアクションピッカーは `createPortal(document.body)` で Portal 描画** — CSS 仕様上、`overflow-hidden` 祖先は `z-index` や子の `overflow-visible` では回避不可。ピッカーは `position: fixed` + `getBoundingClientRect()` で座標計算し、`document.body` に描画すること。`forceShow=false` 時は 300ms タイマーで遅延クローズし、行 → ポータルピッカーへのマウス移動を許容する。リファレンス実装: `GroupReactions.tsx`
11. **Portal 座標は 2-probe affine 変換で過去の root zoom 環境を逆補正できるよう維持する** — 過去の `body { zoom: 0.9 }` 環境では `getBoundingClientRect()` が viewport 座標を返す一方、`position: fixed` の `top/left` は zoom 後の CSS 座標系で解釈されていた。probe(0,0) だけでは `0×zoom=0` のため乗算的ずれを検出不可。`position:fixed;top:0` と `top:100px` の 2 要素で `scale = (r2 - r1) / 100` を算出し、`(coord - offset) / scale` で逆変換する。リファレンス: `GroupReactions.tsx` の `detectCoordinateTransform()`
12. **Portal ピッカーのカード中央配置** — ピッカーはトリガーボタンではなく親カード基準で中央配置する。カードの wrapper div に `data-reaction-card` 属性を付与し、`triggerEl.closest('[data-reaction-card]')` でカード要素を取得。カード中心を基準に `translateX(-50%)` する。リファレンス: `GroupGear.tsx`, `TrendingGear.tsx`
13. **Portal ↔ トリガー間のホバーギャップは既知制限** — Portal は DOM ツリー上でトリガーの子孫ではないため、カード `mouseleave` → Portal `mouseenter` 間にギャップが発生しピッカーが閉じうる。`isHoveringPickerRef` による部分緩和のみ。**現在の実装（fb07776）がユーザー承認済みの安定状態であり、この動作を変更する場合は必ずユーザーに確認すること**
14. **この仕様を変更する場合は必ずユーザーに確認すること**

### グループ順位・部分障害の契約

- **正歩数だけを順位化する** — グループ内ユーザー順位とグループ対抗順位は `steps > 0` / `totalSteps > 0` の対象だけを並べ、除外後に連続した順位を再付与する。記録済み0歩・未記録・取得失敗を順位、メダル、参加人数へ含めない
- **人数ラベルを正直にする** — ランキング配列長を表示する場合は「メンバー数」ではなく「ランキング参加人数」と明記する。実メンバー数のDB取得失敗は0人へ変換せず、取得不能表示にする
- **必須認可と補助データを分離する** — グループ本体、閲覧ユーザー、membership認可は必須境界とし、private group非メンバーは404を維持する。メンバー一覧・人数、グループ内順位、比較チャート、期間別グループ競争の失敗は個別にログと警告を出し、イベント、チャット、ギア、週間レポート等の利用可能な機能を停止しない
- **障害を空状態へ偽装しない** — 取得失敗時に空ランキング・空メンバーを正常状態として表示しない。メンバー管理Dialog内も明示的な取得不能状態にし、部分的に取得できた不正形状は警告して有効行だけを表示する
- **未所属の次行動を明示する** — グループ未所属空状態は、44px以上のCTAで同一ページの参加パネルへ移動できること。リファレンス: `app/[locale]/groups/page.tsx`, `app/[locale]/groups/[groupId]/page.tsx`, `lib/services/ranking-service.ts`, `lib/services/group-ranking-service.ts`

### ユーザー項目のプロフィール遷移（必須）

**ユーザーのアバター・名前・行を表示するすべてのコンポーネントで、ユーザー行クリック時に `/user/{username}` プロフィールページへ遷移する機能を必ず実装すること。**

- 対象: リーダーボード行、チャレンジ参加者行、グループメンバー行、フォロー一覧行、アクティビティフィード行など、ユーザー情報を表示するすべてのリスト項目
- 遷移先: `/user/{username}`（`username` が存在する場合のみ）
- 実装パターン: `<Link href={\`/user/${username}\`}>` または `router.push(\`/user/${username}\`)`
- モーダル内の場合: `onClose()` でモーダルを閉じてから遷移する
- キーボード対応: `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space)
- `aria-label` にユーザー名を含める

### アクセシビリティ（a11y）

**PWA としてすべてのユーザーがアクセスできることを保証する。**

- **セマンティック HTML を使用** — `<button>`, `<nav>`, `<main>`, `<section>`, `<article>` 等を適切に使い、`<div onClick>` でボタンを代用しない
- **画像には必ず `alt` 属性を設定** — 装飾画像は `alt=""` + `aria-hidden="true"`
- **フォーム要素には `<label>` を紐付け** — `htmlFor` と `id` の対応、または `aria-label` を使用
- **ARIA 属性を適切に使用** — `aria-label`, `aria-describedby`, `aria-expanded`, `aria-live` 等
- **色だけに依存しない** — ステータス表示はアイコン・テキストも併用する（色覚多様性対応）
- **フォーカスインジケーターを消さない** — `outline-none` を使う場合は `focus-visible:ring-2` 等で代替スタイルを提供
- **インタラクティブ要素のロール** — クリック可能な `<div>` には `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space) を実装するか、`<button>` を使う
- **固定ヘッダー下のフォーカス見切れを防ぐ** — スキップリンクとページ内アンカーの対象へヘッダー高以上の `scroll-margin-top` を設定し、移動後に `target.getBoundingClientRect().top >= header.getBoundingClientRect().bottom` を320px / 375px / 1280pxで実測する
- **局所横スクロールは必要な幅だけフォーカス可能にする** — 狭幅で実際に横スクロールする領域へ `tabIndex={0}`、操作説明、3:1以上の `focus-visible` リングを付与する。デスクトップで全内容が収まる版はタブ停止させず、必要なら `hidden sm:grid` / `sm:hidden` でセマンティクスもレスポンシブに分離する
- **アンカー先セクションへ簡潔な名前を付ける** — `tabIndex={-1}` でフォーカスする `<section>` は見出しIDを `aria-labelledby` で参照し、節内全文がアクセシブル名として読み上げられないようにする

### コードレビューチェックリスト（Red Flags）

**コード変更時に以下の項目に該当する箇所がないか確認すること。**
**なお、作業完了報告の直前には `self-critique-gate` skill を実行し、必要に応じて `self-critique.agent.md` の 6 軸批判を自動的に実行すること。全軸 PASS するまで報告しないこと。**

#### セキュリティ

- **機密情報のログ出力** — `console.log` にパスワード、トークン、API キー、個人情報を含めていないか
- **固定エラーでのログ秘匿** — DB/API障害を固定`AppError`へ変換する境界では、生error・message・causeを例外だけでなく`reportError`にも渡さず、固定code/contextだけを上位callerで記録する
- **ハードコードされた秘密情報** — API キーやシークレットがソースコードに直接書かれていないか（`.env` を使用すること）
- **入力値の未検証** — ユーザー入力やクエリパラメータを検証・サニタイズせずに使用していないか

#### コード品質

- **デバッグコードの残存** — `console.log`, `debugger`, `TODO: remove`, コメントアウトされたコードが残っていないか
- **大きすぎる関数** — 1 つの関数が 50 行を超える場合は分割を検討
- **コードの重複** — 同一ロジックが複数箇所にコピーされていないか（共通関数に抽出）
- **非推奨 API の使用** — Next.js / React / Supabase の deprecated API を使用していないか
- **不要なコード** — 使われていない変数、到達不能コード、空の `catch` ブロックがないか
- **エラーハンドリング漏れ** — `fetch` / Supabase クエリの `.error` チェック、`try/catch` が適切か

#### パフォーマンス

- **N+1 クエリ** — ループ内で DB リクエストをしていないか（バッチクエリに統合）
- **不要な再レンダリング** — コンポーネント内でオブジェクトや配列を毎回再生成していないか
- **巨大データの無制限取得** — `.select("*")` で全カラム取得、`LIMIT` なしのクエリがないか

### フィーチャーフラグ・実験的コードの削除手順

フィーチャーフラグや実験的コードを削除する際は、以下の手順に従って**漏れなく安全に**クリーンアップすること。

#### 削除チェックリスト（順番に実施）

1. **全使用箇所の特定** — プロジェクト全体でフラグ名・環境変数名を検索し、すべての参照箇所をリストアップする
2. **フラグの削除** — 条件分岐（`if (flag)` / `flag ?`）を除去し、有効側のコードパスのみを残す
3. **不要コードパスの除去** — フラグが `false` の場合にのみ実行されていたコード（旧実装・フォールバック）を完全に削除する
4. **関連コメント・import の整理** — フラグに言及するコメント、不要になった import 文、未使用の変数を削除する
5. **テストの更新** — フラグの ON/OFF を切り替えるテストケースを削除し、有効側のロジックのみをテストするように整理する
6. **動作検証** — 型チェック (`npx tsc --noEmit`) とリントを実行し、エラーがないことを確認する
7. **フォーマット確認** — コードフォーマッターを実行し、削除による不自然なインデントや空行がないことを確認する

#### 注意事項

- **環境変数ファイル** (`.env`, `.env.local`) からもフラグを削除すること
- **翻訳ファイル** (`messages/ja.json`, `messages/en.json`) にフラグ関連のキーがあれば削除する
- フラグ削除は **1 フラグ = 1 コミット** で行い、複数フラグを同時に削除しない

### dev サーバー起動ルール（ポート 3000 必須）

- **NextAuth の OAuth コールバック URL が `localhost:3000` に固定されているため、dev サーバーは必ずポート 3000 で起動すること**
- ポート 3000 が他のプロセスに使用されている場合は、**先にそのプロセスをキルしてから起動する**:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  ```
- `npm run dev` は自動的にポート 3000 を使用する。ポート競合で 3001 等にフォールバックした場合、認証（ログイン・セッション）が機能しないため、必ずキル→再起動すること
- Playwright テストも `localhost:3000` を対象とする
- **ユーザーへローカル表示を案内する前に、閲覧タブを通常のデスクトップ表示へ戻す** — モバイルエミュレーションや途中スクロールを残さず、1280×800・スクロール先頭で対象URLを再読み込みし、タブを前面化する
- **Chrome DevTools / MCP の自動検証タブをユーザー向け閲覧タブとして扱わない** — `Unshared browser tab` はユーザー画面に表示されない。ローカル確認を依頼された場合は、検証後に macOS の `open 'http://localhost:3000/'` で通常ブラウザを明示的に開く
- **「見られる状態」はサーバー応答や自動検証タブだけで判定しない** — LISTEN、HTTP 200、自動検証側の描画確認に加え、通常ブラウザが前面化したことを確認し、最終的にはユーザーの閲覧確認を完了条件とする
- **開発CSPへ `upgrade-insecure-requests` を含めない** — Safariは `http://localhost:3000/_next/...` のCSSをHTTPSへ変換し、開発サーバーがTLS未対応のため未装飾画面になる。本番CSPでは同ディレクティブを維持する
- **ローカル表示確認はCSS適用まで検証する** — ルートHTMLのHTTP 200だけで通過せず、HTMLが参照する `layout.css` のHTTP 200と、通常ブラウザでスキップリンクやSVGが未装飾のまま露出していないことを確認する

### デプロイ制限

- `git push` は Cloudflare Pages のデプロイ制限があるため、明示的に許可があるまで実行しない

### プッシュ通知ルール

- **i18n は端末表示まで検証必須**: プッシュ通知メッセージは必ずユーザーの `language` カラム（`users` テーブル）を参照し、`lib/services/push-messages.ts` のローカライズ関数で生成する。生成関数の単体テストだけで完了せず、RFC 8291 `aes128gcm` payloadを復号して `title` / `body` / `locale` がService Workerへ届くことを検証する。ユーザー向け通知をpayloadなしのtickle送信へ戻さない
- **通知集約（バッチ通知）必須**: 同一ユーザーに複数の通知（バッジ獲得等）が発生する場合、**カテゴリ内だけでなく最上位の実行単位で1通にまとめる**。個人・グローバル・グループを各1通にする実装は禁止。Service Workerの`tag`とWeb Pushの`Topic`も同じ種別で揃え、`renotify: false`で同種通知を置換する
- **購読fan-outの重複防止**: `push_subscriptions`は再購読でendpointが増えるため、配信時は同一`user_agent`とlegacy行を最新1件へ集約する。再購読時は現在endpoint以外の同一UA・legacy行を整理し、Push Serviceが404/410を返したendpointは削除する。異なるUAの端末は維持する
- **暗号化body上限**: `aes128gcm`はsalt/record/key-idを含む86-byte headerとdelimiter/tagを含めたHTTP body全体を4096 bytes以内にする。JSON payloadは最大3993 bytesとし、3993成功・3994拒否の境界テストを維持する
- **再購読競合で0件にしない**: upsert後の旧endpoint整理は、作成時刻とIDで「現在行より古い行だけ」を削除する一方向winner、またはDB RPCの原子的処理にする。並行する2要求が互いを削除できるread-then-deleteは禁止
- **全ユーザー無制限並列送信禁止**: Cronのユーザー単位通知は最大20件程度の固定バッチへ分割する。各ユーザー内の端末送信だけを並列化し、全購読者を裸の`Promise.all`へ渡さない
- **DB障害を既定言語・0値へ変換しない**: `users.language`、週次歩数、UC集計の取得失敗時は通知を送らず明示的に失敗として記録する。DB照会失敗を日本語既定や0歩サマリーへ変換してはならない
- **任意の通知嗜好カラム障害でFeedを停止しない**: `notification_reactions` / `notification_gear_reactions` は`feed_last_read_at`と別クエリにし、嗜好カラム未適用時もバッジ・リアクションFeedと未読集計を既定表示で継続する。APIは`notificationPreferencesAvailable: false`を返し、ActivityFeed/NotificationBellは「既定Feedを表示中」と明示する。通知設定GET/PUTは成功や既定ONへ偽装せず503 `NOTIFICATION_SETTINGS_UNAVAILABLE`を返す
- **通知ベルも同じ集約単位に揃える**: 同日・同一ユーザーの複数バッジや短時間の同種リアクションは1行へまとめ、未読バッジ数も生イベント件数ではなく表示する集約通知件数と一致させる。バッジ名は`Museum.badgeNames`のja/en資産を再利用する
- **通知時刻はイベント固有値を使う**: `daily_steps.updated_at`や`coin_balances.updated_at`のように別処理でも変わる汎用更新時刻を通知発生時刻に使わない。安定した`created_at`または専用イベント時刻がない派生状態は通知ソースから外し、既読後の再同期・報酬処理で偽未読を再発させない
- **集約Feedのページング**: raw eventへlimitを適用してから集約したり、集約項目の最新/最古時刻だけをcursorにしてはならない。直近7日のsnapshot時刻を固定したopaque offset cursorで、全ソース集約後の論理通知をページ分割し、クライアントはAPIの`nextCursor`を保持する
- **通知popoverの操作契約**: 非モーダル通知popoverはフォーカスが外へ移動したら閉じ、Escape/閉じるでトリガーへ戻す。ベルのaccessible nameとlive statusへ未読件数を含め、状態変更の「すべて既読」は可視ラベルと失敗表示を持つ。初回未読GETと既読POSTは世代IDで競合を隔離し、POST成功後に古いGETが件数を復活させない。画像URLを文字列表示せず、プロフィール導線は無名の小リンクを作らず56px以上の名前付き行リンクへ統合する
- **新規通知追加時**: `lib/services/push-messages.ts` にメッセージテンプレートを追加し、ja/en 両方を定義すること
- リファレンス実装:
  - バッジ統合通知: `badge-allocator.ts` の `sendConsolidatedBadgeNotification()`
  - Edge payload暗号化・購読集約: `lib/api/web-push.ts`
  - 端末表示・同種置換: `public/sw.js`
  - ステップリマインダー: `cron/step-reminder/route.ts`
  - ウィークリーサマリー: `cron/weekly-summary/route.ts`

### 言語ポリシー

- コミットメッセージ: 日本語
- コードコメント: 日本語 OK
- ユーザーへの応答: **日本語のみ**
- **英語本文の併記は禁止** — 要約だけ日本語で本文を英語にする形式にしない
- コード、識別子、コマンド出力、エラーメッセージ、UI文字列、引用は必要に応じて原文を保持してよいが、その説明・要約・結論は日本語で書く
- ユーザーが明示的に英語での回答を依頼した場合のみ、例外として英語を使用してよい

#### コミットメッセージフォーマット

```
[エリア] 簡潔な変更内容 (≤72文字)
```

**エリアプレフィックス:**

| プレフィックス | 対象                                     |
| -------------- | ---------------------------------------- |
| `[UI]`         | コンポーネント、スタイル、レイアウト変更 |
| `[API]`        | API ルート (`app/api/`) の変更           |
| `[Auth]`       | 認証関連                                 |
| `[DB]`         | Supabase スキーマ、クエリ変更            |
| `[i18n]`       | 翻訳ファイル更新                         |
| `[Config]`     | 設定ファイル、環境変数                   |
| `[Test]`       | テストの追加・修正                       |
| `[Docs]`       | ドキュメント更新                         |
| `[Fix]`        | バグ修正                                 |
| `[Perf]`       | パフォーマンス改善                       |
| `[Refactor]`   | リファクタリング（機能変更なし）         |

**例:**

- `[UI] グループ詳細ページにメンバー一覧パネル追加`
- `[Fix] ウォレットページの残高表示が0になるバグ修正`
- `[API] 歩数同期エンドポイントのバッチ処理最適化`
- `[i18n] ショップページの英語翻訳追加`

**ルール:**

- 1 コミット = 1 つの論理的変更（アトミックコミット）
- 命令形（「〜を追加」「〜を修正」）で記述
- 72 文字以内に収める（超える場合は本文に詳細を記載）

### ページ共通パターン（絶対統一）

**新規ページ作成・既存ページ修正時は、以下のすべてのパターンに必ず従うこと。**
**既存ページを参照する場合は、ダッシュボード（`page.tsx`）ではなく `wallet/page.tsx` や `shop/page.tsx` を正規のリファレンスとすること。**
ダッシュボードは公開ランディングページ兼用のため、例外的な構造を持つ。

#### ① ファイル先頭宣言

```ts
export const runtime = "edge";
// ...imports...
export const dynamic = "force-dynamic";
```

#### ② 必須インポート

```ts
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase"; // ※ supabase ではなく supabaseAdmin
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import AuthenticatedPageHeader from "@/components/layout/AuthenticatedPageHeader";
import PageIntro from "@/components/layout/PageIntro";
```

#### ③ 認証チェック → userId 取得 → DB ユーザー情報取得

```tsx
const session = await auth();
const t = await getTranslations("PageName");
const dashboardT = await getTranslations("Dashboard");

if (!session?.user) {
  redirect("/");
}

const userId = String(session.user.id);

// 必ず supabaseAdmin で DB からユーザー情報を取得する
const { data: dbUser, error: userError } = await supabaseAdmin
  .from("users")
  .select("name, image, username") // ← 最低限この3つ。ページ固有のカラムは追加OK
  .eq("id", userId)
  .single();

if (userError) {
  throw new Error(`Failed to load page user: ${userError.message}`);
}

if (!dbUser?.username) {
  redirect("/setup");
}
```

**禁止事項:**

- `session.user.image` / `session.user.name` を表示用に直接使用してはいけない（Fitbit OAuth の値のため）
- `supabase`（非 admin）をサーバーコンポーネントで使用してはいけない（`supabaseAdmin` を使う）
- username チェック・`/setup` リダイレクトを省略してはいけない
- Home / GroupsのようにDB障害を専用エラーパネルで明示するページでは、JWT内のusernameへfallbackしない。DBからcanonical usernameを確認できない間はUserMenuのプロフィールリンクを静的要約へ変え、障害表示を維持したまま`/profile`・`/user/`・`/user/undefined`を生成しない

#### ④ ルート要素

```tsx
<main className="min-h-screen bg-[var(--theme-page-bg)]">
```

#### ⑤ ヘッダー（アプリブランディング）

```tsx
<AuthenticatedPageHeader
  appTitle={dashboardT("title")}
  betaLabel={dashboardT("beta")}
  contextLabel={t("title")}
  user={{
    id: userId,
    name: dbUser.name ?? session.user.name,
    email: session.user.email,
    image: dbUser.image ?? session.user.image,
    username: dbUser.username,
  }}
/>
```

- `BackButton` はヘッダーに置かない（パンくずリストで代替）
- モバイルは多色 `AppBrandMark` + solid wordmark、デスクトップはSidebarと重複しないcontext labelを表示する
- アプリ名は見出しにしない。ページ唯一の`h1`は後述の`PageIntro`が持つ
- **ヘッダー右側は `AuthenticatedPageHeader` 内の `RefreshButton` → `NotificationBell` → `UserMenu` の 3 要素を維持する**
- `dashboardT = await getTranslations('Dashboard')` で取得

#### ⑥ コンテンツ領域

```tsx
<div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
  <PageIntro
    headingId="page-title"
    title={t("title")}
    description={t("headerDesc")}
    icon="analytics"
    tone="primary"
    breadcrumbs={[{ label: t("title") }]}
  />

  {/* メインコンテンツ */}
</div>
```

- `PageIntro` がパンくず、ページ唯一の`h1`、説明、意味色アイコン、単色アクセントをまとめる
- タイトルへグラデーション文字やページ固有の巨大サイズを再導入しない
- ホーム、初回セットアップ、固有カバーを持つグループ詳細は例外構造でもよいが、認証ヘッダーは`AuthenticatedPageHeader`へ統一する
- `globals.css`で`[data-auth-header] h1`やページ見出しを広域上書きしない。共通コンポーネント自身でサイズ・余白を管理する
- 翻訳キーに `headerDesc` を必ず含める（ja/en 両方）

#### プロフィール遷移・ローディング・日付水和の契約

- App Shellのプロフィール導線は`/profile`を経由せず、`/user/${encodeURIComponent(username)}`へ直接遷移する
- 全画面の独自グローバルローダーでナビゲーションを覆わない。Next.jsのroute `loading.tsx`と対象画面形状のスケルトンを使い、URL不変・redirect・error時にも本文を永久に隠さない
- Server/Client双方の初期描画で日付配列を作る場合、Server Componentで確定した`YYYY-MM-DD`をpropで渡し、UTC演算で同じDOMを生成する。可視初期値に裸の`new Date()`や端末タイムゾーン依存の`toLocaleString()`を使わない
- インタラクティブ要素へ`div`等の非phrasing contentを不正にネストしない。水和警告は白画面候補としてconsoleとDOM構造の両方を確認する
- 他ユーザープロフィールで閲覧者プロフィールと比較歩数を並列取得する場合、両方の`.error`を`reportError`後にthrowまたは明示エラーUIへ分岐する。比較歩数のDB失敗を「比較データなし」の正常状態へ変換しない

#### 初回セットアップのActivation契約

- Setupは「プロフィール/歩数ソース」「日次目標」「グループ/チャレンジ」の3画面に分け、現在位置をテキストとprogressbarで示す。モバイルでは必須入力を任意写真より先に置く。各画面は任意項目を後回しにできる44px以上のスキップ導線を持ち、「後で設定して次へ」のように遷移結果を明示する。スキップをOAuth再認可・自動参加・取得失敗の正常化へ変換しない
- 初回セットアップをプロフィール保存だけで終えない。DB正本の歩数ソース、500〜100,000歩の整数目標、保存後の「最初の500歩」CTAまでを一続きで提示する
- 歩数目標はプロフィールと同一のサーバー更新で保存し、クライアントとAPIの両方で範囲・整数を検証する。取得不能を既定の5,000歩や未接続へ偽装しない
- `/api/user/status`はDB正本の`provider`と`step_goal`を返し、DB障害時は`isSetup: false`の正常形ではなく5xxを返す
- Status APIの404（ユーザー行不在）は再試行可能な5xxと分け、Setupでは無限再試行ではなく再ログイン導線を出す
- 既にセットアップ済みのユーザーは目標値のオンボーディング範囲検証より先にホームへ戻す。Settings等の既存範囲で保存された値を理由に`/setup`へ閉じ込めない
- Statusの初回取得と再試行は`AbortController`または世代IDで旧応答を無効化し、再試行中のボタンをdisabledにする。遅い旧失敗が新しい成功を上書きしてフォームを再ロックできないこと
- 保存成功後はNextAuth sessionを更新してから永続的な完了面を表示し、即時redirectで達成・次行動のフィードバックを消さない
- Setupの全入力とCTAは44px以上にし、HTML `pattern`の文字クラス内でハイフンを使う場合は`v`フラグ互換になるよう `\-` と明示エスケープする。実ブラウザconsoleで正規表現エラーが0件であることを確認する
- Setup入力のフォーカスリングは`--color-primary`で統一し、`transition-shadow`等で初期フレームを透明にせず即時表示する
- 接続確認は既存の認証プロバイダを表示するだけとし、セットアップ改善を理由にOAuth再認可・接続切替・本番DB migrationを行わない
- セットアップの意味色は青=目標/最初のクエスト、緑=接続/完了とし、実際のUC報酬を示す場合だけアンバーを使う。全面グラデーションやモノクロmarkへ戻さない。リファレンス: `app/[locale]/setup/page.tsx`, `app/api/user/setup/route.ts`, `app/api/user/status/route.ts`

#### Settingsの健康行動優先契約

- SettingsのDOM順は歩数ソース→日次歩数目標→プロフィール→言語/テーマ/統計/通知とし、健康行動を称号・フレーム・ショップ等の装飾より先に提示する
- 日次目標は`lib/step-goal.ts`をClient/API/Setupで共有し、500〜100,000の整数だけを保存する。Settings APIだけ0歩や100万歩を受理する範囲差を作らない
- 歩数目標の編集入力はモバイル16px、全操作44px以上、エラー時は入力へfocus、保存中は二重送信を防ぎ、成功/失敗を永続的なstatus/alertで通知する
- 日次目標カードと入力は装備テーマ色ではなく意味色`--color-primary*`（青=目標）を使う。Pop/Sakura等でも青を固定し、Midnightだけコントラスト用の明色へ変える。プロフィール装飾の`--theme-primary`と同色化せず、健康行動とカスタマイズの役割差を維持する
- Midnightの`.bg-white`は`border-left`まで`!important`で上書きするため、日次目標の4pxアクセントは`.settings-goal-card`のMidnight局所ルールで復元する。Classic/Midnight/Pop/Sakuraで左4px・他辺1pxをcomputed style実測する
- `users`、テーマ所有権、所持アイテムのDB障害を未設定・未所有へ偽装せず、ページエラーへ分岐する。任意のアクティビティ通知カラム取得失敗は通知トグルだけを非表示にして明示エラーを出し、プロフィール・目標等の独立設定は利用可能に保つ
- 表示していないSmart Goal用の`daily_steps`やUC残高を取得しない。Settingsの初期表示で使うデータだけを並列取得する
- モバイルパネルは`p-3 sm:p-5`を基本とし、2列統計の全幅行は`col-span-2 sm:col-span-3`、3件目は`col-span-2 sm:col-span-1`として320pxで暗黙3列を作らない。リファレンス: `app/[locale]/settings/page.tsx`, `components/SettingsForm.tsx`, `components/StepGoalForm.tsx`, `app/api/user/step-goal/route.ts`

#### Profileの0歩・欠測・部分障害契約

- 日次・週次・月次は`number | null`で扱い、記録済み0歩は`0`、未記録は`null`、取得失敗は別の`unavailable`状態として表示する。`|| 0`で3状態を統合しない
- 期間平均は同じ期間の合計を記録日数で割り、記録済み0歩を分母へ含める。活動日数は正歩数の日だけを数え、累計歩数を直近期間の活動日数で割らない
- Profileの必須ユーザー行だけを致命的な取得境界とする。歩数履歴、累計RPC、比較歩数、公開グループ、装備、バッジ、コイン、ランキング、おすすめの障害は各セクションへ明示し、他のプロフィール情報を表示し続ける
- 閲覧者の比較歩数取得失敗や記録0件で対象プロフィールを停止しない。失敗・未記録を別コピーで示し、比較できる期間だけ数値差を表示する
- ActivityGraphは主系列・比較系列とも`Map.has(date)`で記録済み0歩と欠測を分ける。視覚バーだけでなく`sr-only`表でも欠測を「未記録」と読み上げ、目標未設定時は10,000歩へ偽装せず目標線・達成色を出さない
- PersonalRecordsは歩数系・コイン系を独立nullableにし、1ソース障害でカード全体を消さない。プロフィールの可視補助文字は12px以上を維持する。リファレンス: `app/[locale]/user/[username]/page.tsx`, `lib/profile-steps.ts`, `components/ActivityGraph.tsx`, `components/profile/PersonalRecords.tsx`

#### Walletの獲得・支出・次報酬契約

- 今日の獲得は正額取引だけ、支出は負額の絶対値、純増減は獲得−支出として別表示する。購入後の負値を「今日の入金」として表示しない
- 今日の内訳は直近N件の履歴sliceから計算せず、JST当日の全取引を専用クエリで集計する。取引履歴の件数上限が日次サマリーを欠落させないこと
- 次報酬は今日の記録歩数と有効な目標から、次の最大100歩または目標到達までの基本UCを計算する。目標到達時だけ目標ボーナスを追加し、歩数未記録・目標未設定・DB失敗を別コピーにする
- 残高、取引履歴、資産推移、今日取引、今日歩数の障害をパネル単位へ分離し、1クエリ失敗でWallet全体を停止したり0へ偽装しない
- 取引履歴は見出し直後に正額/負額/取引後残高の説明を置く。通常ページ内の固定高`overflow-y-auto`へ閉じ込めずdocumentスクロールを使い、12px補助文字は`--color-text-muted`で4.5:1以上を維持する
- 取引履歴は初期10件を表示し、44pxの「さらに表示」で10件ずつ開示する。残高/ランクが欠落した2列gridでは履歴を`lg:col-span-2`へ広げ、空いた狭い列へ押し込まない
- ランクと履歴を並べる`lg` gridは`items-start`にし、子カードから`h-full`を外す。件数の多い履歴が短いランクカードをstretchしてカード内空白を作らない
- 資産推移の棒は「日次獲得」でなく購入を含む「日次純増減」と呼び、`sr-only` wrapper内のcaption/th付き表で日付・純増減・残高へ到達できるようにする。リファレンス: `app/[locale]/wallet/page.tsx`, `lib/wallet-summary.ts`, `components/CoinBalanceCard.tsx`, `components/TransactionHistory.tsx`, `components/CoinGrowthChart.tsx`

#### ストリーク節目報酬の原子性・冪等性契約
- 7/30/100/365日のストリークバッジとUC報酬は、完了済みJST日を対象にDB正本の`daily_steps`・`users.step_goal`・全シールド利用履歴で再検証する
- 節目報酬は日次再計算される`STREAK_BONUS`へ混在させず、専用`STREAK_MILESTONE`種別と`streak_milestone:{userId}:{badgeCode}`の一生涯キーを使う。日付付きキーや日次削除対象へ入れない
- バッジ、`coin_transactions`、`coin_balances`はユーザー行`FOR UPDATE`下の単一RPCで原子的に更新する。既存バッジへUCを遡及付与せず、新規節目だけを一回付与する
- ミッション完了報酬・全達成ボーナスも同じユーザー行ロック付き入金RPCへ統一する。並行CronはユーザーID順にロックし、ユーザー単位の失敗を隔離しつつ、処理可能な通知後にCronを非成功へする
- 歩数同期の台帳再集計も同じユーザー行ロック付きRPCで行い、途中で確定した節目・ミッション報酬を古い絶対残高で上書きしない
- 節目バッジとUCは個人・グローバル・グループの既存バッジ通知へユーザー単位で集約し、ja/en本文に実際の追加UCを含める。報酬0の3日バッジで`+0 UC`を表示しない
- Walletの履歴と獲得分析は`STREAK_MILESTONE`を専用ラベルで表示し、未知種別を歩数入金へ偽装しない。リファレンス: `migrations/20260718_add_streak_milestone_rewards.sql`, `lib/services/badge-awards.ts`

#### ⑦ 翻訳キー要件（messages/ja.json, messages/en.json）

新規ページには最低限以下の翻訳キーを定義すること:

```json
{
  "PageName": {
    "title": "ページ名",
    "headerDesc": "ページの説明文"
  }
}
```

### Cloudflare Pages デプロイ前チェック（必須）

コードを push する前に、以下を必ず確認すること。

#### Edge Runtime 宣言

- **すべての `app/` 配下の非静的ルート**（`page.tsx`, `route.ts`）には、ファイル先頭に `export const runtime = 'edge';` を記載すること
- Cloudflare Pages は Edge Runtime のみ対応。Node.js Runtime のままだとビルドが失敗する
- `layout.tsx` には不要（ページとAPIルートのみ）
- 新規ファイル作成時は最初の行に必ず追加すること

```ts
// ファイル先頭に必ず記載
export const runtime = "edge";
```

#### ビルド検証

- push 前に `npx @cloudflare/next-on-pages` または `npm run pages:build` を実行してビルドが通ることを確認
- 特に新規ページ・API ルート追加時は Edge Runtime 漏れが発生しやすいため注意

#### `.next` キャッシュ破損の防止（必須）

- **`npx next build` を実行した後は、必ず `.next` ディレクトリを削除すること**
  ```powershell
  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
  ```
- `next build` は `.next` 内のファイルを本番用に上書きするため、`next dev` で使うキャッシュと不整合が起き、`routes-manifest.json` や WASM ファイルが見つからず 500 エラーになる
- ビルド検証の最後のステップとして `.next` 削除を必ず実行し、ユーザーが `npm run dev` を再起動すれば正常に動作する状態にすること
- **TypeScript 型チェック (`npx tsc --noEmit`) はキャッシュを破損しないため、ビルド検証にはこちらを優先使用すること**

#### Node.js 専用 API の使用禁止

- Edge Runtime では `fs`, `path`, `child_process` 等の Node.js ネイティブモジュールは使用不可
- `crypto` は Web Crypto API (`crypto.subtle`) を使用すること

#### Server/Client 境界違反の防止（`tsc` では検出不可）

- **`'use client'` モジュールから export された関数を Server Component で呼び出すとランタイムエラーになる**（`tsc --noEmit` はこの違反を原理的に検出できない）
- `'use client'` モジュールからは **React コンポーネントの import のみ** Server Component で許可
- 純粋なユーティリティ関数（型変換マップ、定数等）を Server/Client 両方で使う場合は `lib/` 配下の共有モジュール（`'use client'` 宣言なし）に配置する
- **import 前に必ずインポート先ファイルの先頭に `'use client'` がないか確認すること**

#### `next/dynamic` の `ssr: false` 制約（ビルドエラー防止）

- **Server Component（`'use client'` 宣言がないファイル）では `dynamic(() => import(...), { ssr: false })` は使用禁止**
  - Next.js 15 では Server Component 内の `ssr: false` でビルドエラーになる
  - `ssr: false` は `'use client'` 宣言のある Client Component 内でのみ使用可能
- **Recharts 等の SSR 非対応ライブラリを Server Component のページから使う場合:**
  - 対象コンポーネント自体を `'use client'` にし、その中で `import` する（通常はこれで十分）
  - または中間の Client Component ラッパーを作り、そこで `dynamic(() => import(...), { ssr: false })` する
- 参考: `GroupAnalytics.tsx`（Client Component 内で `ssr: false`）✅ / `wallet/page.tsx`（Server Component で `ssr: false` → ビルドエラー）❌

---

## JPUCSupport 共通ルール準拠セクション

> 以下のセクションは JPUCSupport 組織配下の全プロジェクトで統一されたルールを
> UCFitness 向けに適用したもの。

### README 同期 (必須)

- コード変更時に関連する README セクションを**必ず同一コミットで更新**する
- 対象: ファイル追加/削除、ディレクトリ構造変更、機能追加/変更、API エンドポイント変更、設定ファイルの構造変更、翻訳キー追加
- 「次回更新する」という先送りは禁止
- Copilot Instructions (本ファイル) も同様 --- コード変更がルール・インストラクションに影響する場合は同一コミットで更新

### エージェント組織図の README 同期 (必須)

`.github/agents/`, `.github/prompts/`, `.github/skills/`, `.github/instructions/` 配下のファイルを**追加・削除・変更**した場合、README.md の `### カスタムエージェント` セクション内の**組織階層図（テキスト版）**と関連テーブルを**同一コミットで更新**すること。

#### 更新トリガー

| 変更内容                                     | 更新対象                                                       |
| -------------------------------------------- | -------------------------------------------------------------- |
| `.agent.md` の追加・削除・リネーム           | 階層図 + エージェント詳細一覧テーブル + ロール自動選択テーブル |
| `.prompt.md` の追加・削除 (agents/ 配下)     | 階層図の「Agent Sub-Prompts」ノード                            |
| `.prompt.md` の追加・削除 (prompts/ 直下)    | 階層図の「Slash Commands」ノード                               |
| `SKILL.md` の追加・削除                      | 階層図の「Skills」ノード + Skills テーブル                     |
| `.instructions.md` の追加・削除              | 階層図の「Shared Instructions」ノードのファイル数              |
| `UCFitnessAgent.agent.md` のロール追加・変更 | 階層図のロール配置 + ロール自動選択テーブル                    |

#### 階層図のフォーマットルール

階層図は以下のスタイルで記述する:

```
👤 User (VS Code Chat Panel / Slash Commands)
│
├── ⚙️ {MasterAgent} [Orchestrator — Layer 1]
│   │  {説明テキスト}
│   │
│   ├── 📁 {カテゴリ名}
│   │   ├── {色絵文字} {AgentName}              {役割の短い説明}
│   │   │   └── 🔧 [{skill名} skill]
│   │   └── {色絵文字} {AgentName}              {役割の短い説明}
│   │
│   ├── 🎭 {StandaloneAgent}               {役割の短い説明}
│   └── 🧹 {JanitorAgent}                  {役割の短い説明}
│       └── 🔄 {SubWorkflow}               {説明}
│
├── ⚡ Slash Commands (Prompts) — ユーザーが直接呼び出す定型タスク
│   ├── {絵文字} /{command-name}               {用途}
│   ...
│
├── ⚡ Agent Sub-Prompts — {MasterAgent} 内部で使用するワークフロー
│   ├── {絵文字} /agents/{prompt-name}         {用途}
│   ...
│
├── 📋 Shared Instructions (全エージェント共通ルール)
│   ├── {filename}                             {説明}
│   ...
│
└── 🔧 Skills (再利用可能なドメイン知識)
    ├── {skill-name}                           {説明}
    ...
```

**スタイル規則:**

- **ルートノード**: `👤 User` — ユーザーが起点
- **オーケストレーター**: `⚙️` + `[Orchestrator — Layer N]` で階層レベルを明示
- **エージェントロール**: 色付き四角絵文字 (🟦🟩🟥🟨🟪🟧🟫) で視認性を確保。同じロールには同じ色を維持する
- **カテゴリグルーピング**: 関連ロールは `📁 {カテゴリ名}` でグループ化
- **スキル参照**: エージェントが使用するスキルは `🔧 [{skill名} skill]` で子ノードに配置
- **Slash Commands**: `⚡` + コマンドごとに用途を示す絵文字
- **説明テキスト**: ロール名の後にスペース区切りで右揃え風に配置（等幅フォント前提）
- **コードブロック内**: 絵文字は使用 OK（コンソール出力禁止ルールの対象外）

### プロジェクトルートの整理ルール（必須遵守）

**プロジェクトルートにスクリーンショット・ログ・一時ファイルを放置しない。**

- **スクリーンショット**: Playwright 等で生成したスクリーンショットは `screenshots/` フォルダに格納する。ルート直下への出力は禁止
- **ログファイル**: `lint.log` 等のビルド・リント出力は作業完了後に必ず削除する。コミット対象にしない
- **一時スナップショット**: 拡張子なしのスナップショットファイル（`audit-desktop-top` 等）をルートに残さない。不要になった時点で即削除
- **`.gitignore` で防止済み**: `/*.png`, `/*.jpg`, `lint.log` 等はルートレベルで `.gitignore` に登録済み。サブフォルダ内の画像は影響を受けない
- **許可されるルートファイル**: `README.md`, `package.json`, `tsconfig.json`, 各種設定ファイル（`.eslint*`, `next.config.*`, `postcss.config.*`, `vitest.config.*`）、`middleware.ts`, `navigation.ts`, `i18n.ts` のみ

### ディレクトリ構造整理ルール（必須遵守）

**フラットに 100 以上のファイルが並ぶディレクトリは整理対象。** 新規ファイル作成時は、以下のサブフォルダ分類に従うこと。

#### `components/` のサブフォルダ分類

新規コンポーネント作成時は、該当するサブフォルダに配置する。既存のフラットファイルは計画的なリファクタリングで段階移行する（import パス変更を伴うため、専用ブランチで実施）。

| サブフォルダ              | 対象コンポーネント                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `components/leaderboard/` | ランキング・リーダーボード系                                                        |
| `components/shop/`        | ショップ・購入系                                                                    |
| `components/group/`       | グループ関連（`Group*.tsx`）                                                        |
| `components/challenge/`   | チャレンジ関連（`Challenge*.tsx`）                                                  |
| `components/dashboard/`   | ダッシュボード専用ウィジェット（`Dashboard*.tsx`, `HomePortal`, `QuickActions` 等） |
| `components/profile/`     | プロフィール関連（`Profile*.tsx`）                                                  |
| `components/auth/`        | 認証関連（`Auth*.tsx`, `LoginBonusToast`）                                          |
| `components/ui/`          | 汎用 UI 部品（`Spinner`, `Toast`, `Breadcrumbs` 等）                                |
| `components/layout/`      | レイアウト系（`Footer`, `UserMenu`, `BottomNavBar`, `RefreshButton` 等）            |

#### `lib/` のサブフォルダ分類

| サブフォルダ    | 対象モジュール                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `lib/` (直下)   | 共通ユーティリティ（`auth.ts`, `supabase.ts`, `constants.ts`, `env.ts`, `errors.ts`, `validation.ts`, `date-utils.ts`） |
| `lib/services/` | ビジネスロジック（`badge-*.ts`, `coin-service.ts`, `shop-service.ts`, `ranking-*.ts`, `step-manager.ts`）               |
| `lib/api/`      | 外部 API 連携（`fitbit.ts`, `amazon-creators-api.ts`, `web-push.ts`, `teams.ts`）                                       |

#### `screenshots/` のクリーンアップ

- スクリーンショットは**作業中の一時ファイル**であり、長期保存しない
- Improvement Loop / Playwright 検証の完了後、不要なスクリーンショットは即削除する
- README やドキュメントに使用する画像のみ `public/` または `docs/images/` に保存する

### ファイル命名規則

- **ファイル名**: 英語のみ。日本語ファイル名は禁止 (URL エンコーディング問題回避)
- **コンポーネント**: PascalCase (`UserMenu.tsx`, `ActivityFeed.tsx`)
- **ユーティリティ / lib**: camelCase (`pushMessages.ts`) またはケバブケース (`push-messages.ts`)
- **設定ファイル**: `.env` (本番用) は `.gitignore` に追加、`.env.example` をコミットしてプレースホルダー値を記載
- **翻訳ファイル**: `messages/ja.json`, `messages/en.json` の 2 ファイル構成

### エンコーディング (Node.js / TypeScript)

- ソースファイルは **UTF-8 (BOM なし)** で保存
- ファイル I/O 時は必ずエンコーディングを明示指定する
- コンソール出力に絵文字を使用禁止 --- ASCII マーカー (`OK:`, `ERR:`, `SKIP:`, `WARN:`) を使用すること
- Markdown ファイル (`.md`) を編集した後は、必ず U+FFFD スキャンを実行すること (BMP 外絵文字の文字化け防止)
- ログファイルはスクリプト内部で UTF-8 明示指定で実装し、シェルリダイレクト (`>`, `Tee-Object`) に依存しない

### セキュリティ / シークレット管理

- **絶対禁止**: シークレット (パスワード、API キー、トークン、Supabase サービスロールキー、NextAuth シークレット) をソースコードにハードコードしてはならない
- **設定ファイル戦略**:
  - `.env` / `.env.local` は `.gitignore` に追加済み
  - `.env.example` をコミットし、プレースホルダー値を記載
- **サーバーサイドのみ**: `supabaseAdmin` (サービスロールキー使用) はサーバーコンポーネント・API ルートのみで使用。クライアントに露出させない
- **Fitbit API トークン**: OAuth リフレッシュトークンは DB に保存し、アクセストークンはメモリ内で短命管理
- **OAuthログインIDの照合**: 自動アカウントリンクは `provider + provider_account_id` の完全一致だけで行う。同一メールを理由に別プロバイダIDや別アカウントへリンクしてはならず、DB照会失敗時も新規ユーザー作成へ進まず認証を拒否する。`lib/auth.ts` のメール一致クエリは `check:rules` で禁止する
- **OAuthログイン結果の表示**: Auth.jsの既定エラーページや生の`error`値をユーザーへ表示しない。`pages.error`と`pages.signIn`で公開LPへ戻し、`lib/auth-flow.ts`のallowlist分類からja/enの`role="alert"`と再試行CTAを表示する。`pages.signIn`を省くと`OAuthAccountNotLinked`等の`SignInError`がLPへ到達しない。`signIn` callbackの`false`/通常例外はAuth.jsで`AccessDenied`へ統合されるため、DB照会・保存障害は`CallbackRouteError`として投げ、ユーザー拒否と区別する。保護画面の安全な戻り先は認証失敗後もsessionStorageへ保持し、エラー画面内の全ログインCTAで初期描画から再利用する。言語切替時は`next`のlocale prefixも表示言語へ揃える。認証後はユーザーDB取得成功かつusername未設定の場合だけ`/setup`へ送り、DB障害を未設定へ偽装しない。新規ユーザーはsetup完了後に保存済み戻り先を優先しつつ、最初の500歩Activation CTAも副導線として残す。リファレンス: `lib/auth.ts`, `lib/auth-flow.ts`, `components/LandingPage.tsx`, `app/[locale]/setup/page.tsx`
- **OAuth stateの開始ユーザー拘束**: OAuth stateはランダムnonceと有効期限だけでなく、開始時のUCFitnessユーザーIDをHMAC署名へ含める。コールバックではstate Cookieとの定数時間比較と署名・期限を検証し、現在のセッションユーザーが開始ユーザーと異なる場合はトークン交換前に拒否する。リファレンス: `lib/google-health-oauth.ts`
- **OAuth 再認可時の更新トークン保持**: OAuth プロバイダは再認可時に更新トークンを返さない場合がある。既存接続の更新トークンを `null` で上書きせず保持し、初回接続で更新トークンが得られない場合は接続を成立させない。リファレンス: `lib/services/fitness-connection-service.ts`
- **健康データ接続保存の原子性**: 外部ID継続性の確認、既存更新トークンの保持、資格情報upsertをアプリ側のread-then-writeへ分離しない。ユーザー行をロックする単一DB関数で直列化し、並行OAuthコールバックによるIDすり替えや更新トークン消失を防ぐ。リファレンス: `save_google_health_connection`
- **健康データソース状態の区別**: `active` 行が取得できないことを「未接続」と同一視しない。`reauthorization_required` / `error` は別ソースへの暗黙切替を禁止し、`disconnected` のみ明示解除として旧ソース利用を許可する
- **機能フラグ停止時の既存接続保護**: Google Healthの機能フラグは新規接続・再接続だけを停止する。既存接続の状態取得・同期・解除は継続し、フラグ停止を未接続と誤認してFitbitへ切り替えない
- **OAuth 解除時の原子的停止**: DB関数内で対象接続をロックし、`disconnected` への遷移・同期リース無効化・資格情報消去を同一トランザクションで先に完了する。その関数が返した暗号化トークンをサーバー側で復号してからプロバイダ失効を試行し、失効失敗でも接続や資格情報を復活させない。失効要求にはURLクエリではなくPOST本文を使い、トークンや応答本文をログへ含めない。リファレンス: `disconnect_google_health`
- **暗号文のコンテキスト拘束**: AES-GCMのAADにはユーザーID・プロバイダ・トークン用途を含め、別ユーザーやaccess/refresh列へ暗号文を移しても復号できないようにする
- **OAuth更新失敗の分類**: `invalid_grant`、更新後も継続する401、必須スコープ欠落などプロバイダが確認した恒久的な資格情報失効だけを再認証必須にする。5xx・ネットワーク・DB保存失敗・暗号鍵設定不備・暗号文復号失敗は接続状態を変更せず、同期結果を`error`または利用不能として隔離する
- **健康データソース切替時の履歴置換**: 新ソースが欠測日を返さなくても旧ソース値を残さない。欠測を0歩へ変換せず、初回移行では当日を除く全APIチャンクを取得し終えてから、対象期間の削除と取得済み行の挿入を一度のDBトランザクションで原子的に実行する。破壊的な履歴置換は初回移行完了までに限定し、通常同期では繰り返さない。リファレンス: `replace_daily_steps_range`, `history_synced_at`
- **進行中歩数の単調性**: 当日の健康データは再集計や同期遅延で一時的に欠測・減少し得る。Google Health／Fitbitのどちらでも空応答で保存済み行を削除せず、既存値と取得値の最大値をDB内で原子的に保存し、コイン再計算にも永続化後の値を使う。リファレンス: `upsert_daily_steps_max`, `upsert_fitbit_daily_steps_max`
- **一括資格情報処理の障害分離**: 複数ユーザーの暗号文復号・外部API準備を裸の `Promise.all` でまとめない。1件の破損や鍵不一致は対象ユーザーの同期選択だけを`error`として隔離し、DB接続状態は書き換えず、他ユーザーの同期を継続する
- **不正接続行の安全側処理**: 一括接続取得で解析できない行を結果から脱落させない。ユーザーIDを復元できる場合は `error` 選択として返して旧ソースへの暗黙切替を遮断し、復元できない場合は一括同期を停止して調査する
- **健康データ同期の所有権**: Cron・手動同期・初回履歴移行はユーザー単位の所有者UUID付きDBリースで直列化する。トークン更新、再認証状態、同期完了時刻、履歴置換、当日upsert、移行完了記録を含む同期由来の全書き込みは、同じリースIDをDB関数内で必須検証する。所有権を省略できる分岐を設けず、解除後・期限切れ・所有権喪失後の書き込みを拒否する。全ユーザー同期は固定サイズの並列バッチに制限する
- **旧データソース履歴の競合防止**: Fitbit履歴取得の開始前チェックだけを信頼しない。外部API取得後の保存時にユーザー行とGoogle Health接続行をDB関数内でロックし、Google Healthが選択中または移行済みならFitbit履歴書き込みを拒否する。リファレンス: `upsert_fitbit_daily_steps_batch`
- **健康データ移行時のID照合**: Google Health の `legacyUserId` と既存 Fitbit の `provider_account_id` が両方存在する場合は一致を検証し、不一致の健康データ接続を拒否する。再接続時も保存済みGoogle Health IDとの一致を必須とし、メールアドレス一致による暗黙統合は禁止する
- **獲得済み報酬の非減額**: 健康データソース切替による過去履歴の置換では、獲得済みUCを再計算・減額しない。当日UCの再計算には単調増加で永続化した歩数だけを使う
- **同期結果の正直な通知**: 歩数同期APIは更新、データなし、再認証待ち、同期競合、利用不能を構造化して返す。`steps: null` やDB保存失敗を成功レスポンス・成功トーストへ変換しない
- **`console.log` でのシークレット出力禁止**: デバッグ時もトークン・キーをログに含めない

### 社内コンプライアンスポリシー (CSS Data Policy)

> **参照ポリシー**:
>
> - Article 5072448: [Guidance for Support Engineers in using Copilot Chat/Agent](https://internal.evergreen.microsoft.com/en-us/topic/2551d022-d53d-4abc-c733-4aa959b7fb87)
> - Article 4457137: [Handling support data (commercial customers)](https://internal.evergreen.microsoft.com/en-us/topic/e7f0b758-57f8-41e9-1b42-fbea2fab36cf)

#### 絶対遵守事項

1. **PII 禁止**: お客様の PII (氏名、メールアドレス、電話番号、テナント ID 等) をプロンプトに入力してはならない
2. **パスワード禁止**: お客様のパスワードの送受信は絶対禁止
3. **MCP 制限**: TrIP 承認済みの MCP サーバーのみ使用可。オープンソース MCP サーバーでの顧客データ処理は禁止
4. **データ転送**: サポートデータの転送は **DTMv2 のみ**。メール添付、OneDrive、Teams 共有は禁止
5. **データ削除**: トラブルシューティング完了後は Copilot ログおよびサポートデータのローカルコピーを速やかに削除
6. **使用アカウント**: @microsoft.com アカウントまたは紐づいた GitHub Enterprise アカウントのみ

### テスト / 品質保証

- コード修正後は**必ず型チェック (`npx tsc --noEmit`) とリント (`npx next lint`) を実行**し、PASS を確認してから完了報告する
- Vitest テストがある場合は `npx vitest run` で関連テストも実行する
- 既存テストが失敗した場合は**実装バグを先に疑う** --- テストコード修正が必要な場合はユーザーに確認する
- テスト用設定値を本番設定に混入させない
- テスト後のクリーンアップ (一時ファイル、テストブランチの削除) を必ず実施
- **`.next` キャッシュ破損注意**: `npx next build` 実行後は `.next` ディレクトリを削除すること (型チェックには `tsc --noEmit` を優先)

### Supabase DB スキーマルール（必須遵守）

- **FK 参照先は `public.users` を使用**: UCFitness は NextAuth を使い、ユーザーを `public.users` テーブルに保存する。Supabase Auth の `auth.users` は使用していない。マイグレーション SQL で `REFERENCES auth.users(id)` と書くと FK 制約違反でデータ挿入が失敗する。**必ず `REFERENCES public.users(id)` を使用すること**
- **新規テーブル作成時**: `created_by` / `user_id` 等のカラムが `auth.users` を参照していないことを確認する
- **派生接続テーブルの継続同期**: 一回限りのバックフィルだけに依存しない。`users` の認証プロバイダ情報を別テーブルへ複製する場合は、同一トランザクションのDBトリガーまたは全書き込み経路でupsertし、移行後の新規・再リンクユーザーも必ず同期する
- **Supabase count の抽出**: `challenge_participants(count)` 等の埋め込みカウントは、Supabase バージョンにより `[{count: N}]`（配列）または `{count: N}`（オブジェクト）を返す。**両方の形式をハンドルすること**
- **CRUD API の完全性チェック**: 新規テーブル/リソースの API を作成するときは、GET（一覧・詳細）/ POST（作成）/ PUT（編集）/ DELETE（削除）の 4 操作すべてが必要かを確認し、必要な操作を最初から実装する。「編集 API なし」で出荷しない

### 自動実行の安全制約

#### 破壊的・不可逆操作の禁止

以下の操作は**ユーザーの明示的な承認なしに実行してはならない**:

- `git push --force` / `git reset --hard` / 公開済みコミットの amend
- ファイル/ブランチの削除 (`rm -rf`, `git branch -D`)
- データベースへの書き込み・削除操作 (Supabase)
- 外部サービスへの投稿 (PR コメント、Teams メッセージ送信)
- 本番環境への変更適用 (Cloudflare Pages デプロイ)

#### 安全チェック回避の禁止

- `--no-verify` / `--force` / `-f` 等の安全チェックバイパスオプションは使用禁止
- CI/CD パイプラインの手動スキップは禁止

#### 自動実行の原則

| 操作                                   | ユーザー確認                |
| -------------------------------------- | --------------------------- |
| 作業ブランチへの `git push`            | 不要 (自動実行 OK)          |
| PR の作成 (`gh pr create`)             | 不要 (自動実行 OK)          |
| PR のマージ (`gh pr merge`)            | **必須**                    |
| `main` / `master` への直接 push        | **禁止**                    |
| 本番データの変更 (Supabase)            | **必須**                    |
| Cloudflare Pages デプロイ (`git push`) | **必須** (デプロイ制限あり) |
| ドライラン / プレビュー                | 不要 (自動実行 OK)          |

### AI Harness — 進捗ファイルとセッション管理

> **設計根拠**: Anthropic "Effective Harnesses for Long-Running Agents" + everything-claude-code の Continuous Learning / Memory Persistence パターンに基づく。
> エージェントがセッション間で文脈を失わないための構造化ハンドオフシステム。

#### Project / worktree の同一性確認

- 子セッション作成・専門agent委任の前に、**ユーザー画面上のproject名、project ID / 内部名、main path、対象cwd、branch**を確認する。同じGitHub repositoryを指すことだけでは同一projectと判断しない
- 目的projectの初期化に失敗しても、同じrepositoryを指す別projectへ無断でfallbackしない
- 目的projectを修復できない場合は、そのproject内の現行セッションで専門agentを直接実行する。別projectの利用は、ユーザーへ対象project名とmain pathを示して明示確認を得た後に限る

#### 進捗ファイル (`ucfitness-progress.json`)

- **場所**: `.github/ucfitness-progress.json`
- **形式**: JSON（Markdown よりエージェントによる不用意な改変リスクが低い）
- **用途**: セッション間のハンドオフ用構造化メモ（前回の作業内容、Feature Backlog、既知の問題、環境状態）

#### 進捗ファイルの更新ルール

| タイミング                                  | 更新する項目                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| タスク完了時（Clean State Protocol の一部） | `lastUpdated`, `lastAgent`, `lastCommit`, `summary`, `sessionLog`, 完了した機能の `status` |
| Improvement Loop の Step 0 (Initializer)    | `featureBacklog`（新規項目追加）, `knownIssues`, `environmentStatus`                       |
| 新しい Lessons Learned 発見時               | `instincts.items` に暫定パターンを追加（confidence 0.8 超で copilot-instructions に昇格）  |

#### 進捗ファイルの操作制約

- **`featureBacklog` の `status` フィールドのみ変更可能**。`description` や `name` は初回登録時に確定し、以降は変更しない（Anthropic の "strongly-worded instructions: unacceptable to remove or edit tests" に準拠）
- **`sessionLog` は追記のみ** — 過去のログを削除・編集しない
- **コミットに含める** — 進捗ファイルの更新は関連するコード変更と同じコミットに含める

#### Session Memory の活用

- **セッション中**: 複雑なタスクの中間状態を `/memories/session/current-task.md` に記録
- **セッション終了時**: 未完了タスクがあれば中間状態を記録。完了タスクの場合は `ucfitness-progress.json` を更新

### 自己改善プロトコル (Lessons Learned)

障害・未検出・誤検出・ワークフロー上の問題が発生した場合、**コード修正 + プロンプト/instruction 更新 + コミットの 3 点セット**を同一セッション内で完了する。
ユーザーから品質フィードバック・不満・「なぜ」「甘い」「十分でない」等の指摘を受けた場合も同じ扱いとし、**反省点・根本原因・再発防止策を必ずルール化してから実装を完了する**。

#### 記録フォーマット

```markdown
### LL-XXX: {タイトル}

- **事象**: {何が起きたか}
- **根本原因**: {なぜ起きたか}
- **対策**: {どう修正/予防したか}
- **教訓**: {今後の汎用的な学び}
```

#### ルール

- **フィードバック処理の必須順序**: 1) 指摘を否定せず受け止める 2) 反省点を明文化する 3) 根本原因を特定する 4) `.github/copilot-instructions.md` または該当 instruction/skill に再発防止ルールを追加する 5) 実装修正する 6) ルールに対応した検証を実行する
- **Lessons Learned番号の一意性**: 新規LL番号はrepository本体だけでなく全open PR refも検索し、既存PRの番号・内容を変更せず未使用番号を確定する
- コード変更時に関連するプロンプトの処理フロー・ステップ説明・検証項目を**同一コミットで更新**
- **禁止**: 「次回修正します」と先送り / ユーザーに指摘されてから修正 / 説明だけでコード未修正 / コード修正だけでプロンプト未更新
- **完了前ゲート**: コード・UI・設定・カスタマイズ・ドキュメント変更後は、ユーザーへ報告する前に必ず `self-critique-gate` skill を実行し、要件充足・回帰防止・技術検証・UI/UX・ルール化を証拠ベースで確認する
- **ペルソナ回遊監査**: UI / UX / ナビゲーション / App Shell / 主要導線を変更した場合は、既存の `UCFitnessAgent` を統括役として複数ペルソナエージェントを起動し、Playwright 等で実際の行動パターンを回遊させて問題点・改善点を抽出する。別の統括エージェントを増やさず、UCFitnessAgent に集約する

---

### LL-001: globals.css の ID セレクタが Tailwind レスポンシブクラスを上書きしてページが崩壊

- **事象**: `app/[locale]/layout.tsx` で `lg:flex-row` を設定したにもかかわらず、デスクトップ認証済みページで `DashboardSidebar` とコンテンツが縦積みになり、「ホームに何も表示されない」「他ページがナビで壊れる」症状が発生した。
- **根本原因**: `app/globals.css` に `#main-content { flex-direction: column; }` という ID セレクタルールが存在し、詳細度が Tailwind の `lg:flex-row`（クラスセレクタ）より高かったため、常に `column` が適用されていた。
- **対策**: 認証済み Shell に `uc-auth-shell` クラスを付与し、`#main-content.uc-auth-shell`（ID + class セレクタ）を使って `@media (min-width: 1024px) { flex-direction: row; }` で明示的に上書きした。
- **教訓**: `globals.css` に ID セレクタ（`#id { ... }`）で汎用プロパティを定義すると、後から追加するレスポンシブクラスが詰まる。新しいレイアウト変数を CSS で管理する場合は、**ID セレクタよりも class セレクタ / CSS custom property / `@layer` で管理する**こと。グローバル CSS に ID セレクタを追加する前に「Tailwind のレスポンシブクラスと競合しないか」を必ず確認する。

### LL-002: 「起動中」と報告したがサーバーが実際には終了していた虚偽報告

- **事象**: `npm run dev` を実行したと報告したがセッション終了とともにプロセスが消えており、ユーザーからの「本当に起動しているのか」という確認に「している」と応答してしまった。
- **根本原因**: プロセス状態を実測せずに「起動したはず」という推測で報告した。
- **対策**: 「起動している」と報告する前に必ず `lsof -nP -iTCP:3000 -sTCP:LISTEN` と `curl -I http://localhost:3000/` で実測確認する。確認前は「確認中」と言い、推測報告を禁止する。
- **教訓**: サーバー状態の報告は**実測値のみ**。async プロセスは session 終了時に消えることがあるため、前回の実行履歴に依存してはならない。

### LL-003: CSS グローバルファイルへの ID セレクタ追加禁止ルール

- **事象**: LL-001 の根本原因を受けて追加ルールとして定義。
- **根本原因**: なし（予防的ルール）。
- **対策**: `globals.css` / `global.css` などグローバルスタイルファイルへの **ID セレクタ（`#id { ... }`）の追加を禁止**する。代替手段:
  - `@layer base { ... }` で優先度を明示
  - CSS Custom Property（変数）でレイアウト値を管理
  - class セレクタ（`.uc-auth-shell { ... }`）を使い、必要な詳細度のみ付与
- **教訓**: Tailwind は class セレクタを基本とするため、グローバル CSS で ID セレクタを混在させると詳細度競合が発生しやすい。

### LL-004: 自己批判が任意運用で終わり、修正漏れ・巻き戻り・検証不足を防げなかった

- **事象**: UI/UX 改善中に、修正が適切でない箇所、以前直した問題の再発、検証不足、報告と実態の不一致が発生した。既存の `self-critique.agent.md` は存在したが、完了前に必ず実行される具体的なゲート手順として十分に機能していなかった。
- **根本原因**: 「批判する」という方針はあったが、要件照合・差分確認・回帰防止・Lessons Learned 更新・README 同期・検証証拠を毎回確認する標準手順がスキル化されていなかった。
- **対策**: `.github/skills/self-critique-gate/SKILL.md` を追加し、全タスク完了前に実行する必須ゲートとして定義した。ユーザーから品質フィードバックを受けた場合は、実装修正だけでなく Lessons Learned と再発防止ルールを更新してから完了報告する。
- **教訓**: 品質ゲートは「気をつける」では再現性がない。毎回使うチェック項目・失敗時の修正ループ・PASS 条件をスキルとして明文化し、完了報告前の必須手順にする。

### LL-005: ペルソナ回遊監査の統括役を新設しそうになり、既存 UCFitnessAgent との責務重複が発生した

- **事象**: ペルソナユーザーを模した回遊監査エージェント群を追加する際、独立した `persona-journey-orchestrator.agent.md` を作成し、既存の `UCFitnessAgent` とオーケストレーター責務が重複しかけた。
- **根本原因**: 既存エージェント構成の Layer 1 オーケストレーターを再確認する前に、新しい統括エージェントを追加した。結果として、組織図・自動選択・完了ゲートの責務が分散するリスクがあった。
- **対策**: 独立オーケストレーターを削除し、既存の `UCFitnessAgent` に Persona Journey Review を統合した。ペルソナ別エージェントはサブエージェントとして追加し、統括・優先度付け・自己批判ゲート連携は UCFitnessAgent が担う。
- **教訓**: 新しい専門エージェント群を追加する場合、まず既存のオーケストレーターに統合できるかを確認する。UCFitness では Layer 1 統括は `UCFitnessAgent` に一本化し、同階層の統括エージェントを不用意に増やさない。

### LL-006: 100% 表示で UI が大きすぎ、LP が間延びした

- **事象**: root スケーリングを撤廃した後、ブラウザ倍率 100% でランディングページの見出し・ヒーロー・カード・余白が大きく、375px で全長 5541px、1280px で 2460px まで伸びた。ユーザーから「表示がデカすぎる」「もっと情報を凝縮して洗練してほしい」と指摘された。
- **根本原因**: 以前の 0.9x 表示に依存したサイズ感のまま、コンポーネント側のフォント・余白・カード高さ・モバイル用大型プレビューを調整しきれていなかった。root を縮小して解決する発想が残ると、スクロール不能や座標ずれの再発につながる。
- **対策**: root 縮小は禁止したまま、LP と主要ホーム部品のコンポーネント密度を調整した。モバイルでは大型プロダクトプレビューを非表示にし、競争/報酬インサイトを小型カード化。各セクションの `py`、`gap`、カード `p`、見出しサイズ、プレビューカード高さを縮小し、QuickActions / HomeHero もコンパクト化した。
- **教訓**: 100% 表示で大きすぎる問題は root スケールではなく、情報設計とコンポーネント密度で解決する。UI 変更後は `body.scrollHeight` と主要セクション高さを 375px / 1280px で測り、ファーストビューに価値・CTA・主要指標が過不足なく入るかを確認する。

### LL-007: LP評価時に SplashScreen をLP本体と誤認し、白いローダー余白を見落とした

- **事象**: ユーザーが提示したLPスクリーンショットは実際には `SplashScreen` の全面ローダーだった。白背景に小さなカードだけが中央表示され、画面の大部分が空白に見えるにもかかわらず、LP本体の改善完了として扱いかけた。
- **根本原因**: スクリーンショットがスプラッシュ/ローディング状態か、LP本体かを判定せずに評価した。さらに `SplashScreen` が未ログインLPにも表示され、ブランドLPより先に白いローダーが見える構造だった。
- **対策**: 未ログインLPでは `SplashScreen` を表示しないようにし、認証済みユーザーに限定した。LP/公開ページの視覚検証では、`sessionStorage.hasSeenSplash` の有無や画面テキストを確認し、ローダー状態と本体状態を分離して評価する。
- **教訓**: スクリーンショットレビューでは、まず「表示されているものが対象画面本体か、ローダー/スプラッシュ/エラー/リダイレクト途中か」を判定する。公開LPは初回表示でローダーを挟まず、即ブランド体験を見せることを優先する。

### LL-008: Route loading fallback を本体UIとして評価し、認証済みページの密度確認がぶれた

- **事象**: 認証済み分析ページの 375px 監査で、初期 0.3 秒時点の `loading.tsx` / 遷移ローダーだけを撮影し、ページ本体が空白に見える状態を課題として扱いかけた。
- **根本原因**: `page.goto(..., waitUntil: "commit")` 直後の短時間スクリーンショットを本体表示と混同した。さらに分析データを Client Component 内の `/api/user/analytics` fetch に依存していたため、本体表示までの待ち時間がページごとにぶれた。
- **対策**: 分析集計を `lib/services/analytics-service.ts` に切り出し、Server Component 側で先読みして `PersonalAnalytics` に渡すようにした。検証では 0.3 秒 / 1.8 秒 / 6 秒など複数時点の `document.body.innerText` と `body.scrollHeight` を確認し、ローディング状態と本体状態を分けて評価する。
- **教訓**: UI密度や「一目で見えるか」の判定は、対象ページ固有の見出し・主要指標が DOM に出ていることを確認してから行う。短時間ローダーは許容されても、白い全画面ローダーだけが長く見える構成は避け、可能な限り Server Component で初期データを先読みする。

### LL-009: OAuth再認可と接続状態の扱いで資格情報・データソースが不整合になる可能性があった

- **事象**: Google Health の再認可レスポンスに更新トークンがないと既存値を消失し、再認証待ち接続は「未接続」と誤認されFitbitへ暗黙切替する可能性があった。解除時のGoogle側失効と、暗号文のユーザー・用途拘束も不足していた。
- **根本原因**: 初回接続・再認可・再認証待ち・明示解除を同じ欠落値で表し、OAuthトークンと健康データソースのライフサイクルを状態機械として扱っていなかった。
- **対策**: 既存更新トークン保持、初回更新トークン必須化、全接続状態を返す同期選択、再認証待ちのFitbit切替抑止、Google失効要求、ユーザーID・プロバイダ・用途をAADへ含むAES-GCM v2を実装した。
- **教訓**: OAuth連携では欠落値を削除指示と解釈せず、`active` 行がないことを未接続と同一視しない。初回接続・再認可・失効・再認証待ち・明示解除を個別にテストする。

### LL-010: データソース移行を一回限りのバックフィルと部分upsertで扱うと履歴が混在する

- **事象**: マイグレーション後のFitbit新規ユーザーが本人照合テーブルへ追加されず、Google Healthが返さない日には既存Fitbit歩数が残る可能性があった。一時的なOAuth更新障害も恒久的な再認証待ちとして記録していた。
- **根本原因**: 認証IDの複製を初回バックフィルだけに依存し、データソース切替を「取得行だけのupsert」として実装した。OAuthエラーも再試行可能性で分類していなかった。
- **対策**: `users`更新を追従するFitbit接続トリガー、90日以内を削除＋挿入する原子的DB関数、`invalid_grant`／必須スコープ欠落だけを再認証扱いにする分類を追加した。
- **教訓**: 移行用テーブルは継続同期し、ソース切替は対象範囲を原子的に置換する。欠測と実測0歩を区別し、一時障害でユーザー操作が必要な状態へ遷移させない。

### LL-011: 1件の暗号文復号失敗が全ユーザー同期を停止する可能性があった

- **事象**: 全Google Health接続を `Promise.all` で復号していたため、鍵ローテーションや1行の暗号文破損で一括処理全体がrejectし、Fitbitを含む全ユーザーのCron同期が停止し得た。
- **根本原因**: バルク取得とユーザー単位の資格情報復号を同じ失敗境界に置き、部分失敗を隔離していなかった。
- **対策**: 行の解析・復号をユーザー単位で捕捉し、対象ユーザーの同期選択だけを `error` として返して他ユーザーの処理を継続した。暗号鍵設定不備と個別暗号文破損を安全に識別できないため、DB接続状態は変更しない。
- **教訓**: バルク同期ではDB取得全体の失敗と個別レコードの失敗を分ける。復号失敗をプロバイダ資格情報の失効と推測せず、不可逆な状態遷移は確認済みのエラー分類だけで行う。

### LL-012: 履歴置換を通常同期へ流用すると歩数とコインが巻き戻る可能性があった

- **事象**: Google Healthの日次応答が一時的に空または前回より小さい場合、当日行を削除・再挿入する実装により、保存済み歩数と再計算されるUCコインが減少し得た。手動同期のたびに過去1年の破壊的置換も繰り返していた。
- **根本原因**: 初回のデータソース移行に必要な「欠測日を含む権威的な期間置換」と、進行中の当日値を更新する「単調な増分同期」を同じDB関数で扱った。
- **対策**: `history_synced_at` で初回履歴移行を一度に限定し、当日は `upsert_daily_steps_max` で既存値と取得値の最大値を原子的に保存する。空応答では行を変更せず、コイン処理へ永続化後の歩数を渡す。
- **教訓**: 健康データ履歴のソース切替と当日ポーリングは異なる整合性モデルで扱う。破壊的置換を定常経路へ流用せず、ユーザー資産へ波及する派生処理には必ず確定済み永続値を使う。

### LL-013: 複数要求の履歴移行と並行同期で部分置換・所有権競合が起こり得た

- **事象**: 初回履歴をAPIチャンクごとにDBへ置換すると、途中のAPI失敗で履歴が部分更新になる。さらにCronと手動同期が重なると、解除後の古い処理が書き戻したり、別Google Health利用者の再接続データを混在させる可能性があった。
- **根本原因**: 外部APIの複数要求を一つのスナップショットとして扱わず、ユーザー単位の同期所有権とプロバイダID継続性をDB書き込み境界で検証していなかった。
- **対策**: 当日を除く365日分の全APIチャンク取得成功後に一度だけDBトランザクションで置換する。所有者UUID付き30分リースを導入し、履歴置換・当日upsert・完了記録で同じリースIDを検証する。再接続時は保存済みGoogle Health IDとの一致を必須にし、全ユーザー同期は固定並列バッチへ制限する。
- **教訓**: 複数要求にまたがる健康データ移行では、API取得完了前に権威データを変更しない。同期所有権・接続ID・DB書き込みを同じ整合性境界で検証し、派生報酬を含む処理全体をユーザー単位で直列化する。

### LL-014: OAuth解除と進行中同期の競合で接続が復活し得た

- **事象**: Google Health解除中に既存の同期処理がトークン更新や同期完了状態を書き戻すと、解除済み接続が再び `active` になり、消去した資格情報が復活し得た。Fitbit認証IDのミラートリガーも既存の切断・エラー状態を上書きする可能性があった。
- **根本原因**: 履歴置換と当日歩数だけを同期リースへ拘束し、トークン更新・再認証状態・同期完了時刻を同じ所有権境界に含めていなかった。解除も外部失効とローカル停止を別々に行い、その間に古い同期が書き込める設計だった。
- **対策**: 同期由来の全状態更新をリースID必須のDB関数へ移し、解除は対象行をロックして接続停止・リース無効化・資格情報消去を一つのトランザクションで先に確定する。Google側失効はその後に試行し、失敗してもローカル停止を巻き戻さない。Fitbitミラートリガーは既存状態を保持する。
- **教訓**: OAuth解除は外部API成功をローカル安全性の前提にしない。資格情報を扱う同期の全書き込みを同じDB所有権境界へ含め、解除トランザクションが古い所有者を失効させた後は一切の書き戻しを許可しない。

### LL-015: 不明な接続状態を未接続として扱うと暗黙フォールバックが再発する

- **事象**: Google Health機能フラグ停止時や一括取得した不正接続行の解析失敗時に接続選択が欠落し、Fitbitへ暗黙切替し得た。設定画面も状態取得失敗を「未接続」と表示していた。
- **根本原因**: 「接続なし」と「接続状態を確認できない」を同じ `null` で表し、フラグを新規接続制御ではなく既存接続の読取・同期にも適用していた。
- **対策**: 既存接続はフラグ停止中も取得・同期・解除し、不正行は `error` 選択として残す。設定UIに不明状態と再取得導線を追加した。
- **教訓**: 認証・健康データの不明状態は不在へ変換せず、安全側で旧ソース利用を遮断する。機能フラグの停止範囲を新規操作と既存資産管理で分ける。

### LL-016: メール一致によるOAuthアカウント統合は本人性を保証しない

- **事象**: Fitbitログイン時にプロバイダIDが見つからないと、同一メールの既存ユーザーへ自動リンクしてトークンを更新していた。セッション復旧にもメール照合が残っていた。
- **根本原因**: メールを連絡先ではなく外部認証の不変な本人識別子として扱い、プロバイダ間・アカウント変更時の衝突を考慮していなかった。
- **対策**: ログインとセッション復旧を `provider + provider_account_id` の一致に限定し、DB照会失敗時はdeny-by-defaultとした。`check:rules`で`lib/auth.ts`のメール一致クエリを禁止した。
- **教訓**: OAuthアカウントの自動リンクにメールを使わない。明示的な再認証・本人確認を伴う統合フローがない限り、識別子不一致は別アカウントとして扱う。

### LL-017: 取得値と同期成功を同一視すると歩数・通知・報酬が不整合になる

- **事象**: Fitbitの低い再取得値が保存済み歩数を上書きし、`steps: null`でも同期APIとトーストが成功を通知していた。Google Health解除後の履歴バックフィルも移行済み履歴を部分的に上書きし得た。
- **根本原因**: 外部APIの取得値、DB永続化後の確定値、同期処理の結果状態を分離していなかった。
- **対策**: Fitbit当日値もDBで単調増加させ、報酬へ永続化後の値を渡す。移行済みGoogle履歴は解除後のFitbit部分upsertから保護し、同期APIを5種類の結果コードへ分けた。
- **教訓**: UIへ返す成功は外部取得ではなく永続化完了を基準にする。データなし・再認証・競合・障害は成功と分け、派生報酬にはDBで確定した値だけを渡す。

### LL-018: OAuth・接続保存・旧ソース履歴の事前確認だけでは並行処理を防げない

- **事象**: OAuth stateがブラウザCookieとだけ結び付いていたため開始後のアカウント切替を検出できず、Google ID確認と保存の間、Fitbit履歴取得と保存の間にも接続状態が変わる競合窓があった。恒久的なGoogle資格情報失効も同期結果では利用不能へ丸められていた。
- **根本原因**: セキュリティ判断を開始時やアプリ側read-then-writeのスナップショットへ依存し、最終的な本人・ID・データソース権威をトークン交換前またはDB書き込みトランザクション内で再検証していなかった。
- **対策**: OAuth stateを開始ユーザーへHMAC拘束し、接続保存をユーザー行ロック付きRPCへ統合した。Fitbit履歴保存もDB内でGoogle Health権威を再確認し、恒久的なGoogle認証失敗は `reauthorization_required` として返す。
- **教訓**: 外部APIを挟む処理では事前チェックと書き込みの間に状態が変わる。本人性は副作用前、ID継続性とデータソース選択はDB書き込みと同じ原子的境界で検証し、確認済みの恒久エラーだけを再認証導線へ結び付ける。

### LL-019: 公開LPを暗色SaaS表現へ寄せ、フィットネスゲームの熱量を失った

- **事象**: 公開ランディングページが暗紺の全面ヒーロー、青紫のぼかし、半透明カード、大きな空白で構成され、ユーザーから「デザイン面が全く良くない」「無駄な余白が多い」「クールすぎてカラフルさがない」と指摘された。モバイルでは実際のプロダクトプレビューも非表示だった。
- **根本原因**: 認証済みプロダクト画面向けの「抑制・信頼感」を、ブランドを伝える公開 LP にも同じ強度で適用した。さらに `min-h-screen`、`flex-1`、大きい上余白で画面を埋めることを優先し、歩く・競う・報われる体験を意味色と実 UI で見せていなかった。
- **対策**: `components/LandingPage.tsx` を自然高さの明るい構成へ再設計し、青=目標、緑=達成、紫=競争、アンバー=報酬の意味色を追加した。375pxでも歩数リング、順位、UC、チャレンジを表示し、暗色全面ヒーロー、グラデーション文字、装飾目的の全面ガラス表現を除去した。`docs/PRODUCT.md` とデザイントークン仕様にも公開 LP の Full Palette 例外を固定した。
- **教訓**: 「プロ品質」は無彩色・暗色・余白の多さではない。公開ブランド面では、対象サービス固有の行動・競争・報酬を 3 秒で理解できる色とプロダクト UI が必要。認証済みアプリの Product register と公開 LP の Brand register を分けて評価する。

### LL-020: 公開LPの見た目改善だけではランドマーク・狭幅リフロー・報酬理解を保証できなかった

- **事象**: カラフルなLPへ再設計した後のペルソナ監査で、`header` / `footer` が `main` 内に入りランドマークとして認識されない、スキップリンクが実コンテンツを迂回しない、横スクロール列が320pxでクリップされる、`+22 UC` の獲得条件が分からない問題を検出した。
- **根本原因**: 視覚的な密度と配色を先に整え、アクセシビリティツリー、フォーカス移動、スクロールコンテナの intrinsic sizing、報酬ラベルの意味まで同じ設計契約として固定していなかった。特に横スクロールコンテナ自身の `min-w-max` が内容幅への拡張を招き、親側でクリップされていた。
- **対策**: `header` / `main` / `footer` を兄弟化し、スキップリンクを公開LPの実 `main` へ接続した。スクロールコンテナを `w-full min-w-0 overflow-x-auto` に変更し、複数行報酬カードはモバイルで縦リスト化した。基本報酬と追加報酬を分け、`+22 UC` と同じカードに「10,000歩達成で」と具体的な獲得閾値を明記した。コンパクトなプルーフ表示でも報酬条件を維持し、チップと数値の色を配列順ではなく競争・報酬の意味から決定する。局所横スクロールは320pxでも次カードを約40px見せ、見えている内容が装飾点にしか見えない場合は方向矢印も添える。
- **教訓**: 公開LPの品質はスクリーンショットだけで判定しない。AXランドマーク、最初のTabからのスキップ移動、320pxリフロー、横スクロールの到達性、指標の具体的な獲得閾値までを同時に検証し、数値だけで意味が伝わらない表示を出荷しない。情報を圧縮しても獲得条件と意味色は削らず、意味色を配列indexへ結び付けない。読み上げ説明だけに頼らず、視覚利用者にも次項目の存在を示す。

### LL-021: 保存済みMidnightテーマで公開LPの意味色コントラストが低下した

- **事象**: Classicテーマで公開LPの配色とアクセシビリティを確認した後、保存済みMidnightテーマでは達成・競争・報酬の `strong` 色が暗い `surface` 上で約2:1台となり、文字とアイコンが読みにくいことを最終自己批判で検出した。
- **根本原因**: 未認証の公開LPは常にデフォルトテーマで表示されると暗黙に仮定し、新設した `strong` / `soft` 意味色をMidnightテーマ側で上書きしていなかった。さらに `primary-solid` と `competition` を、淡い面上の前景色と白文字付き塗り面の両方へ流用していた。`ThemeProvider` はログイン状態に関係なく保存テーマを復元する。
- **対策**: Midnightテーマへ達成・競争・報酬・楽しさの明色 `strong` と低濃度 `soft` を対で定義し、主色と競争色には前景用 `strong` と塗り面用 `solid` を分離した。装飾のハードコード色も報酬トークンへ置換し、公開LPの検証対象にClassicとMidnightの375px / 1280pxを追加した。
- **教訓**: 新しいセマンティックトークンはデフォルト値だけでは完了しない。永続化される全テーマへの継承を確認し、暗色テーマでは文字色と背景色を一組で設計・実測する。1つの色トークンを前景と塗り面へ兼用しない。

### LL-022: サーバー正常でも検証用ブラウザ状態がユーザーのローカル閲覧を妨げた

- **事象**: ポート3000のLISTEN、HTTP 200、Chrome DevTools側のDOM描画を確認して「ローカルで見られる」と案内したが、ユーザー画面にはターミナルと計画パネルしかなく、検証タブは `Unshared browser tab` だった。サーバーを再起動しても見えず、macOSの通常ブラウザでURLを開いた後にユーザーが閲覧できた。
- **根本原因**: MCPの自動検証ブラウザとユーザーが操作する通常ブラウザを同一視した。自動検証タブの前面化・スクリーンショットは検証環境内だけで完結し、ユーザー画面への共有を保証しない。
- **対策**: LISTENとHTTP 200を確認した後、`open 'http://localhost:3000/'` で通常ブラウザを明示的に起動する。`osascript`で前面アプリを確認し、ユーザーの閲覧確認が得られるまで「見られる状態」と報告しない。自動検証タブの1280×800復元はブラウザ監査の後片付けとして別途維持する。
- **教訓**: 「サーバーが動く」「自動検証タブにDOMがある」「ユーザーが実際に見られる」は3つの異なる完了条件。ローカル閲覧の提供には、通常ブラウザを開いてユーザーへ渡す操作まで含める。

### LL-023: カラフル化後の公開LPで同時情報量が増え、動きとの優先順位が曖昧になった

- **事象**: 公開LPの明るい方向性は承認された一方、ヒーローに説明、CTA、再開導線、3ハイライト、歩数・順位・UC・チャレンジ、信頼項目を集め、直後に4指標を並べたため「表示領域に対する情報量が多すぎる」「もっとサイトに動きが欲しい」と指摘された。
- **根本原因**: 前回の「空白を減らしプロダクト情報を見せる」という要件を、同時表示数の増加として解釈した。色、カード、数値を増やした一方、何を先に理解させるかと、どの状態変化を動きで伝えるかを設計契約にしていなかった。
- **対策**: ヒーローをCTAと今日の歩数・残り歩数の1つの進捗面へ集中し、順位差・UCは直後のプルーフ領域へ分離した。重複する3ハイライトと4指標を2つの副指標へ整理し、後続情報をスクロール順へ再配置した。歩数リング、進捗、順位バー、報酬、スクロール進捗へ役割別のCSSモーションを追加し、`@supports`と`prefers-reduced-motion`で安全に段階適用した。
- **教訓**: 「余白を減らす」と「一度に多く見せる」は同義ではない。公開LPは一画面一メッセージを守り、具体的プロダクト情報は残したまま、重複を統合して表示タイミングを分ける。動きは装飾ではなく状態変化の意味へ結び付ける。

### LL-024: 横方向の切り抜き用overflowがstickyヘッダーを無効化した

- **事象**: 公開LPのヘッダーへ `sticky top-0` を指定していたが、375pxのスクロール区間スクリーンショットではヘッダーが上端に残らなかった。
- **根本原因**: `body` の `overflow-x: hidden; overflow-y: auto` が内容高さを持つ非スクロール祖先を作った一方、実際のスクロール要素は `html` だった。stickyヘッダーはbodyを参照するためviewportへ追従しなかった。公開LPラッパーの横切り抜きも同じリスクを持っていた。
- **対策**: 公開LPラッパーだけを `overflow-x-clip` とし、ヘッダーはページ内で `fixed` に切り替えて同じラッパーへヘッダー高のpaddingを確保した。App Shell全体の `html/body` overflowは変更せず、スクロール後のヘッダー座標と本文先頭の重なりを実測する。
- **教訓**: 横はみ出し対策として `overflow-x-hidden` をsticky祖先へ機械的に付けない。同時に、1ページのsticky修正をグローバルroot scroll変更で解決しない。ページ内の切り抜き、ヘッダー位置、本文offsetを同じコンポーネントへ局所化する。

### LL-025: テキストの入場opacityが途中フレームのコントラストを低下させた

- **事象**: 公開LPの最終配色はAA基準を満たしていたが、Lighthouseでスクロール表示中の説明文と報酬ラベルが4.28:1、4.1:1となり、アクセシビリティスコアが96に低下した。
- **根本原因**: テキストを含む親要素へ `opacity: 0.88`〜`0.9` の入場アニメーションを適用し、前景色が背景と合成されて中間フレームだけコントラスト不足になった。
- **対策**: ヒーロー、スクロール表示、報酬到達のキーフレームからopacity変更を削除し、transform・SVG描画・独立した装飾レイヤーだけで動きを表現した。
- **教訓**: コントラストは完成状態だけでなくアニメーション全フレームの契約である。読めるテキストを含む要素のopacityを1未満へ下げず、Lighthouse等は動作途中も対象にして再実行する。

### LL-026: 単一カードへ副指標を統合してもモバイルの次アクションがfold下へ逃げた

- **事象**: ヒーローを1つの進捗カードへ統合した後も、375pxでは順位とUCを残り歩数より先に表示したため、「あと何歩」がファーストビュー下端へ見切れた。装飾オービットとカード浮遊も歩数リング・進捗と同時に動き、行動判断より装飾が先行した。
- **根本原因**: カード数だけを密度指標にし、カード内部の情報順序と同時モーション数を測っていなかった。「副指標を小さく残す」を、モバイルのfold内に残す必要があると誤解した。
- **対策**: モバイルのヒーローは現在歩数→残り歩数→進捗へ並べ、順位とUCは直後のプルーフ領域へ移した。補足コピーと信頼項目は `sm` 以上へ送り、モバイルの無限オービットとカード浮遊を停止した。横スキャン領域には読み上げ用の名前と操作説明を追加した。
- **教訓**: 一画面一メッセージはカード数ではなく、fold内で同時に判断させる内容と動きの数で検証する。375pxでは「次に何をするか」を最初に完結させ、副指標は消さずに次のスクロール区間へ送る。

### LL-027: モバイルの密度削減で補助情報を内容ごと非表示にした

- **事象**: 公開LPの情報密度を下げる際、信頼項目と「続ける理由」セクションを `hidden sm:block` でモバイルから除外し、320〜375pxでは視覚・アクセシビリティツリーの両方から情報が消えた。
- **根本原因**: 「一画面に同時表示しない」を「狭幅では内容を提供しない」と取り違え、段階的提示とコンテンツ削除を区別していなかった。
- **対策**: モバイルでは補助情報を名前付きのネイティブ `<details>` にまとめ、閉じた状態は44pxの要約、開けば3つの利点と信頼項目すべてを読める構造にした。デスクトップの常時表示は維持した。
- **教訓**: 情報密度は削除ではなく優先順位と開示タイミングで調整する。WCAG 1.4.10の狭幅監査では、デスクトップだけに存在する情報がないかAXツリーと可視状態の両方で確認する。

### LL-028: LPのsticky修正でグローバルroot scroll契約を変更しかけた

- **事象**: 公開LPのstickyヘッダーを成立させるため `body` を `overflow-x: clip; overflow-y: visible` へ変更したところ、既存モーダルが使う `document.body.style.overflow = "hidden"` だけではroot scrollerの `html` を停止できないことを最終監査で検出した。
- **根本原因**: 1ページの表示問題を、認証済み画面を含む全ルートのスクロール契約変更で解決した。LPのsticky確認は通ったが、モーダルの背景スクロールロックまで影響範囲へ含めていなかった。
- **対策**: グローバルbody overflow変更を撤回し、公開LPのヘッダーを `fixed` + ページラッパーのヘッダー高paddingへ局所化した。指標重複と汎用入場モーションも同じ最終ゲートで除去した。
- **教訓**: `html/body` のoverflowはApp Shell・fixed UI・モーダルロックが共有する基盤である。ページ固有のsticky問題では変更せず、変更が不可避な場合はbodyとhtmlの両方を扱う共通スクロールロックへ全利用箇所を移行してから実施する。

### LL-029: 固定ヘッダー導入後のフォーカス移動と局所スクロール契約が不足した

- **事象**: 公開LPの最終キーボード監査で、スキップリンク移動後に固定ヘッダーがヒーロー先頭を覆い、モバイルの横スクロール指標はブラウザ暗黙フォーカスへ依存してMidnightの既定リングが3:1未満だった。ページ内アンカー先の一部は節内全文がアクセシブル名になった。
- **根本原因**: 通常スクロール時のヘッダー位置だけを確認し、フォーカス移動が発生させるスクロール位置、実際にスクロールする幅だけのタブ停止、フォーカス時の非テキストコントラスト、アンカー先regionの名前を同じ契約で検証していなかった。
- **対策**: `main` へヘッダー高と一致する `scroll-margin-top` を付与した。横スクロール指標はモバイル版だけを `tabIndex={0}` + 明示リング付きにし、デスクトップ版は非フォーカスの別表示へ分離した。アンカー先sectionは見出しを `aria-labelledby` で参照する。
- **教訓**: 固定ヘッダーの完了条件には、スキップ・アンカー移動後の対象上端がヘッダー下端以上である実測を含める。局所スクロール領域は「操作可能な幅だけフォーカス可能」「全テーマで3:1以上のフォーカス」「簡潔な名前」を同時に満たす。リファレンス: `components/LandingPage.tsx`

### LL-030: 640px境界で詳細だけが展開され、LPの情報密度が急増した

- **事象**: 最終自己批判で、公開LPの幅を639pxから640pxへ広げると、ページ高が約1,000px増えた。特に利点セクションはコンパクトな開示から、1カラムの詳細3件へ切り替わり大幅に縦長化した。
- **根本原因**: 詳細表示を `sm` から開始した一方、3カラム化は `md` からだった。表示情報量の切替と、その情報を横へ分散するレイアウト切替を別のブレイクポイントにしたため、640〜767pxだけ密度が悪化した。
- **対策**: 利点セクションの開示版と常時表示版の切替を、当初は`lg`へ揃えた。Sidebar後の実コンテンツ幅を再監査した2026-07-13以降は`xl`を正本とし、1280pxで主要2カラム構成と3カラム化を同時に表示する。プルーフ項目は狭幅で確実に局所overflowするintrinsic幅と折り返し可能なラベルを使い、不要なJS状態を追加せずフォーカス契約を維持する。
- **教訓**: レスポンシブ変更は代表幅だけでなく、各ブレイクポイントの1px手前と境界値を比較する。説明文の可視化、カード形状、カラム数を一体で設計し、1カラムのまま情報量だけを増やさない。リファレンス: `components/LandingPage.tsx`

### LL-031: 開発CSPがSafariのlocalhost CSSをHTTPSへ変換した

- **事象**: `localhost:3000` はHTTP 200を返していたが、Safariではスキップリンクと巨大なSVGだけが表示され、Tailwindを含むCSSが一切適用されなかった。
- **根本原因**: `next.config.ts` が開発環境にも `upgrade-insecure-requests` を送信していた。Safariは相対URLの `/_next/static/css/...` もHTTPSへ変換するため、HTTPだけを提供するNext.js開発サーバーへのCSS取得がTLSエラーになった。
- **対策**: `upgrade-insecure-requests` を本番環境だけのCSPディレクティブに変更した。開発環境ではCSSをHTTPで配信し、本番のHTTPS強制は維持する。サーバー再起動後に開発CSP、CSSのHTTP 200、Safariの実表示を確認する。
- **教訓**: セキュリティヘッダーは本番とローカル開発の通信条件を分離する。ルートHTMLの200だけでは描画成功を保証しないため、通常ブラウザのCSS適用と主要アセット取得までをローカル表示の完了条件にする。リファレンス: `next.config.ts`

### LL-032: unlayeredなFooter非表示規則がホームのデスクトップFooterを覆い隠した

- **事象**: 認証済み共通シェルの`.uc-auth-content :where(footer) { display: none; }`がTailwindの`hidden md:block`より優先され、ホームで意図したデスクトップFooterも常に非表示になった。
- **根本原因**: グローバルCSSのunlayered規則がTailwind utility layerより高いカスケード優先度を持つことを、例外として追加したFooterまで含めて確認していなかった。
- **対策**: 当初は全認証ページ向け非表示を維持し、ホームだけを768px以上でopt-in表示した。2026-07-13の法務導線監査でこの契約を失効し、現在は全認証ページで320pxからFooterを表示する。BottomNavのsafe-area予約後に法務リンクへ到達できることを実測する。
- **教訓**: unlayeredグローバルCSSがTailwind utilityを覆う領域へ例外を追加する場合はcomputed `display`を全幅で実測する。法務Footerはモバイルで非表示にせず、BottomNavと共存させる。

### LL-033: 固定ボトムナビのsafe-area分を本文余白へ加算していなかった

- **事象**: モバイル共通App Shellの下余白が`pb-16`固定だった一方、固定ボトムナビは64px本体に`safe-area-inset-bottom`を加えていたため、ホームインジケータのある端末で最下部コンテンツがナビ背面へ隠れる可能性があった。
- **根本原因**: 固定ナビ自身のsafe-area対応だけを確認し、スクロール本文が予約する高さとの対称性を検証していなかった。
- **対策**: 認証済みApp Shellのモバイル下余白を`calc(4rem + env(safe-area-inset-bottom, 0px))`へ変更し、`sm`以上では既存どおり解除した。
- **教訓**: 固定下部UIの高さ契約は「本体高 + safe-area」をオーバーレイ側と本文側で共有する。実機値が0のデスクトップ検証だけで完了せず、CSS計算値と最下部CTAの到達性を確認する。リファレンス: `app/[locale]/layout.tsx`, `components/layout/BottomNavBar.tsx`

### LL-034: 認証後UIの品質ルールが個別に存在しても、画面全体の出荷判定へ統合されていなかった

- **事象**: Footer下端、PC密度、ヘッダー内アバター/通知バッジ、ロゴの色、パネルの押下可否、mobile app safe-areaについて既存ルールは部分的に存在したが、実画面ではFooter下184pxの空白、44pxヘッダーから48pxアバターと通知バッジがはみ出す状態、モノクロmark、静的カードとlink cardの判別不足が残った。
- **根本原因**: 「44px」「意味色」「Footerに`mt-auto`」を個別classの有無だけで確認し、親子のbounding rect、viewport内Footer位置、first viewportの情報量、hover/focus/active/chevronの組を同じ完了ゲートで測っていなかった。
- **対策**: 認証後ホームを`min-h-dvh` + Footer wrapper `mt-auto`へ整理し、header visual 32px、badge内包、多色brand mark、interactive panel契約、PWA top/bottom safe-area、1440px home canvas + 2段action rowを実装した。通知バッジは白文字付き塗り面専用の`--color-danger-solid`へ分離し、Classic/Midnightの両方で4.5:1以上を実測する。UCFitnessAgentとself-critique-gateへ同じ実測項目を追加した。
- **教訓**: UI品質はルール数ではなく、最終画面の幾何・意味・操作状態を同時に測るゲートで担保する。暗色テーマの明るいdanger前景色を白文字付き背景へ流用しない。リファレンス: `app/[locale]/page.tsx`, `app/globals.css`, `components/layout/UserMenu.tsx`, `components/layout/NotificationBell.tsx`

### LL-035: 認証後ホームのDB取得失敗を0歩・未集計・未設定へ変換していた

- **事象**: `users` / `daily_steps` / rankingの取得失敗時にエラーを確認せず、0歩・同期待ち・順位未集計・`/setup`リダイレクトとして表示し得た。低活動ユーザーには自分の失敗のように見え、既知DBブロッカーも隠れた。
- **根本原因**: データなしと取得失敗を同じnull/空配列へ正規化し、ranking serviceも失敗時に空mapを返していた。
- **対策**: ホームの各結果で`.error`を確認し、ranking serviceは失敗をthrowして呼び出し側へ伝播する。いずれかが失敗した場合は歩数・順位カードを描画せず、明示エラーと再試行だけを表示する。
- **教訓**: 健康データUIでは「0」と「取得不能」は別状態。エラーを成功形の既定値へ変換せず、ユーザーを責めない明示状態として表示する。リファレンス: `app/[locale]/page.tsx`, `lib/services/ranking-service.ts`

### LL-036: rootの`overflow-y:auto`がsticky headerを追従不能にした

- **事象**: headerに`sticky top-0`があっても、375pxで500pxスクロール後のheader topが-500pxとなり追従しなかった。
- **根本原因**: `body { overflow-y:auto }`がstickyのスクロール祖先になった一方、実際のscrollTopは`documentElement`へ付いており、参照するスクロール座標が分離した。
- **対策**: `html/body`の横切り抜きを`overflow-x:clip`、縦を`overflow-y:visible`へ変更し、viewport自然スクロールへ戻した。修正後は同条件でheader top=0を確認した。
- **教訓**: rootの横overflow対策でscroll containerを作らない。sticky確認はclassの存在ではなく、実スクロール後の`getBoundingClientRect().top`で判定する。リファレンス: `app/globals.css`

### LL-037: 余白を再配置しただけで、ダッシュボードの情報量を増やしていなかった

- **事象**: Footer・header・bento配置は改善したが、表示している実データの種類は変わらず、ユーザーから「スカスカで全然リッチではない」と再指摘された。
- **根本原因**: リッチさをカード配置・幅・色・アフォーダンスの問題として扱い、時系列や蓄積値などダッシュボード固有の情報価値を追加していなかった。
- **対策**: `daily_steps`をランキングと同じ月曜起算の今週で取得し、欠測・0歩・未来日を区別したbar visualizationを追加した。`coin_balances`からUC残高・活動ストリークも独立状態として追加し、失敗時は数値を隠して明示エラーとする。
- **教訓**: Product dashboardのリッチさは装飾量ではなく、意思決定に使える実データの密度で作る。リファレンス: `app/[locale]/page.tsx`

### LL-038: 個人トレンドだけでは競争・社会性のあるホームにならなかった

- **事象**: 今週歩数とUC残高を追加しても、ユーザーからランキングの一部・フレンド活動・より凝った動的パネルが必要と指摘された。
- **根本原因**: UCFitnessの価値を個人の進捗と報酬に限定し、競争の現在地と仲間の動きを別ページへ追い出していた。
- **対策**: 既取得ranking mapから固定5行と自分の順位を描画し、既存following APIから仲間の今日歩数・固定目標bar・プロフィール導線を追加した。API障害・歩数未記録・実際の0歩を分離し、0件でもパネルを消さず発見CTAを表示する。低活動ユーザーの比較圧を抑えるため、次行動を詳細なランキング・仲間パネルより前に置き、仲間パネルは順位番号や他者最大値との相対barではなく活動パルスとして表現する。
- **教訓**: Fitness gameの社会性は比較量を増やすことではない。「自分」「競争」「報酬」「次行動」を先に理解できた後で「仲間」を任意に探索できる循環にする。リファレンス: `app/[locale]/page.tsx`, `components/dashboard/DashboardFollowing.tsx`

### LL-039: ホーム中心の監査を全ページ改善と誤認した

- **事象**: 共通App Shellとホームを繰り返し改善した一方、ユーザーから「ホームだけでなく他ページも見直したか」「徹底的に全ページを見直して」と指摘された。個別ページには、障害を空状態へ変換する処理、未統一Dialog、低コントラスト、英語固定文言、チャート代替不足、GROUPランキング認可漏れが残っていた。
- **根本原因**: 共通Shellが反映されたことを個別ページ品質の代理指標にし、ページ台帳と機能群別の完了判定を持っていなかった。スクリーンショット中心で、DB/API障害、0歩/欠測、非メンバー、保存中、Forced Colors等の状態を横断していなかった。
- **対策**: 17ルートを共通Shell・競争・アカウント・商取引へ分け、静的監査、実ブラウザ、5ペルソナ、独立コードレビューを反復した。共通Dialog stack、SSR有効なskip target、共有URL allowlist、GROUP membership認可、0歩/MTD分析、装備テーマ初期値、チャート数値表を実装した。
- **教訓**: 「全ページ」はページ数ではなく、各ルートの正常・空・エラー・権限・狭幅・キーボード状態を埋めたcoverage matrixで判定する。ホームが良くても他ページの未監査を完了扱いしない。

### LL-040: 共通Shellの存在だけではページタイトルが統一されなかった

- **事象**: 全ページ監査後も、認証ページごとにブランド見出し、ページ見出し、パンくず、装飾線、文字サイズが別実装のまま残り、ユーザーから不統一を再指摘された。
- **根本原因**: ヘッダー右側の操作群だけを共通契約にし、ブランドとページ導入部を再利用コンポーネントへ集約していなかった。広域CSSで見た目を近づけたため、見出し階層も実装差も残った。
- **対策**: `AppBrandMark`、`AuthenticatedPageHeader`、`PageIntro`へ集約し、標準認証ページを移行した。ブランドは見出しから外し、`PageIntro`をページ唯一の`h1`とした。
- **教訓**: ページ統一はCSSの類似ではなく、同じ構造コンポーネントと見出し契約で判定する。リファレンス: `components/layout/AuthenticatedPageHeader.tsx`, `components/layout/PageIntro.tsx`

### LL-041: 二段リダイレクトと全画面ローダーがプロフィールを覆い続けた

- **事象**: App Shellのプロフィール導線が`/profile`から`/user/{username}`へ再リダイレクトし、独自`GlobalLoader`が遷移完了を検出できない場合に全画面オーバーレイが残り、プロフィールが何も表示されないように見えた。
- **根本原因**: canonical URLへ直接リンクせず、pathname変化を成功条件とするグローバルローダーを全ルートへ重ねていた。
- **対策**: BottomNav/Sidebarをcanonicalプロフィールへ直接接続し、layoutの`GlobalLoader`を撤去した。プロフィールroute固有の`loading.tsx`で形状を保つスケルトンを表示する。
- **教訓**: リダイレクト経路をナビゲーションの通常導線にしない。ローディングUIはroute境界へ局所化し、エラーやURL不変で本文を永久に覆わない。

### LL-042: Serverとブラウザの現在日差でプロフィールが水和不一致になり得た

- **事象**: `ActivityGraph`が初期描画で`new Date()`を使い、Edge側UTCとブラウザ側JSTで曜日・今日判定・月ラベルが異なる時刻帯にプロフィールDOMが不一致になり得た。バッジbutton内の不正DOMも水和警告候補だった。
- **根本原因**: 同じ健康データでも「今日」を各実行環境で再計算し、日付を描画入力として固定していなかった。
- **対策**: Server Componentで確定したJSTの`YYYY-MM-DD`を`ActivityGraph`へ渡し、UTC固定演算で表示配列を生成した。不正なbutton入れ子も有効なoverlay button構造へ修正した。
- **教訓**: Server/Client共通の可視日付は文字列入力へ固定し、裸の現在時刻から初期DOMを作らない。水和問題はデータ取得成功だけでは否定できない。

### LL-043: Sidebar出現と多列化を同じ1024px境界に置くと本文が過圧縮された

- **事象**: 1023pxから1024pxへ広げるとSidebarと3〜4列レイアウトが同時に出現し、HomeHeroが975pxから204px、Groupsカードが482pxから202pxへ縮小した。公開LPもh1が2行から4行へ悪化した。
- **根本原因**: viewport幅だけで`lg`を判断し、Sidebarを差し引いた実コンテンツ幅を設計入力にしていなかった。情報開示・Sidebar・多列化を同じ境界へ集中させた。
- **対策**: Sidebarは`lg`で維持し、複雑な多列化とLP詳細展開を`xl`へ遅らせた。1024pxではHome/Groups/Settingsを単列または2列、Shopを3列にし、1280pxで詳細構成へ移行した。
- **教訓**: レスポンシブ設計はviewportではなく利用可能なcontainer幅で判断する。1023/1024と1279/1280を対で測り、広げた瞬間にカード幅・見出し行数・ページ高が悪化する境界を出荷しない。

### LL-044: `sr-only`をtable本体へ付けると不可視表がページ高へ残った

- **事象**: Profileの年間歩数代替表が不可視にもかかわらず約4,704pxのtable boxを持ち、Footer後に約3,000pxの空白を作った。
- **根本原因**: semantic table本体へ`sr-only`を直接付け、table固有のintrinsic layoutが1×1px制約を超えて残るブラウザ挙動を考慮していなかった。
- **対策**: tableをabsolute 1×1pxの`sr-only` wrapperで包み、表構造・caption・thを維持したまま文書フローから確実に除外した。
- **教訓**: アクセシブル代替はAX treeだけでなくlayout geometryも監査する。不可視要素の`getBoundingClientRect()`とFooter後の残余高を320/1024pxで確認する。
- **追加教訓**: 通常状態の44px検査だけでは編集ボタン・Retry・画面外カルーセルfocusを見逃す。編集・エラー状態を開き、画面外リンクはfocus時に表示領域へ移動させる。

### LL-045: 実データを増やしても同じカード文法ではホームが面白くならなかった

- **事象**: 週間歩数、UC残高、固定5行ランキング、仲間アクティビティを追加しても、ユーザーから「ホーム画面がシンプルすぎて面白みがない」と再指摘された。
- **根本原因**: 実データは増えたが、白い角丸カード・薄い枠・小アイコンを同じ強さで反復し、進捗・競争・報酬・次行動の因果が分断されていた。0歩や空き順位も同じ見た目で反復し、低活動時に空虚さを強めた。
- **対策**: `HomeHero`をQuest面へ再構成し、進捗→ライバル→歩いた価値→次の一歩を連結した。Mission→Weekly→Reward→Challengeの後を任意探索章（Utility→Friend→Ranking）として明示し、Utility Dockの重複排除、未来志向の0歩表現、未記録・記録済み0歩・参加済みで異なる固定5行コピー、状態別650ms以下のCSS反応を追加した。Sidebar後の1280pxでは4列を使わず、1536px以上だけ4列化する。Mission GETを参照専用化し、再試行中はloadingへ戻して準備POSTとの競合を防ぐ。POSTの報酬書き込み失敗は非成功応答、成功時はlive通知・見出しfocus・永続報酬表示とした。補助ストリーク障害は`null`+明示フラグへ分離し、Challenge進捗取得失敗も0%へ変換しない。
- **教訓**: Product dashboardのDelightは装飾量ではなく、実データの変化が感情的な手応えへつながる順序と反応で作る。カードを増やす前に因果・重複・状態変化を設計し、レスポンシブ列数とコピーを実コンテナ幅・ユーザー状態で検証する。時間制限motionだけに成功情報を委ねず、状態遷移後のfocusとlive通知も同じ契約にする。リファレンス: `components/dashboard/HomeHero.tsx`, `components/dashboard/DailyMissions.tsx`, `components/dashboard/DashboardChallenges.tsx`, `app/[locale]/page.tsx`, `app/api/user/missions/route.ts`

### LL-046: 同一行パネルの下端が揃わず、グラフがパネル内で小さく見えた

- **事象**: Homeの4モジュールが1920pxで最大126pxの高さ差を持ち、Home週間グラフはパネル高の約39%、プロフィール活動グラフは約51〜57%しか占有していなかった。
- **根本原因**: Home gridへ`items-start`を指定して行内stretchを無効化し、グラフ高をviewport breakpointの固定値だけで決めていた。Weeklyだけモバイルの角丸・paddingも他パネルと異なっていた。
- **対策**: 複数列時だけ同一grid行を等高化し、Home 4モジュールの`rounded-2xl`/`p-3`を統一した。Home/ProfileグラフへBaseline 2023のcontainer queryを適用し、パネル自身の幅に応じてプロット領域を拡大した。プロフィールグラフは値ラベルの上端余白と端clamp、視覚層の`aria-hidden`、非表示スクロール領域のTab除外、Forced Colors境界も同時に修正した。
- **教訓**: パネル統一は全画面固定高ではなく「同一行・同一役割」の幾何で判断する。等高化で増えた高さはグラフや実データへ配分し、空白スペーサーで埋めない。グラフ拡大時はplot寸法だけでなく、ラベルclip・代替表との二重読み上げ・非テキストコントラストを再監査する。リファレンス: `app/[locale]/page.tsx`, `components/ActivityGraph.tsx`, `app/globals.css`

### LL-047: 複合カラムと隣接ランキングの下端差を意図的差として見逃した

- **事象**: Home任意探索の左カラム（QuickActions+Following）と右の週間ランキングに26〜32pxの下端差があり、ユーザーからデザイン性不足を再指摘された。
- **根本原因**: 左右が異なる内部構造であることを理由に`items-start`を意図的と判断し、同じ視覚行としての下端整列を完了条件に含めなかった。
- **対策**: `xl`以上で社会gridをstretchし、左stackを右パネル高へ合わせた。friend activityは実ユーザー＋発見行を常に5行にし、余剰高を`auto-rows-fr`で均等配分した。長名行へ`min-w-0`/`w-full`を明示し、リンク内アバターは装飾扱いにした。8主要routeの同一行候補をgeometry走査し、実利用中Leaderboardは既存stretchを維持した。
- **教訓**: 内部構造が異なっても、同じ視覚行に置かれた主要パネルはユーザーが同格として比較する。ユーザーが下端整列を求めた場合は、独立カラムという実装都合より外形の下端差1px以内を優先する。ただし少数データ時に1行へ余剰を集中させず、意味ある発見行で一定行数を保つ。リファレンス: `app/[locale]/page.tsx`, `components/dashboard/DashboardFollowing.tsx`

### LL-048: 下端を揃えても社会パネルと詳細ランキングが平板に見えた

- **事象**: Home任意探索の下端整列・固定5行・実データ追加後も、ユーザーからFollowing等が「のっぺり」、詳細ランキングは「サイズ感がおかしく面白みがない」と再指摘された。
- **根本原因**: QuickActionsをFollowingの上へ積んだことで固定ショートカットが動的社会データより先に見え、FollowingとRankingを直接比較できなかった。Followingは全行が白面・同じ重さで、実目標や活動集計を使っていなかった。詳細ランキングはSidebar出現と外側5:7分割を`lg`で同時適用し、さらにGroup内を5:7分割して1024/1280pxで過密化した。順位差も相手名・総参加者数・トップ差を欠いた。
- **対策**: QuickActionsを独立Dockへ移し、Followingと週間Rankingをxlで直接同一行にした。Followingは個別目標、正歩数の活動人数、合計歩数、達成人数でPulse化し、0歩を活動人数から除外する。詳細Rankingは外側多列化を`2xl`へ遅らせ、固定行外のCompetition Missionへ現在順位・正歩数参加者数・次ライバル名・必要歩数・トップ差を集約する。各scopeは`Promise.allSettled`で障害分離し、非トップの実進捗は99%以下、最低視覚幅と`aria-valuenow`を分ける。
- **教訓**: 外形整列だけではDelightにならない。固定ショートカットより変化する実データを先に読み取れる構造にし、同じ5行でも達成・進行・未記録の意味差を面と色で示す。Sidebar後に二重多列化するコンポーネントはviewportではなく最深部の実列幅で判断し、競争UIは順位数字だけでなく「誰へ・あと何歩・何人中」を3秒で理解できる行外ミッションを持つ。リファレンス: `app/[locale]/page.tsx`, `DashboardFollowing.tsx`, `DynamicLeaderboard.tsx`, `GroupRankingPanel.tsx`

### LL-049: チャレンジ作成が継続行動より先に見え、期限と高目標が復帰を圧迫した

- **事象**: Challengesページで作成ボタンが一覧より先にあり、参加中・期限・残り歩数・報酬がAPI順のカードへ分散していた。低活動復帰ユーザーは高い残り総量と🔥報酬を先に見て、達成可能な次行動を判断できなかった。
- **根本原因**: チャレンジを作成/閲覧リソースとして並べ、継続ユーザーの主ジョブ「参加中の未達成を少し進める」を優先度計算へ入れていなかった。進捗`undefined`を0へ変換し、一覧/カード/参加APIでUTC・端末ローカル・JSTが混在した。タブ変更中の旧参加操作も古いtabを再取得できた。
- **対策**: 参加中・active・開始済み・未終了・未達成・進捗取得済みだけを優先帯候補にし、残り歩数→期限→報酬で並べる。主表示は残り総量ではなく最大500歩の次アクション、🔥は残り3日以内だけに限定する。作成ボタンは一覧後の補助導線へ移す。期限計算と一覧/参加APIをJSTへ統一し、null/undefinedは取得不能として0へ落とさない。list/progress取得はAbortController+request generation、参加/離脱後はmounted refと最新tab refで再取得する。
- **教訓**: リテンション面では「作れるもの」より「今続けているもの」を先にする。期限・報酬は圧力ではなく補足であり、低活動時の主CTAは100〜500歩の達成可能な入口にする。状態を跨ぐ非同期操作は開始時tabのclosureではなく最新refへ戻し、期限の同一判定関数を表示・ソート・最終API認可まで共有する。リファレンス: `challenge-utils.ts`, `ChallengeList.tsx`, `ChallengeCard.tsx`, `ChallengesPageClient.tsx`

### LL-050: 初回セットアップがプロフィール保存で終わり、歩き始める理由を作れていなかった

- **事象**: 新規ユーザーは表示名とユーザーIDを保存すると即ホームへ移動し、歩数ソース、日次目標、最初に達成する行動を確認できなかった。
- **根本原因**: セットアップをアカウント必須項目の補完として設計し、UCFitnessの価値ループ「歩く→競う→報われる」へ接続するActivation面として扱っていなかった。Status APIもDB障害を未設定へ見せ、目標と接続元を返していなかった。入力は42pxで、usernameのHTML `pattern`も現行ブラウザの`v`フラグでは未エスケープのハイフンにより無効だった。初回取得と再試行に世代分離がなく、Settingsの広い旧目標範囲を先に検証するとセットアップ済みユーザーも閉じ込められた。
- **対策**: DB正本の接続元と目標を読み込み、500〜100,000歩の整数目標をプロフィールと同時保存する。保存後は即redirectせず、プロフィール・接続・目標の完了と最初の500歩Questを表示する。Status API障害は5xxとして分離し、全入力を44px化、`pattern`をUnicode Sets互換へ修正する。Status取得はAbortControllerで旧応答を破棄し、セットアップ済み判定をオンボーディング用目標検証より先に行う。
- **教訓**: オンボーディングの完了条件は「必要情報を保存した」ではなく「次に何をすれば価値を体験できるか分かる」。初回目標は低活動でも達成可能な入口を持ち、保存成功の手応えを永続表示してからホームへ渡す。リファレンス: `app/[locale]/setup/page.tsx`, `app/api/user/setup/route.ts`, `app/api/user/status/route.ts`

### LL-051: Settingsで装飾が健康目標より先に並び、歩数目標の範囲も分裂していた

- **事象**: モバイルSettingsではプロフィール画像・称号・フレーム・ショップ・言語・テーマの後に日次目標があり、行動設定へ到達する前に装飾が続いた。Setupは500〜100,000歩、Settings UIは100〜1,000,000歩、APIは0〜1,000,000歩を受理していた。統計の`col-span-3`は2列モバイルgridに暗黙列を作った。
- **根本原因**: Settingsを機能追加順で左右カラムへ積み、DOMのモバイル読み順を設計していなかった。歩数目標のClient/API制約を別々にハードコードし、未表示のSmart Goal用DB取得も残っていた。DBエラーは通知ON・アイテム未所有へ既定化されていた。Midnightの`.bg-white` global `!important`が新しい4px左アクセントも1pxへ戻した。
- **対策**: 歩数ソースと日次目標をSettingsFormより前へ移し、`lib/step-goal.ts`で500〜100,000歩の整数契約を共有する。目標入力を16px/44px・focus付きエラー・成功statusへ修正し、未使用クエリを除去する。ユーザー/所有権データ失敗はページエラー、未適用環境があり得る通知カラム失敗は通知トグルだけの明示エラーへ分離し、統計spanを2列/3列で明示する。`.settings-goal-card`でMidnightだけ左4pxを局所復元する。
- **教訓**: Settingsも情報アーキテクチャであり、利用頻度とサービス価値の高い健康行動を装飾より先に置く。Client制約とAPI認可は同じ純粋関数を使い、レスポンシブgridは各ブレイクポイントの列数を超えるspanを持たせない。リファレンス: `app/[locale]/settings/page.tsx`, `components/SettingsForm.tsx`, `components/StepGoalForm.tsx`, `lib/step-goal.ts`

### LL-052: 未適用の通知嗜好カラムがFeed全体と未読数を停止していた

- **事象**: 読み取り専用の実DB確認で`notification_reactions`がPostgreSQL 42703となり、SettingsだけでなくActivity Feed APIと未読数APIも500、通知ベルは失敗を無言で無視していた。
- **根本原因**: 必須の`feed_last_read_at`と任意の通知嗜好カラムを同じSELECTへ結合し、嗜好取得失敗をFeed全体の障害境界に置いた。DBマイグレーションの適用状態と機能可用性を分離していなかった。
- **対策**: 既読時刻と通知嗜好を別クエリにし、嗜好取得失敗時も既定Feed・未読数を継続して`notificationPreferencesAvailable: false`を返す。ActivityFeed/NotificationBellは警告を表示し、通知設定APIは503利用不能を返す。Settingsは通知トグルだけを隠して他設定を維持する。
- **教訓**: 任意機能のスキーマ不足をページ/Feed全体の障害へ拡大しない。ただし既定値へ無言変換せず、APIの可用性フラグとUI警告で部分障害を正直に伝える。リファレンス: `app/api/user/feed/route.ts`, `app/api/user/feed/unread-count/route.ts`, `components/ActivityFeed.tsx`, `components/layout/NotificationBell.tsx`

### LL-053: Profileが欠測・0歩・補助障害を同じ0または全面エラーへ変換していた

- **事象**: 今日の記録なしと記録済み0歩を`|| 0`で同一表示し、公開グループ・おすすめ・履歴・累計のどれか1件のDBエラーでプロフィール全体をthrowしていた。比較系列の欠測も0と読み上げ、累計歩数を直近活動日数で割る平均値が表示された。
- **根本原因**: 可視数値を常に`number`へ正規化し、必須プロフィールと補助セクションを同じPromise障害境界へ置いた。平均の期間・分母契約と、比較チャートの`hasRecord`契約が主系列だけに存在した。
- **対策**: `lib/profile-steps.ts`で日/週/月/平均を`number | null`として純粋集計し、記録済み0歩を記録日分母へ含める。必須ユーザー以外を個別結果へ分離し、セクション別エラーを表示する。ActivityGraph比較系列も`Map.has`で0/欠測を分け、PersonalRecordsを項目単位nullableにする。
- **教訓**: 健康データでは0は有効な測定値であり、欠測や取得失敗のfallbackではない。ページの可用性は最小必須データで決め、補助機能の失敗を他の実データへ伝播させない。リファレンス: `app/[locale]/user/[username]/page.tsx`, `lib/profile-steps.ts`, `components/ActivityGraph.tsx`

### LL-054: Walletの「今日の入金」が購入支出で負になり得た

- **事象**: Walletは当日の全取引amountを合算して「今日の入金」と表示したため、ショップ購入後に入金が負数になった。日次チャートも購入を含む値を「日次獲得」と呼び、履歴の増減・残高説明は表より後まで分からなかった。
- **根本原因**: 獲得・支出・純増減を1つのsigned amountで表現し、直近60件の履歴sliceを日次正本として再利用した。次に得られる歩数UCもWalletに接続していなかった。
- **対策**: `lib/wallet-summary.ts`で正額獲得・負額支出・純増減を純粋集計し、JST当日の全取引を専用取得する。現在歩数/目標から次100歩または目標到達の基本UCを計算し、ストリーク等は同期時加算と明記する。残高本体・今日内訳・次報酬を独立表示し、履歴説明を前置、10件ずつ段階開示、残高欠落時はgrid全幅化、`items-start`、チャートを日次純増減へ改称する。
- **教訓**: 金融的なUIでは符号付き合計を「入金」「獲得」と呼ばない。獲得と消費を別々に見せ、ユーザーが残高変化の理由と次に得られる価値を同時に理解できるようにする。リファレンス: `app/[locale]/wallet/page.tsx`, `lib/wallet-summary.ts`, `components/CoinBalanceCard.tsx`

### LL-055: Groupsが0歩を順位化し、補助データ障害で詳細全体を停止していた

- **事象**: Groups一覧のバッチ順位がグローバル順位にいないユーザーを0歩で再注入し、グループ対抗順位にも合計0歩のグループが残った。Group detailはメンバー件数、順位、比較、期間別競争、メンバー一覧のどれかが失敗するとページ全体を停止し、人数取得失敗を0人として表示し得た。
- **根本原因**: 「グループ所属」と「ランキング参加」を同じ集合として扱い、必須のgroup/membership認可と補助分析データを同じ障害境界へ置いた。Supabase relationの配列/オブジェクト差も型アサーションで隠していた。
- **対策**: ユーザー順位とグループ対抗順位を正歩数だけに限定し、除外後に順位を再付与する。人数ラベルをランキング参加人数へ変更し、未所属空状態から参加CTAを接続する。Group detailは補助取得を個別に捕捉し、メンバーrelationを型ガードで正規化、ページと管理Dialogに取得不能を表示して他機能を継続する。
- **教訓**: 0歩は所属の証拠でもランキング参加の証拠でもない。認可に必要なデータだけをページ必須境界とし、補助データの失敗を0・空・未所属へ変換せず、利用可能なグループ機能を維持する。リファレンス: `app/[locale]/groups/[groupId]/page.tsx`, `lib/services/ranking-service.ts`, `lib/services/group-ranking-service.ts`

### LL-056: 非公開グループで非表示の対抗順位を取得し、不要な障害警告を出した

- **事象**: private groupでも全期間のグループ対抗順位を取得し、取得失敗時は画面に表示しない機能の障害警告を出していた。
- **根本原因**: 描画条件の`isPublic`だけを確認し、データ取得と可用性判定を同じ公開範囲へ揃えていなかった。
- **対策**: グループ対抗順位の取得・障害判定はpublic groupだけで実行する。private groupは空の正常スキップ状態とし、競争障害を表示しない。
- **教訓**: 非表示機能の取得失敗をユーザー向け障害へ昇格させない。認可・公開範囲・取得・描画の条件を一貫させる。リファレンス: `app/[locale]/groups/[groupId]/page.tsx`

### LL-057: `vmForks`のモック漏洩がCIの実行順でだけ顕在化した

- **事象**: ローカル検証では296件がPASSしていたが、PRのGitHub ActionsではSupabaseをファイル単位でモックする4テストファイルが相互干渉し、11件失敗した。単一workerで再現すると、別ファイルの`vi.mock()`とモジュールキャッシュが残り、`.in()`欠落や誤った認可結果が発生した。
- **根本原因**: `vitest.config.ts`で高速化目的の`vmForks` poolを使い、ファイルローカルのモジュールモックがworker再利用時も確実に分離されると仮定した。通常の並列ローカル実行だけを証拠にし、CI相当の少数worker・異なるファイル順を検証していなかった。
- **対策**: Vitestを標準の`forks` pool + `isolate: true`へ変更した。モックを多用するテスト群は、通常の全テストに加えて`--maxWorkers=1`でも実行し、テスト期待値を緩めずにファイル分離を確認する。
- **教訓**: テストpoolの高速化は、モジュールモックの独立性より優先しない。CIでのみ失敗した場合は、実装や期待値を変更する前にworker数・pool・isolate・実行順を再現し、モック漏洩を切り分ける。リファレンス: `vitest.config.ts`, `lib/__tests__/ranking-service*.test.ts`, `lib/__tests__/*group-security.test.ts`

### LL-058: 同一repositoryの別projectへ無断fallbackし、誤った画面に作業セッションを作成した

- **事象**: canonical projectのworkspace初期化に失敗した後、同じGitHub repositoryを指すことだけを根拠に、ユーザー画面上の別project「UCFitness-旧」へ子セッションを作成し、ユーザーから「違うところに作っていますね」と指摘された。
- **根本原因**: repository URLの一致をprojectの同一性と誤認し、ユーザー画面上のproject名、project ID / 内部名、main path、対象cwdを子セッション作成前に照合しなかった。初期化失敗時の停止条件もなく、別projectを安全なfallbackとして扱った。
- **対策**: セッション作成・委任前の同一性確認をproject名、ID / 内部名、main path、cwd、branchの組で必須化する。目的projectの初期化失敗時は別projectへfallbackせず、修復不能なら目的project内の現行セッションで専門agentを直接実行する。別project利用は対象名とmain pathを提示し、ユーザーの明示確認後に限る。
- **教訓**: GitHub repositoryが同じでも、project、main path、worktree、ユーザーが見ている作業面は別物である。自動復旧は作業場所を変えずに行い、場所の変更は利便性よりユーザーの明示的な選択を優先する。リファレンス: `.github/agents/UCFitnessAgent.agent.md`「Session Bootstrap」、`README.md`「注意事項 / 制約」

### LL-059: stable order付きOFFSET paginationを並行変異下のsnapshotと誤認した

- **事象**: グループ削除同期のN+1解消で、PostgREST既定1000行切り捨てを避けるstable order付きOFFSET paginationを導入した。しかしページ取得中にjoin / leave / kickが発生するとOFFSETが移動し、行の欠落・重複から有効な`users.group_keyword`を誤同期し得るため、実装を撤回して`app/api/user/group/route.ts`とテストを`origin/main`へ戻した。
- **根本原因**: 一意な順序が各queryの決定性を保証することと、複数queryが同じMVCC snapshotを参照することを混同した。PostgRESTの各OFFSET要求は別トランザクションであり、可変なmembership集合の完全性を保証しない。削除前収集→削除→派生同期というmutation-sensitiveな処理を、DB transactionなしでアプリ側一括最適化した。
- **対策**: 読み取り専用または取得中に不変と保証できる集合に限り、pagination + 一意なstable orderを使用する。並行更新されるmembership集合から不可逆操作や派生同期を行う場合は、収集・削除・同期を単一transactional RPCへ集約し、必要なrow lockまたは一貫したsnapshotをDB内で保証する。migration禁止の今回タスクでは安全な原子化を追加できないため、一括最適化を採用しない。
- **教訓**: stable orderはsnapshotではない。PostgRESTの1000行切り捨て対策だけで、可変集合に対する複数OFFSET要求の完全性を保証したと判断してはならない。mutation-sensitiveな複合操作はDB transaction / RPC / row lockを前提に設計し、それがない間は性能改善候補を撤回する。リファレンス: `migrations/20260617_add_multi_provider_connections.sql`のtransactional RPC + `FOR UPDATE`パターン

### LL-060: Unicode文字数だけを検証し、UTF-8 byte超過でagent pickerから除外された

- **事象**: `UCFitnessAgent.agent.md` を21,600 Unicode文字へ短縮して30,000文字未満のcheckを通し、PR #230をdefault branchへmergeしたが、localとcloudのagent pickerにUCFitnessAgentが表示されなかった。profile全体は40,731 UTF-8 bytesあり、cloud probeでも標準Copilot identityへfallbackして利用可能agent一覧に現れなかった。
- **根本原因**: 公式の「30,000 characters」をUnicode code pointだけで解釈し、multibyte主体の日本語profileのUTF-8 byte数をgateにしなかった。parser、frontmatter、GitHub上の存在、文字数checkの成功を、runtimeでの発見性確認の代わりにしていた。
- **対策**: agent promptを詳細ルールの正本参照型へ再圧縮し、profile全体を24,000 UTF-8 bytes未満に制限する。`scripts/check-custom-agents.mjs`でUnicode文字数、UTF-8 bytes、必須SSoT参照を同時検証し、修正branchの短いcloud sessionでactive identityと利用可能agent一覧を確認する。
- **教訓**: customizationの構文検証とruntime発見性は別の品質ゲートである。CJK中心のprofileは文字数とbyte数を別々に測り、十分な余裕を持たせ、実際のpicker経路でロードされるまで表示修復を完了と呼ばない。リファレンス: `.github/agents/UCFitnessAgent.agent.md`, `scripts/check-custom-agents.mjs`, `README.md`「カスタムエージェント」

### LL-061: 日次再計算ボーナスと一回限り節目報酬を同じ台帳種別へ混在させると報酬が消える
- **事象**: ストリーク節目UCを既存`STREAK_BONUS`で記録する初期案では、同日の歩数再同期が`processCoins()`のdelete→再計算対象として節目取引まで削除し得た。日付付き冪等キーでは別日の再実行による二重付与も防げない。
- **根本原因**: 当日歩数に応じて何度でも再計算される倍率ボーナスと、生涯一回だけ確定する達成報酬を同じライフサイクル・種別・日付キーで扱った。
- **対策**: `STREAK_MILESTONE`を日次削除対象から分離し、`streak_milestone:{userId}:{badgeCode}`を一生涯キーとした。DBで連続日を再検証し、ユーザー行ロック下でバッジ・台帳・残高を単一トランザクションへ統合した。
- **教訓**: 台帳種別と冪等キーは表示分類ではなく、再計算・取消・一回限り・遡及可否のライフサイクル境界で設計する。定常再計算のdelete/upsert集合へ不可逆な達成報酬を混ぜない。リファレンス: `lib/services/coin-service.ts`, `migrations/20260718_add_streak_milestone_rewards.sql`

### LL-062: 構造化台帳の反復キーを識別子照合せず誤適用した
- **事象**: F016のstatus更新をF001へ、今回sessionLogのcommit更新を過去ログへ誤適用したままPRを作成した。
- **根本原因**: 反復するstatusやcommitだけを検索・置換し、対象idやdateと同じobject内にあることを編集前後のdiffで確認しなかった。
- **対策**: 構造化台帳は対象objectの一意な識別子範囲を先に読み、変更後に対象値と同名キーを持つ他objectの差分を同時検証する。
- **教訓**: 同名キーが反復する台帳は値だけで編集しない。識別子をanchorにし、PR差分で意図したobjectだけが変わったことを確認する。
- **追加教訓**: 履歴テストは可変のtop-level `lastCommit`ではなく対象sessionLogを固定し、進捗更新後にfull testを再実行する。
- **追加教訓**: feature台帳の`status` / `lastAttempt` / `lastError`を変更した後は、対象IDの値だけでなく、同名キーが変わった全IDを構造化比較し、対象外IDの変更をcommit前に拒否する。

### LL-063: 報酬倍率差を浮動小数点のまま切り捨てると正規UCを1減らす

- **事象**: 7日ストリークの`1.2`倍率で10,000歩の追加報酬が、`Math.floor(10000 * (1.2 - 1))`の二進浮動小数点誤差により正規値より1 UC少ない値となった。
- **根本原因**: 表示・業務上は固定小数点の倍率差を、JavaScriptの二進浮動小数点差分として直接`floor`していた。同じ式が日次処理とbackfillへ重複していた。
- **対策**: 倍率差を整数百分率へ`Math.round`で正規化してから計算し、processCoinsとbackfillが同じ共有ヘルパーを使うようにした。10,000歩・7日ストリークが2,000 UCになる日次RPC payloadとbackfillの両方をテストする。
- **教訓**: UCなどの離散報酬で固定率の差分を計算する場合、浮動小数点の差分へ直接`floor`を適用しない。最小通貨単位に対応する整数率へ正規化し、代表的な倍率境界を両方の書き込み経路で検証する。リファレンス: `lib/services/coin-service.ts`, `lib/services/coin-service.test.ts`

### LL-070: API入力だけのparseInt監査でClient送信値とJST境界を見落とした

- **事象**: query整数の部分受理修正後も、`WalkingRoutes`のduration入力が`parseInt`で`1e2`・`1.5`・`3abc`を部分受理し、Step Calendarの省略yearはEdge UTCの元日境界で前年を選び得た。Client修正後も汎用alertだけで、入力の無効状態と修正方法が支援技術へ関連付いていなかった。さらにnumber inputの`1e309`等はDOM valueが空でも`validity.badInput=true`となり、文字列だけでは未指定と誤認し、同じ空valueのまま有効へ戻る操作ではReact `onChange`が発火しなかった。
- **根本原因**: repository監査をquery/path/bodyのサーバー受信箇所へ狭め、Clientが生文字列をnumberへ変換して送信する境界を含めなかった。既定年もサーバーのローカル年とJST業務日が同じだと仮定し、native `ValidityState`とvalue不変時のevent差を確認しなかった。React state更新直後の同期focusで、ARIA属性とerror DOMのcommit前に入力へ移動し、実DOM testはPlaywright bundled browserがCIに存在すると仮定した。runner既設Chromeへ移行後も、bundleとbrowserのcold startupが15秒以内で安定すると見積もっていた。
- **対策**: ユーザー入力の整数監査はClient stateからAPI validationまでを追跡し、生文字列を共有`parseStrictInteger`で全文検証する。業務日由来の既定年は`getJSTDateString`正本を使い、Date注入可能な純粋helperでJST元日境界を固定する。Client検証エラーは`validity.badInput`を空文字判定より先に確認し、native `input`イベントでValidityState修正を追跡し、試行counterを契機とするeffectでARIA/error DOM commit後に毎回focusする。CI run 30051872077の初回15.012秒timeoutと再実行8.599秒PASSを根拠に、Google Chrome実DOM testだけを30秒、各Playwright操作を5秒とし、global timeoutは変更しない。
- **教訓**: 入力検証監査はHTTP境界だけで完了とせず、native validity・value不変時のinput event・フォーム変換・JSON生成・API再検証を一続きで確認する。検証エラーを汎用失敗へ丸めず、可視文言・ARIA状態・focusを同時に対象入力へ結び付け、無効化と修正直後の解除を実ブラウザで固定する。CIのbrowser testはdownload済みbrowserを暗黙前提にせず、実行環境の既設browser経路を使う。cold startupの実測から対象testだけの起動予算を決め、短い操作timeoutを別に保って失敗assertionを隠さない。年・月・日を既定化する処理はruntime timezoneへ依存させず、業務timezoneの境界時刻を決定的テストへ含める。リファレンス: `components/WalkingRoutes.tsx`, `app/api/user/step-calendar/route.ts`

### LL-071: optional decimalを`type="number"`で受けると厳格検証前に字句を失う

- **事象**: Walking Routesの任意距離を`parseFloat`から全文parserへ変更しても、`type="number"`がReactの`onInput`より前に`+1`→`1`、`3abc`→`3`、前後空白と`1.`→`1`へ正規化し、禁止した生文字列が正常値としてPOSTされた。純粋parser testは正規化前文字列を直接渡すため検出できなかった。
- **根本原因**: 数値キーボードの提供と生文字列の保持を同じ`type="number"`へ委ね、ブラウザDOMのvalue sanitizationを送信境界に含めていなかった。parser単体の全文一致を、実UIからparserへ同じ字句が届く証拠として扱った。
- **対策**: 距離だけを`type="text"` + `inputMode="decimal"`へ変更して生文字列を保持し、空文字だけを`null`、存在時は符号・空白・指数・locale依存のカンマ表記を含まない非負10進数全文かつfiniteの場合だけ送信する。距離専用error/ARIA/commit後focus、可視の任意ラベル、16px入力、320px縦積み、意味色outlineを維持する。既設Chrome channelのUIへ禁止字句を実入力し、raw value、POST 0回、反復submit、空への修正、0/1.5 payload、44px、320/375/1280px、keyboard、consoleを固定する。
- **教訓**: 字句自体を厳格検証するdecimal入力では`type="number"`を正本にしない。`inputMode`はモバイルキーボードのhintに限定し、localeで意味が変わる区切り文字を暗黙変換しない。raw文字列をClient parserへ渡した証拠と、変換後numberを再検証するServer契約の両方を持つ。エラー文追加時は狭幅の入力幅と全テーマの実focus indicatorも同じ完了条件にする。リファレンス: `components/WalkingRoutes.tsx`, `components/WalkingRoutes.test.ts`

### LL-072: 可視トーストだけでは非同期操作失敗が支援技術へ届かない

- **事象**: Walking Routesの作成・更新・削除失敗は可視トーストだけで、支援技術へ即時通知するlive semanticsがなかった。dismiss buttonは英語固定名かつ44pxと明示focusを持たず、別actionの成功後も以前のエラーが残り得た。さらに複数routeの並行更新は同一errorをDOM mutationなしで上書きし、pending中に開いたdelete dialogは後着alertをinert subtreeへ隠し得た。boolean dialog guard追加後も、Cancel/Escape直後のcaptured confirm closureは同route再open時の新dialogと区別できず、dialog openを全button disabled条件へ含めるとトリガーfocusも失われた。mutation `finally`でref lockをcommit前に解除すると後着alertを再びinert配下へ隠し、保存中に追加/キャンセルでフォームを閉じると次操作が無言で拒否され、作成・削除成功やalert解除でfocused controlを除去するとfocusが`body`へ落ちた。
- **根本原因**: field validationの関連付けだけをアクセシビリティ境界として確認し、非同期action結果のannouncement、翻訳、操作領域、action lifecycleを同じ状態契約で監査していなかった。`actionLoadingId`のReact stateと同一routeのdisabledだけを排他制御に使い、same-tick・別route・create・delete dialogを跨ぐ同期lockがなかった。dialog identityもopen/closedのbooleanだけで、closureを発行したroute/generationと、操作完了後もDOMへ残る安定したfocus復帰先を管理していなかった。
- **対策**: action本文だけを`role="alert"` + `aria-atomic`へ載せ、button名の読み上げを混在させない。dismissはnext-intl名を持つnative 44px buttonと明示outlineにし、各error objectへ起動入力のfocus意図を同梱する。create/favorite/log/deleteは同期ref lockで1件へ直列化し、pending中は全route controls・追加・キャンセルをdisabled、対象routeだけspinner表示、delete dialogとは相互排他にする。`finally`はloading state終了とmonotonic release tokenだけをscheduleし、error DOM/focusまたはsuccess/loadingがcommitした単一effectでtokenを一度だけ消費してref lockを解放する。alert解除は接続中の起動button、favorite/logのキーボード成功は起動button、作成・削除成功は安定した追加buttonへcommit後focusを戻す。dialogは説明を`aria-describedby`で関連付け、active route ID + monotonic tokenを全close経路で同期invalidateする。Chromeでfailure resolve直後の割込み拒否、alert commit後の再操作、success/pointer release、stale token/inert/ja/en、focus復帰を固定する。
- **教訓**: 非同期操作エラーは支援技術へ届くことだけで完了とせず、操作位置から視覚的にも発見可能にする。UI disabledだけで二重送信を防いだと判断せずhandler境界の同期lockを持ち、ref lockはPromise settleでなく関連DOM・loading・focusのcommit後に解放する。保存中にフォームを消す操作を許可せず、focused controlを成功・dismiss・破壊的操作で除去する場合は、DOMに残る安定した復帰先を同じcommit後effectでfocusする。close可否をbooleanだけで表さず、破壊的confirmはroute/generationをclosure発行時と実行時に完全一致させ、assertive通知と同一文言再発はDOM remountまで実ブラウザで固定する。リファレンス: `components/WalkingRoutes.tsx`, `components/WalkingRoutes.test.ts`

### LL-073: 並列DB結果の既定化で依存障害を未達成へ偽装した

- **事象**: 実績進捗APIが7件のSupabase結果の`.error`とshapeを確認せず、DB障害・null・壊れたrelation rowを0件、0歩、未所有として200で返していた。累計歩数の全行取得はPostgRESTの1000行上限で欠落し得た。
- **根本原因**: `data || []`、optional chaining、`count || 0`を正常系の既定値として使い、取得失敗・不正形状・正当なzero/emptyを同じ分岐へ統合した。全期間集計にも既存RPCを再利用しなかった。
- **対策**: `get_user_step_stats`と称号サービスの共有parserへ統一し、7依存のDB errorを固定503、不正形状を固定500へ分離した。正当な0・空・残高行なし、公開target契約だけを維持し、生errorをログ・responseへ渡さないbehavior testを追加した。
- **教訓**: 並列DB結果は各resultのerrorとdata/count shapeを個別に検証し、zero/emptyを許可する契約を依存ごとに明示する。集計は取得件数上限のある全行走査ではなくDB側RPCを使い、relation rowは壊れた要素をskipせず全体を失敗させる。リファレンス: `app/api/user/achievement-progress/route.ts`, `lib/services/title-achievement-service.ts`
- **追加教訓**: `JSON.stringify(Error)`は非列挙のmessage/causeを落として`{}`になるため、ログ非漏洩の証拠にしない。raw error identityと固定operation、Error message/name/code/cause/context、固定contextを直接分解し、PII値ごとに非包含を検証する。

### LL-064: 静的アイコンを`next/og`で再生成するとPages Workerの無料枠を超える

- **事象**: `app/icon.tsx`と`app/apple-icon.tsx`が`ImageResponse`を使ったため、既に同じPNGが`public/`にあるにもかかわらずresvg WASM約1.32 MiBをWorkerへ同梱し、gzip推定3.052 MiBでCloudflare無料枠3 MiBのdeployだけが失敗した。
- **根本原因**: routeのFirst Load JSだけをF020のbudgetとして監視し、Pages Workerの全moduleとWASMを含むupload sizeを出荷ゲートにしていなかった。
- **対策**: metadata routeは`force-dynamic`のEdge routeとして既存の静的PNGへredirectし、`next/og`依存を除去する。静的化されたredirectはPages上で200空本文になり得るため使用しない。`npm run pages:build`後に全Worker moduleのgzip推定合計を計測し、2.8 MiBを超えたら失敗させる。
- **教訓**: Cloudflare Pagesではclient bundleとWorker upload sizeを別々に管理する。固定画像に動的画像生成を使わず、deploy段階の3 MiB制限をCI相当のlocal buildで事前検出する。リファレンス: `app/icon.tsx`, `app/apple-icon.tsx`, `scripts/check-cloudflare-worker-size.mjs`

### LL-074: focus時のスクロールと無制限画像fallbackが隣接操作を無反応にした

- **事象**: Daily Missionsのprepare buttonをPlaywrightで物理クリックするとPOSTが発生せず、Trending Gearでは画像失敗が数万件の再リクエストになった。
- **根本原因**: buttonの`onFocus`がmousedownとclickの間に`scrollIntoView()`してポインター着地点を別要素へ移し、画像`onError`も失敗するfallback URLを再設定し続けた。
- **対策**: focus handlerからレイアウト・スクロール副作用を除去し、画像fallbackを1回で打ち切る。回帰テストはDOM上のhandler直接呼び出しでなく物理クリックと失敗画像リクエスト上限を検証する。
- **教訓**: focusは即時の視覚表示に限定し、スクロール補正が必要ならfocus成立後の別契機で行う。fallbackは必ず最終失敗状態を持つ。リファレンス: `components/dashboard/DailyMissions.tsx`, `components/TrendingGear.tsx`, `scripts/audit-dashboard-ux.mjs`

### LL-076: 外部ランキングが依存障害・切り捨て・未参加者を正常ランキングへ変換していた
- **事象**: `GET /api/external/ranking`がDB障害やnullを空集合・0歩へ変換し、profile欠落をdrop/Unknown、未記録・0歩を順位として返していた。PostgREST listのexact countを見ず1000行超の部分配列も正常200にし、CRON secret比較は文字列長で早期returnしていた。
- **根本原因**: 成功形維持を優先し、error・shape・一意性・safe integer・exact countと正当な空集合を分ける境界がなかった。「定時間」を同長UTF-16 loopだけで満たしたと誤認し、異長・Unicodeを同じ比較経路へ通していなかった。
- **対策**: 全可変list queryで`count: exact`と返却長を照合し、切り捨て・null/負/unsafe countを固定500へ分離した。依存障害は生errorやIDをcause/contextへ渡さず、固定codeとstageだけを持つ`AppError`へ変換する。CRON/OAuth比較はTextEncoder UTF-8をWebCrypto SHA-256の固定32-byte digestへ変換後に固定長loopで比較し、正歩数だけを既存安定sort後に1..Nへ再採番する。
- **教訓**: 外部ランキングで正常な空集合は完全取得を証明した空配列だけに限定する。stable pagingをsnapshotと呼ばず、上限超の完全取得はtransactional RPCへ委ねる。secret比較は文字列長やUTF-16単位で短絡せず、raw error・secret・IDをログへ渡さない。SHA-256 digest比較は衝突耐性を前提とする等価判定であり、secret保存用hashの代替ではない。リファレンス: `app/api/external/ranking/route.ts`, `app/api/external/ranking/route.test.ts`, `lib/validation.ts`

### LL-079: 既定npm proxyの遅延を公開registry未公開と誤認した

- **事象**: 既定の`packagefeedproxy.microsoft.io`ではNext 15.5.21とNextAuth beta.32が404だったため公開待ちと判断したが、`registry.npmjs.org`には両版とsha512 integrityが公開済みだった。
- **根本原因**: `npm config get registry`を確認せず、既定proxyのpackumentとtarball可用性をnpm公式registryの公開状態として扱った。
- **対策・教訓**: 脆弱性修正版の公開判定は、設定中registryとlockfile許可先を分けて確認する。UCFitnessでは`registry.npmjs.org`のHTTPS tarballとsha512を検証してlockを生成し、`npm audit --omit=dev --audit-level=high`を通す。proxy未同期を理由に`npm audit fix --force`やmajor downgradeへ逃げない。

### LL-080: 古いPush応答をendpointだけで削除すると再購読replacementを消し得る

- **事象**: 送信中に同じendpointが新しい鍵や作成時刻へ再購読された場合、古い404/410応答を根拠にendpointだけで削除すると有効なreplacementまで消し得た。migration、runtime検証、アプリ配線を1 PRへ混在させた旧PR #302はmain差分994行となり、各層の所有権と検証証拠も不明瞭になった。
- **根本原因**: endpointを不変versionとして扱い、外部応答が証明するのは送信時に観測した購読版だけという境界をDB transactionへ反映していなかった。また、static SQL契約と実PostgreSQL競合検証を同じ完了条件として扱った。
- **対策**: clean 3-layerへ分割し、Layer 1は主キー`id`で行を`FOR UPDATE`し、残るrow-version項目が一致した場合だけ同じ`id`を削除するservice-role限定CAS RPC migrationとSHA-256付きstatic catalog/security testを正本にする。Layer 2で実PostgreSQLのnegative catalog・exact/stale・二接続競合を検証し、Layer 3でアプリを配線する。Layer 2がmainへ入る前のproduction適用は禁止する。
- **教訓**: 古い外部応答で可変リソースを削除するときは完全row versionをDB transaction内でcompare-and-deleteする。migration、runtime証明、利用側配線を独立PRにし、static testだけでruntime PASSを主張しない。リファレンス: `migrations/20260725_delete_push_subscription_if_unchanged.sql`, `lib/__tests__/push-subscriptions-rls-migration.test.ts`

### LL-081: 再試行の権威と保護範囲を短命な画面へ閉じ込めると復旧不能になる

- **事象**: 全達成ボーナスの再試行可否が`sessionStorage`だけにあり、新しいタブでは未付与報酬を再試行できなかった。Trending Gearはloading置換でfocus元を失い、`target="_blank"`のAmazon初回通信は親pageのrouteを継承しなかった。
- **根本原因**: 永続報酬、非同期DOM置換、別Page通信の各状態を、それぞれタブ内保存、unmountされるbutton、親pageだけという短い寿命・狭い範囲へ置いた。
- **対策**: 報酬可否はコイン台帳の一意な冪等キーを正本にし、UIは常設landmarkと操作方法refからDOM commit後にfocusを復元する。外部popupはnavigation前のbrowser context routeでmockし、下位guardで未mock通信を実ネットワークへ出さない。
- **教訓**: 再試行・置換・別Page遷移では、状態や保護を処理完了まで生存する層へ置く。回帰テストは同一page reloadだけでなく、全storageが空の新規context、keyboard/pointer別activeElement、popup最初のrequestまで含める。リファレンス: `app/api/user/missions/route.ts`, `components/dashboard/DailyMissions.tsx`, `components/TrendingGear.tsx`, `scripts/audit-dashboard-ux.mjs`

### LL-082: migrationのtext testだけでは実catalogとrow lock競合を証明できない

- **事象**: Push購読CAS migrationは文字列検査を通っても、default式、constraint backing index、個別ACL、`SECURITY DEFINER`属性、2 transactionの待機順序を実PostgreSQLで検証できていなかった。
- **根本原因**: SQL sourceに期待する語があることと、PostgreSQL catalogへ期待どおり反映され並行transactionで安全に動くことを同一視した。
- **対策・教訓**: migration bytesのSHA-256をDB接続前に固定し、digest固定PostgreSQL serviceへ実適用してunique列順・FORCE RLSを含むfresh database negative、role別実行、rollback、2接続lock barrierを検証する。接続先はquery/hashなしのloopback maintenance DB・固定test admin・明示flagに限定し、既存roleがあるclusterを拒否する。作成roleとrandom allowlist名のDBだけを失敗時も削除し、workflowの全`uses:`を完全長SHAで固定する。リファレンス: `scripts/test-push-cas-postgres.ts`, `.github/workflows/validate.yml`

### LL-083: 通知送信の再試行をHTTP応答だけで管理すると成功済みユーザーへ再送する

- **事象**: Weekly summaryとstep reminderはbatch途中の503や並行Cronで、既に成功したユーザーを同じJST occurrenceとして識別できず再送し得た。
- **根本原因**: 配信結果をrequest内カウンターだけで管理し、user単位の永続idempotency key、lease所有権、完了状態がなかった。
- **対策**: `(notification_type, occurrence_key, user_id)`一意のDB outboxとowner/token付きlease RPCをLayer 1にし、personalized data取得前のclaim、契約成立後だけのcomplete、所有中だけのreleaseをLayer 3契約にする。
- **教訓**: 外部通知の再試行はHTTP requestではなく論理occurrence単位で永続化する。static migration、runtime競合検証、アプリ配線をclean 3-layerへ分け、Layer 2前のproduction適用を禁止する。

### LL-084: outboxのcheck件数だけでは制約弱体化を検出できない

- **事象**: migration postconditionがcheck constraintの件数だけを確認すると、90日保持を89日へ弱めても同じ件数のまま適用できる。
- **根本原因**: catalog形状の存在確認と、制約式が守る業務境界の実行確認を同一視した。
- **対策・教訓**: digest固定に加え、条件を弱めたmigrationをfresh DBへ適用して境界insertが検出されることを確認する。並行claimは任意時間待機でなく実lock待機を観測し、逆順入力でも二重claimとdeadlockがないことを証明する。リファレンス: `scripts/test-notification-outbox-postgres.ts`

### LL-085: endpoint所有権とpayload世代を分離すると遅延Pushが旧ユーザーへ届く

- **事象**: Web Push送信後のowner移転に加え、host case・default port・percent encoding・fragment aliasをraw文字列hashすると同一endpointが別authority/lockになり、generationを安全に取得する非更新経路もなかった。
- **根本原因**: URL正規化をDBのraw endpoint hashへ暗黙依存し、legacy rowからownerを推測してbackfillし、save RPCをgeneration readにも流用する設計だった。
- **対策**: Layer 3共有helperのcanonical ownership keyだけをdigest/lockへ使い、legacyは全隔離する。authorityへcurrent subscription IDを結び、owner・digest・ID・保存行userのexact一致だけを返すservice-role read RPCを分離する。
- **教訓**: SQLへRFC 3986正規化を再実装しない。canonical key生成とraw→key consistencyは共有アプリ境界で検証し、generation authorityがない購読へpersonalized payloadを送らない。

### LL-086: RPCの静的型だけでは実行時shapeと秘匿境界を保証できない

- **事象**: 通知outbox RPCの引数・戻り値を型定義しても、PostgRESTの不正shape、生DB error、stale owner/tokenを呼出routeへ露出または成功扱いし得た。
- **根本原因**: compile-timeのRPC型をruntime validationと同一視し、DB境界でのunknown parse、固定エラー変換、semantic falseの契約を一箇所へ集約していなかった。
- **対策・教訓**: wrapper先頭を`import 'server-only'`でcompiler境界化し、exact RPC名/Args型を実使用して各呼出を1回に固定し、返却値はunknownから厳格parseする。日/ISO週keyは4桁年のUTC文字列をparse/roundtripし、0〜99年を`Date.UTC`へ渡さない。生Errorのidentity/name/message/stack/cause/context/nested fields・details・hint・code・UUIDを直接巡回し、内部`reportError` 0回かつ固定`AppError`だけを上位routeへthrowする。空claimは正常、complete/releaseのfalseはstale等の非成功として維持し、全tracked TS/TSXでproduction import 0件を機械検査する。リファレンス: `lib/services/notification-delivery-outbox.ts`, `lib/services/notification-delivery-outbox.test.ts`

### LL-087: 世代所有権のstatic SQL検査だけではCASとユーザー削除の競合を証明できない

- **事象**: source上のlock順、generation回転、read/release条件が正しく見えても、CAS cleanup、owner移転、ユーザー削除が別transactionで重なる際の待機順と最終authorityはtext testでは確認できなかった。
- **根本原因**: catalog形状と単一transaction内の分岐を、複数connectionが作るMVCC snapshot、row lock、advisory lockの実行結果と同一視した。
- **対策・教訓**: target/CAS migrationをSHA固定したfresh PostgreSQL 16で、canonical alias、raw上限、read不変性、stale release、逆順transfer、user削除、CAS-first/save-firstの実lock待機を検証する。Layer 2はDB契約だけを証明し、generation payloadとService Worker比較を含むLayer 3前のproduction適用は禁止する。リファレンス: `scripts/test-push-generation-postgres.ts`

### LL-090: generation一致だけでは世代対応SWの稼働を証明できない

- **事象**: authorityのowner・generation・versionが一致しても、未訪問の旧Service Workerはgeneration-aware protocolを保存・比較できず、personalized健康payloadを表示し得た。
- **根本原因**: 受信者所有権の世代と、現在subscriptionが対応できるpayload protocolのreadinessを同じ状態として扱った。
- **対策・教訓**: authorityへdefault 0のprotocol versionを追加し、旧save/releaseは0へ戻し、allowlist済みversionを申告する再saveだけがexact current authorityをreadyにする。senderはpersonalized送信前に必要versionを要求し、migration、runtime、server、client/SW、旧worker排出を独立Layerで証明する。generic通知は同じreadinessへ暗黙依存させない。

### LL-092: canonical URL生成とRPC wrapperを再結合するとLayer境界が崩れる

- **事象**: PR #314のserver実装にはcanonical ownership key生成、route配線、購読整理、RPC境界が同居し、wrapperだけを安全に先行mergeできなかった。
- **根本原因**: URL identityの正本を作る責務と、既に確定したidentityをDBへ渡してunknown結果を検証する責務を分離していなかった。
- **対策・教訓**: server-only wrapperは共有helperからcanonical ownership keyを入力として受け、DB互換shape、exact RPC引数、strict result、固定`AppError`だけを担当する。URL正規化、route、payload、pruning、callsiteは別Layerへ残し、production import 0件のinert状態を静的テストで固定する。リファレンス: `lib/services/push-subscription-ownership.ts`

### LL-093: Route Handlerから補助関数をexportするとCloudflare buildが停止する

- **事象**: Step CalendarのJST年解決helperを`app/api/user/step-calendar/route.ts`からexportした結果、Next.jsのRoute Handler型検査が許可しないexportとしてCloudflare Pages buildを停止した。
- **根本原因**: テストで参照する純粋helperをRoute Handlerに置いても、HTTP methodとRoute configだけをexportできるApp Routerのmodule契約を満たすと誤認した。
- **対策**: Route HandlerはHTTP methodと許可済みRoute configだけをexportし、Server/Client共通またはテスト対象の純粋helperは`lib/`へ配置してimportする。型検査だけでなくPages buildも実行してRoute export制約を確認する。
- **教訓**: App Routerの`route.ts`は再利用モジュールではない。補助exportが必要になった時点で共有moduleへ切り出し、Route HandlerをHTTP境界だけに保つ。リファレンス: `app/api/user/step-calendar/route.ts`, `lib/date-utils.ts`
### LL-094: nullableなDB結果を既定値へ畳むと障害と新規状態を混同する

- **事象**: AmazonパーソナライズAPIが残高・歩数照会のerrorを無視し、nullや不正値もBEGINNER・0歩の成功レスポンスへ変換していた。
- **根本原因**: DB照会結果のerror・正当な行なし・不正shapeを分類する前に`|| 0`と`|| []`へ畳み、ランクfallbackでも内部不整合を隠した。
- **対策**: 残高は`.maybeSingle()`の行なしだけを新規ユーザー0として許可し、query error・不正shape・unsafe数値・予期しないrejectを固定AppErrorと503へ分離した。生error・message・cause・user IDはログと応答へ渡さず、空歩数と記録済み0歩は合法な平均0として維持し、UIは片側障害を警告しつつ取得済みおすすめを表示する。
- **教訓**: nullableなDB結果は既定化前に`error`・absence・shapeを分類する。0や空配列を使えるのは正本が欠落を正常状態と定義する場合だけで、障害境界は固定エラーとtable-driven testで回帰固定する。リファレンス: `app/api/amazon/personalized/route.ts`

### LL-095: Dialogのfocus復帰先は接続状態だけでは安全と判定できない

- **事象**: Dialogを開いたトリガーがcloseまでDOMに残っていても、保存状態や条件付きUIでdisabled・hidden・`aria-hidden`になると、接続済み判定だけでは不可視または操作不能な要素へfocusを戻し得た。
- **根本原因**: focus復帰先の可用性を`isConnected`と`inert`だけで判定し、rendered geometry、CSS visibility、disabled state、hidden ancestorを同じ境界で検証していなかった。
- **対策・教訓**: previous active element→開始時fallback→cleanup時current fallback→最新mainの順序は維持し、各候補を接続・非`inert`・非disabled・非hidden・可視geometryで検証する。実Chromeで320/375/1280px、Tab循環、Escape、保存中close拒否後の退出、pointerのmousedown/click間のscroll/layout不変、disabled・hidden・unmount後のfocus復帰を固定する。リファレンス: `hooks/useDialogFocus.ts`, `hooks/useDialogFocus.test.ts`

### LL-096: crop geometryを固定幅や単一イベントへ委ねると選択範囲がずれる

- **事象**: 初回修正ではresize後に旧offsetを新幅でclampするだけだったため元画像上の選択中心がずれ、横長画像ではscale 1のままcrop枠へ空白が入った。固定360px fallback、画像loadの後着、passive wheelも初期0幅・連続選択・browser zoomでstale geometryを作り得た。
- **根本原因**: rendered container幅、DPR、natural image size、offset、scale、load/measurement世代を一体のgeometry契約として扱わず、各イベント経路を個別に補正した。
- **対策**: 初期幅0は`aspect-ratio`で予約し、`getBoundingClientRect()`をDPR精度へ正規化する。resizeはoffsetを幅比補正して同じpure helperでclampし、natural size由来のdynamic minimum scaleを全操作へ共通適用する。画像loadはgenerationで後着を拒否し、保存canvasはDPRとnatural crop上限から最大1200pxで生成する。wheel/ResizeObserverは局所登録・cleanupし、close時はblob previewを正本へ戻す。
- **教訓**: crop操作はcallbackごとの修正でなく、全入力経路が同じ正規化state transitionを使う。0幅、320〜1280px境界、orientation、DPR変更、連続load、source center、画像被覆、listener cleanup、focus/alt semanticsをpure testと実Chromeの両方で固定する。リファレンス: `components/BannerImageEditor.tsx`, `lib/banner-crop-geometry.ts`

### LL-097: coverage分母と通常suiteの時間条件を同じ完了判定へ固定しない

- **事象**: PR #289の60%回帰ゲートは現mainでも4指標をPASSした一方、F026をpassingにした89ファイル時点の通常suite 2.75秒は、103ファイル・1273テストの現mainで18.76秒となり5秒条件を満たさなかった。
- **根本原因**: 未import本番ファイルを含むcoverage分母、single-workerのmock分離、通常suiteの性能を別々の検証軸として維持せず、成長前の時間baselineをfeature完了状態へ固定した。
- **対策**: `coverage.include`へ`lib/**/*.{ts,tsx}`を明示し、CIは`forks` + `isolate: true`のsingle-worker coverageを決定的に実行する。coverage 4指標と通常suite時間はcurrent mainで個別に再測定し、F026はcoverage達成を維持しつつ5秒条件未達の`in-progress`へ戻す。
- **教訓**: coverage gateは全本番ファイルの分母と各指標の余裕で判断し、suite時間はテスト数・cold start・実ブラウザや子process testの増加を含む独立budgetとして追跡する。古い時間baselineだけでfeatureをpassingにしない。リファレンス: `vitest.config.ts`, `.github/ucfitness-features.json`, `README.md`

### LL-098: 固定エラー境界だけを直しても上位callerが識別子を再付与し得る

- **事象**: `ranking-service`内の生Supabase errorを固定`AppError`へ変換した後も、Home・Groups・Group detail・Profileのcatchが`reportError` contextへuser IDやgroup IDを再付与し、実ログへ識別子が残った。
- **根本原因**: DB queryからservice throwまでだけをエラーデータフローとして監査し、callerでのcatch・再ログを同じ秘匿境界に含めなかった。service単体testも送出例外だけを検証し、実際のcaller log引数と`console.error`出力を確認していなかった。
- **対策**: ranking caller専用loggerが元例外を再利用せず、許可済みoperation・stage・codeだけの新しい`AppError`へ再固定化してから記録する。一般依存のログ境界は変更せず、Ranking APIを含む6つのcaller operationと専用captureを`check:rules`で固定する。
- **教訓**: 固定エラー変換の完了条件はthrow地点ではなく最終log sinkまでのend-to-end追跡である。raw errorを`JSON.stringify`して空に見えることを証拠にせず、`reportError`へ渡るオブジェクトのidentity・message・code・cause・contextと実構造化出力を直接検証する。リファレンス: `lib/services/ranking-service.ts`, `lib/services/ranking-service.test.ts`, `app/[locale]/groups/page.tsx`

### LL-099: follow一覧の部分データと生DBエラーを成功状態へ畳まない

- **事象**: follow API群がSupabase errorやcatch値をそのまま`reportError`へ渡し、`/following`は欠落プロフィールをdrop、`/followers`は重複・切り捨て、`/follow/status`は不正なtruthy行をフォロー済みとして返し得た。初回修正後も全route testが`reportError`をmockし、source文字列guardだけだったため、最終`console.error`構造化JSONでの非露出を証明できていなかった。
- **根本原因**: TypeScriptのquery型を実行時shapeの保証とみなし、error・正当なno-row・不正null・重複・exact count不一致・必須プロフィール欠落をAPI境界で分類していなかった。さらにrouteからmock loggerまでの検査を最終log sinkの証拠と誤認した。
- **対策**: 4 route familyをoperation・stage・codeだけの固定`AppError`へ統一し、raw errorやuser IDを再利用しない。exact count、UUID、timestamp、nullable profile、非負safe integer歩数、一意性、参照集合、必須プロフィールを検証し、`.maybeSingle()`の`null/errorなし`だけを正当なno-rowとして扱う。実`reportError`を通して`console.error`のJSON文字列をparseし、raw Error identity・message・code・cause・context・nested field・UUIDを直接検査する統合回帰を4 route familyへ追加し、`check:rules`でその存在を固定する。
- **教訓**: social APIの成功はqueryがrejectしなかったことではなく、依存結果が完全かつ契約どおりであることを証明してから返す。記録済み0歩と未記録は維持しつつ、部分データ・重複・不正shapeを空・0・false・dropへ変換しない。ログ秘匿はmock引数やsource grepだけで完了とせず、実loggerの最終sinkをparseして確認する。`JSON.stringify(Error)`に頼らず、構造化JSONのkey/valueとconsole引数のraw identityを直接検査する。リファレンス: `app/api/user/follow-error-sink.test.ts`, `app/api/user/following/route.ts`, `app/api/user/followers/route.ts`, `app/api/user/follow/route.ts`, `app/api/user/follow/status/route.ts`

### LL-100: グループ比較の複数OFFSETと成功形fallbackは完全性を証明しない

- **事象**: `group-comparison-service`がSupabase障害とgroup/page識別子を直接ログへ渡し、欠落プロフィールをUnknown、不正歩数を0へ変換していた。歩数は安定順序もexact count照合もない複数OFFSET要求を結合し、更新中の集合を完全な比較データとして扱っていた。
- **根本原因**: TypeScriptのquery型とfilterを実行時shape・参照整合性の保証とみなし、正当な空/記録済み0と依存障害・欠落・外部参照・重複・unsafe値を分類していなかった。stable orderと複数HTTP要求が同じMVCC snapshotを共有すると誤認し、汎用callerも元例外とgroup/user IDを再ログしていた。
- **対策**: member/profile/step結果を`unknown`からexact count、UUID、参照集合、一意性、表示名、ISO日付、非負safe integerで検証し、固定`AppError`だけを投げる。callerは比較専用reporterでoperation・stage・codeだけを再固定化し、実`reportError`の構造化JSONまで非露出を検証する。複数OFFSETを単一のexact-count要求へ置換し、1,000行超・件数不一致を明示失敗にする。
- **教訓**: stable orderはsnapshotではなく、アプリ側の複数照会でメンバー集合と歩数集合の同時点整合性は証明できない。上限超または厳密な同時点比較が必要なら、DB内のtransactional集約RPCを別タスクで設計し、それまでは部分結果を成功として返さない。リファレンス: `lib/services/group-comparison-service.ts`, `lib/__tests__/group-comparison-service.test.ts`, `app/[locale]/groups/[groupId]/page.tsx`
