# UCFitness — GitHub Copilot 共通指示

## アプリケーション概要

UCFitness は Fitbit 連携の歩数トラッキング・フィットネス競争アプリ (PWA)。

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router), React 19, TypeScript
- **スタイリング**: Tailwind CSS v4, CSS カスタムプロパティ (テーマ)
- **認証**: NextAuth v5 (beta)
- **DB**: Supabase (PostgreSQL)
- **i18n**: next-intl (ja/en)
- **デプロイ**: Cloudflare Pages
- **チャート**: Recharts

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
- **最小タッチターゲット**: ボタン・リンクは最低 **44×44px** のタップ領域を確保する（`min-h-[44px] min-w-[44px]`）
- **横スクロール禁止**: `overflow-x-hidden` を意識し、`w-screen` や固定幅（`w-[500px]` 等）を使わない
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
11. **Portal 座標は 2-probe affine 変換で `body { zoom }` を逆補正する** — `body { zoom: 0.9 }` 環境下では `getBoundingClientRect()` が viewport 座標を返すが、`position: fixed` の `top/left` は zoom 後の CSS 座標系で解釈される。probe(0,0) だけでは `0×zoom=0` のため乗算的ずれを検出不可。`position:fixed;top:0` と `top:100px` の 2 要素で `scale = (r2 - r1) / 100` を算出し、`(coord - offset) / scale` で逆変換する。リファレンス: `GroupReactions.tsx` の `detectCoordinateTransform()`
12. **Portal ピッカーのカード中央配置** — ピッカーはトリガーボタンではなく親カード基準で中央配置する。カードの wrapper div に `data-reaction-card` 属性を付与し、`triggerEl.closest('[data-reaction-card]')` でカード要素を取得。カード中心を基準に `translateX(-50%)` する。リファレンス: `GroupGear.tsx`, `TrendingGear.tsx`
13. **Portal ↔ トリガー間のホバーギャップは既知制限** — Portal は DOM ツリー上でトリガーの子孫ではないため、カード `mouseleave` → Portal `mouseenter` 間にギャップが発生しピッカーが閉じうる。`isHoveringPickerRef` による部分緩和のみ。**現在の実装（fb07776）がユーザー承認済みの安定状態であり、この動作を変更する場合は必ずユーザーに確認すること**
14. **この仕様を変更する場合は必ずユーザーに確認すること**

### アクセシビリティ（a11y）

**PWA としてすべてのユーザーがアクセスできることを保証する。**

- **セマンティック HTML を使用** — `<button>`, `<nav>`, `<main>`, `<section>`, `<article>` 等を適切に使い、`<div onClick>` でボタンを代用しない
- **画像には必ず `alt` 属性を設定** — 装飾画像は `alt=""` + `aria-hidden="true"`
- **フォーム要素には `<label>` を紐付け** — `htmlFor` と `id` の対応、または `aria-label` を使用
- **ARIA 属性を適切に使用** — `aria-label`, `aria-describedby`, `aria-expanded`, `aria-live` 等
- **色だけに依存しない** — ステータス表示はアイコン・テキストも併用する（色覚多様性対応）
- **フォーカスインジケーターを消さない** — `outline-none` を使う場合は `focus-visible:ring-2` 等で代替スタイルを提供
- **インタラクティブ要素のロール** — クリック可能な `<div>` には `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space) を実装するか、`<button>` を使う

### コードレビューチェックリスト（Red Flags）

**コード変更時に以下の項目に該当する箇所がないか確認すること。**

#### セキュリティ

- **機密情報のログ出力** — `console.log` にパスワード、トークン、API キー、個人情報を含めていないか
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

### デプロイ制限

- `git push` は Cloudflare Pages のデプロイ制限があるため、明示的に許可があるまで実行しない

### プッシュ通知ルール

- **i18n 必須**: プッシュ通知メッセージは必ずユーザーの `language` カラム（`users` テーブル）を参照し、`lib/push-messages.ts` のローカライズ関数で生成すること。ハードコードされた文字列は禁止
- **通知集約（バッチ通知）必須**: 同一ユーザーに複数の通知（バッジ獲得等）が発生する場合、**1 通にまとめて送信**すること。バッジごとに個別通知を送信してはならない
- **新規通知追加時**: `lib/push-messages.ts` にメッセージテンプレートを追加し、ja/en 両方を定義すること
- リファレンス実装:
  - バッジ統合通知: `badge-awards.ts` の `sendConsolidatedBadgeNotification()`
  - ステップリマインダー: `cron/step-reminder/route.ts`
  - ウィークリーサマリー: `cron/weekly-summary/route.ts`

### 言語ポリシー

- コミットメッセージ: 日本語
- コードコメント: 日本語 OK
- ユーザーへの応答: 日本語サマリー + 英語本文

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
import { Link } from "@/navigation";
import UserMenu from "@/components/UserMenu";
import RefreshButton from "@/components/RefreshButton";
import NotificationBell from "@/components/NotificationBell";
import Breadcrumbs from "@/components/Breadcrumbs";
```

#### ③ 認証チェック → userId 取得 → DB ユーザー情報取得

```tsx
const session = await auth();
const t = await getTranslations("PageName");
const dashboardT = await getTranslations("Dashboard");

if (!session?.user) {
  redirect("/");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const userId = (session.user as any).id;

// 必ず supabaseAdmin で DB からユーザー情報を取得する
const { data: dbUser } = await supabaseAdmin
  .from("users")
  .select("name, image, username") // ← 最低限この3つ。ページ固有のカラムは追加OK
  .eq("id", userId)
  .single();

if (!dbUser?.username) {
  redirect("/setup");
}
```

**禁止事項:**

- `session.user.image` / `session.user.name` を表示用に直接使用してはいけない（Fitbit OAuth の値のため）
- `supabase`（非 admin）をサーバーコンポーネントで使用してはいけない（`supabaseAdmin` を使う）
- username チェック・`/setup` リダイレクトを省略してはいけない

#### ④ ルート要素

```tsx
<main className="min-h-screen bg-[var(--theme-page-bg)]">
```

#### ⑤ ヘッダー（アプリブランディング）

```tsx
<header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
  <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Link href="/" className="flex items-center gap-2 group">
        <h1
          className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity"
          style={{ fontFamily: '"Inter", sans-serif' }}
        >
          {dashboardT("title")}
        </h1>
        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20">
          {dashboardT("beta")}
        </span>
      </Link>
    </div>
    <div className="flex items-center gap-1">
      <RefreshButton />
      <NotificationBell />
      <UserMenu
        user={{
          id: userId,
          name: dbUser?.name || session.user.name,
          email: session.user.email,
          image: dbUser?.image || session.user.image,
        }}
      />
    </div>
  </div>
</header>
```

- `BackButton` はヘッダーに置かない（パンくずリストで代替）
- ヘッダー左側は常にアプリロゴ（`UCFitness` グラデーション + beta バッジ）
- **ヘッダー右側は必ず `RefreshButton` → `NotificationBell` → `UserMenu` の 3 要素を配置**（1 つでも欠けると統一性が崩れる）
- `dashboardT = await getTranslations('Dashboard')` で取得

#### ⑥ コンテンツ領域

```tsx
<div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
  {/* パンくずリスト */}
  <div className="mb-6">
    <Breadcrumbs items={[{ label: t("title") }]} />
  </div>

  {/* ページタイトル */}
  <div className="mb-8">
    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2.5">
      <span>{emoji}</span>
      <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
        {t("title")}
      </span>
    </h2>
    <p className="mt-2.5 text-base text-gray-500">{t("headerDesc")}</p>
    <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
  </div>

  {/* メインコンテンツ */}
</div>
```

- `Breadcrumbs` は Home アイコンを自動付与するため、`🏠` を手動追加しない
- ページタイトルはグラデーション + 絵文字 + 説明文 + 装飾線
- 翻訳キーに `headerDesc` を必ず含める（ja/en 両方）

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

> 以下のセクションは [unified-project-rules.md](../unified-project-rules.md) に基づき、
> JPUCSupport 組織配下の全プロジェクトで統一されたルールを UCFitness 向けに適用したもの。

### README 同期 (必須)

- コード変更時に関連する README セクションを**必ず同一コミットで更新**する
- 対象: ファイル追加/削除、ディレクトリ構造変更、機能追加/変更、API エンドポイント変更、設定ファイルの構造変更、翻訳キー追加
- 「次回更新する」という先送りは禁止
- Copilot Instructions (本ファイル) も同様 --- コード変更がルール・インストラクションに影響する場合は同一コミットで更新

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
- **`console.log` でのシークレット出力禁止**: デバッグ時もトークン・キーをログに含めない

### 社内コンプライアンスポリシー (CSS Data Policy)

> **参照ポリシー**:
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

| 操作 | ユーザー確認 |
|---|---|
| 作業ブランチへの `git push` | 不要 (自動実行 OK) |
| PR の作成 (`gh pr create`) | 不要 (自動実行 OK) |
| PR のマージ (`gh pr merge`) | **必須** |
| `main` / `master` への直接 push | **禁止** |
| 本番データの変更 (Supabase) | **必須** |
| Cloudflare Pages デプロイ (`git push`) | **必須** (デプロイ制限あり) |
| ドライラン / プレビュー | 不要 (自動実行 OK) |

### 自己改善プロトコル (Lessons Learned)

障害・未検出・誤検出・ワークフロー上の問題が発生した場合、**コード修正 + プロンプト/instruction 更新 + コミットの 3 点セット**を同一セッション内で完了する。

#### 記録フォーマット

```markdown
### LL-XXX: {タイトル}
- **事象**: {何が起きたか}
- **根本原因**: {なぜ起きたか}
- **対策**: {どう修正/予防したか}
- **教訓**: {今後の汎用的な学び}
```

#### ルール

- コード変更時に関連するプロンプトの処理フロー・ステップ説明・検証項目を**同一コミットで更新**
- **禁止**: 「次回修正します」と先送り / ユーザーに指摘されてから修正 / 説明だけでコード未修正 / コード修正だけでプロンプト未更新
