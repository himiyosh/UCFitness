# UCFitness 改善ループ

UCFitness プロジェクトのコード品質改善ループを実行してください。

## 作業ブランチ

`copilot/improvement-loop-1` で作業してください。
main には絶対に push/merge しないこと。

---

## 全体フロー

### Step 1: 事前チェック

1. `git branch` で現在のブランチ確認 → `copilot/improvement-loop-1` に切替
2. `npx tsc --noEmit` で型エラーチェック
3. `npx next build` でビルドエラーチェック
4. エラーがあれば先に修正してコミット

### Step 2: サブエージェント改善ループ

対象ファイルごとに、以下の5つの専門サブエージェントの観点で順にレビュー・改善する。
各サブエージェントの詳細指示は後述。**サブエージェント (runSubagent) を使って並列に処理してもよい。**

ファイルの種類に応じて該当するサブエージェントのみ適用:

- `.tsx` / `.jsx` → 🔨Build + 🎨UI/UX + 💰Monetization + ⚡Performance + ✨FeatureEnhancement
- `.ts` / `.js` (API routes, lib/) → 🔨Build + ⚡Performance + 🔒Security
- `.css` / `.scss` → 🎨UI/UX
- `.json` (messages/) → 🔨Build (i18n キー検証)

**各 Cycle の最後に** 🔍NewFeatureDiscovery をプロジェクト全体に対して1回実行する。

### Step 3: 検証

- 修正ごとにコミット (コミットメッセージは日本語)
- 最後に `npx tsc --noEmit` で型エラー 0 を確認（`next build` はキャッシュ破損するため原則使わない）
- `git push` は明示的に許可があるまで実行しない

### Step 4: dev サーバー再起動

1. **不要ターミナルの削除**: `kill_terminal` で以前のバックグラウンドターミナルをすべて削除
2. **ポート 3000 を確保**: `Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }` を実行
3. **`.next` キャッシュ削除**: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue`
4. **dev サーバー起動**: `npm run dev` を `isBackground: true` で実行
5. **起動確認**: `get_terminal_output` でポート 3000 で起動したことを確認し、ユーザーに報告

---

## 🔨 サブエージェント 1: Build Validation

**役割:** ビルドエラー・型エラー・翻訳キー不足・レンダリングエラーの検出と修正
**対象:** `.ts` `.tsx` `.js` `.jsx` `.json`

### チェック項目

#### 1. TypeScript コンパイルエラー

- 型の不整合、未使用 import、missing module

#### 2. Next.js ビルドエラー

- Server/Client Component の不正な混在、dynamic import の問題

#### 3. 翻訳キーの不足

- `useTranslations` / `getTranslations` で使用するキーが `ja.json` / `en.json` に存在するか
- 両言語ファイル間でキーが同期されているか

#### 4. Supabase クエリの型安全性

- `select()` のカラム名が実際のテーブルスキーマと一致するか

#### 5. React Rules of Hooks 違反

- ❌ 条件分岐 (if/else) や early return の**後に** Hooks が呼ばれている
- ❌ ループ / ネストされた関数 / コールバックの内部で Hooks が呼ばれている
- ✅ すべての Hooks はコンポーネントのトップレベルで、条件分岐や return 文の前に宣言する
- ✅ 修正方法: Hooks を条件分岐の前に移動し、early return は全 Hooks 宣言の後に配置

#### 6. React レンダリングエラー

- **SSR/CSR ハイドレーションミスマッチ**: `typeof window !== 'undefined'` で分岐した JSX、`Date.now()` / `Math.random()` の直接使用、不正な HTML ネスト (`<p>` 内の `<div>` 等)
- **レンダリング中の副作用**: render 内で `setState()` 直接呼出し (無限ループ)、DOM 操作、`fetch()` 直接実行 → 必ず `useEffect` 内に配置
- **条件付きレンダリング**: `&&` で `0` や `""` がフォールスルー → `{count > 0 && <Tag/>}` を使用
- **Server/Client Component 境界**: Server Component で `useState`/`useEffect`/`onClick` を使用していないか、`useTranslations` (Client) vs `getTranslations` (Server)
- **key prop**: リスト内の要素に key 未設定、index を key に使用 (動的リスト)、重複 key
- **非同期コンポーネント**: Client Component を async で定義していないか
- **useEffect 依存配列**: オブジェクトリテラル直書きで無限ループ、依存変数の漏れ

### 判断基準

- エラーがなければ修正しない
- 既存の関数・export は絶対に削除しない
- ロジックの変更は最小限 — エラー修正のみ

---

## 🎨 サブエージェント 2: UI/UX

**役割:** モダンWebアプリの UI/UX 品質向上 (Vercel/Stripe/Linear レベルの洗練度を目指す)
**対象:** `.tsx` `.jsx` `.css` `.scss`

### 必ず以下のいずれかを実装すること (最低1つ)

#### A. ローディング状態の追加

データ取得中にコンポーネント形状に合わせたスケルトンを表示:

```tsx
if (loading)
  return (
    <div className="space-y-3 p-4">
      <div
        className="animate-pulse rounded-lg h-10 w-2/3"
        style={{ background: "var(--theme-secondary)" }}
      />
      <div
        className="animate-pulse rounded-lg h-6 w-full"
        style={{ background: "var(--theme-secondary)" }}
      />
    </div>
  );
```

#### B. 空状態のリッチUI

データが0件の場合にアイコン + メッセージ + CTA ボタンを表示:

```tsx
if (!data?.length)
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-4">🏃</span>
      <h3
        className="text-lg font-bold"
        style={{ color: "var(--theme-primary)" }}
      >
        まだデータがありません
      </h3>
      <p className="text-sm mt-2" style={{ color: "var(--foreground-muted)" }}>
        歩数を記録して始めましょう！
      </p>
    </div>
  );
```

#### C. エラー状態のUI

APIエラー時にリトライボタン付きUIを表示:

```tsx
if (error)
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <span className="text-4xl mb-3">⚠️</span>
      <p className="font-semibold">データの取得に失敗しました</p>
      <button
        onClick={() => refetch()}
        className="mt-4 px-4 py-2 rounded-lg text-white"
        style={{ background: "var(--theme-primary)" }}
      >
        再試行
      </button>
    </div>
  );
```

#### D. ボタン・フォームのインタラクション強化

- ボタンに `hover:scale-105 transition-transform` を追加
- 送信中ボタン: `disabled` + スピナーアニメーション
- 破壊的操作前に `window.confirm()` で確認

#### E. トランジション・アニメーション

- リストアイテムに opacity + translateY アニメーション
- カードに hover shadow トランジション

### 判断基準

- **コメント追加・変数名変更・import 整理だけの変更は禁止** — 実質的な UI コード変更が必要
- テーマ: `var(--theme-primary)`, `var(--theme-secondary)` 等の CSS 変数を使用。`dark:` は不使用
- framer-motion は使わない (CSS keyframes と Tailwind アニメーションのみ)
- 既存の関数・export を削除しない
- **広告・収益化スペースとの共存**: UI 改善時は、広告バナーやアフィリエイトウィジェットが配置される可能性のあるエリア（ページ下部、コンテンツ間の余白、サイドバー相当領域）を潰さないこと。適切な `margin` / `padding` / `gap` を確保する

---

## 💰 サブエージェント 2.5: Monetization

**役割:** 収益化（Amazon アフィリエイト・AdSense）を前提としたページ構造・広告配置スペースの設計レビュー
**対象:** `.tsx` `.jsx` (ページコンポーネント・レイアウト)

### 収益化チャネル

| チャネル | 状態 | 概要 |
|---|---|---|
| **Amazon アフィリエイト** | ✅ 実装済み | `RecommendedItems` コンポーネント、`AmazonProductSearch` コンポーネント |
| **Google AdSense** | 🔜 準備中 | 将来的にバナー広告・ネイティブ広告を設置予定 |

### チェック項目

#### 1. 広告配置スペースの確保

主要ページに広告を自然に配置できるスペースがあるかチェック:

- **ダッシュボード (`/`)**: メインコンテンツの合間、フッター上部
- **プロフィール (`/user/[username]`)**: アクティビティカード間、ページ下部
- **グループ詳細 (`/groups/[groupId]`)**: ランキング下部、メンバーリスト後
- **分析 (`/analytics`)**: チャートセクション間
- **ウォレット (`/wallet`)**: トランザクション履歴の合間
- **ショップ (`/shop`)**: 商品リスト間（ただしショップ自体の UX を阻害しない）

```tsx
{/* 広告スロット例: コンテンツセクション間 */}
<div className="my-6">
  {/* AdSense バナー (将来挿入) or アフィリエイトウィジェット */}
  <AdSlot slot="content-between" />
</div>
```

#### 2. Amazon アフィリエイトの自然な統合

- フィットネス関連商品のレコメンドが**コンテンツの流れに自然に溶け込んでいるか**
- 押し売り感のないデザインか（「おすすめ」ラベル、テーマカラーとの調和）
- レコメンド配置が UX を阻害していないか（スクロール量の増加を最小限に）
- `RecommendedItems` / `AmazonProductSearch` の配置ページが適切か

#### 3. AdSense 対応の準備設計

将来の AdSense 導入に備えて、以下を確認:

- **レスポンシブ広告枠**: コンテンツ幅 `max-w-5xl` 内に収まる広告バナー用の余白
- **コンテンツ密度**: 広告を差し込んでもスクロール体験が悪化しない程度のセクション間 `gap`
- **ファーストビュー**: ヒーローエリアやメインCTAが広告より上に表示されること
- **ポリシー遵守**: 操作ボタンと広告の距離が近すぎないこと（誤タップ防止）

#### 4. 広告スロットコンポーネント設計（提案のみ）

将来的に以下の共通コンポーネントを作成予定:

```tsx
// 広告スロット共通コンポーネント (将来実装)
interface AdSlotProps {
  slot: 'header-banner' | 'content-between' | 'sidebar' | 'footer';
  className?: string;
}
function AdSlot({ slot, className }: AdSlotProps) {
  // AdSense 準備完了後に有効化
  // Amazon アフィリエイトウィジェットも同スロットで差替可能
  return <div data-ad-slot={slot} className={className} />;
}
```

#### 5. 収益化 vs UX のバランス

- **ファーストビュー原則**: スクロールなしで見えるエリアにはメインコンテンツ優先、広告は配置しない
- **頻度制限**: 1ページあたり広告スロットは最大3箇所
- **スキップ可能性**: 広告がコンテンツ閲覧の壁にならないこと
- **テーマ調和**: 広告コンテナはアプリのデザインシステム（`rounded-xl`, `border`, `shadow-sm`）に合わせる

### 判断基準

- **この段階では広告コンポーネントの実装はしない** — スペース確保とレイアウト設計のみ
- 既存の UX を劣化させる広告配置は提案しない
- Amazon アフィリエイトの既存コンポーネントの配置改善は実施してよい
- AdSense は「準備中」のため、スペース確保の提案のみ（コード挿入不要）
- 収益化の提案は `improvement-report.md` に記録する

---

## ⚡ サブエージェント 3: Performance

**役割:** 測定可能なパフォーマンス改善
**対象:** `.ts` `.tsx` `.js` `.jsx`

### 具体的に探すべきパターン (優先順)

#### 1. 不要な再レンダリング防止

- 毎レンダー新規作成されるオブジェクト/配列を `useMemo` でメモ化
- インラインコールバック `onClick={() => handle(id)}` を `useCallback` に変換
- 重い子コンポーネントを `React.memo` でラップ

```tsx
// Before
const options = items
  .filter((i) => i.active)
  .map((i) => ({ label: i.name, value: i.id }));
// After
const options = useMemo(
  () =>
    items.filter((i) => i.active).map((i) => ({ label: i.name, value: i.id })),
  [items],
);
```

#### 2. 重いコンポーネントの遅延ロード

- Recharts チャート、モーダル等を `dynamic(() => import(...), { ssr: false })` で遅延

#### 3. 計算量の削減

- `filter().map()` を `reduce` に統合
- ループ内の `find`/`filter` を `Map`/`Set` で置換
- 条件付き early return で不要な処理をスキップ

#### 4. API・DB 最適化

- 並列実行可能な `await` を `Promise.all()` に統合
- Supabase クエリで不要なカラムを `select` から除外

### 判断基準

- コメント追加のみ・変数名変更のみの変更は禁止
- 既存の動作を変えない — 最適化のみ
- 既存の関数・export を絶対に削除しない

---

## 🔒 サブエージェント 4: Security

**役割:** 実際に悪用可能な脆弱性の検出と修正
**対象:** API routes (`app/api/`), `actions.ts`, `middleware.ts`, `lib/auth.ts` 等

### 具体的に探すべき脆弱性 (実際の問題のみ)

#### API エンドポイント (route.ts)

- **入力値の未検証**: ユーザー入力を型チェックなしで使用
- **認証チェックの欠落**: `auth()` なしでデータアクセス
- **IDOR**: 他ユーザーのデータにアクセス可能
- **エラーメッセージでの機密情報リーク**: スタックトレースや内部 ID の露出

```ts
// Before: 認証なし
const userId = body.userId;
const data = await supabase.from("users").select("*").eq("id", userId);
// After: 認証付き
const session = await auth();
if (!session?.user?.id)
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const data = await supabase
  .from("users")
  .select("id,name")
  .eq("id", session.user.id);
```

#### クライアントコンポーネント (.tsx)

- `dangerouslySetInnerHTML` の使用
- URL パラメータの未サニタイズ使用
- `localStorage` への機密情報保存

### 判断基準

- 「念のため」の過剰な防御コードの追加は禁止
- DOMPurify 等の新しいライブラリの追加は禁止
- セキュリティ問題がないコードは修正しない
- 既存の関数・export を削除しない

---

## ✨ サブエージェント 5: Feature Enhancement

**役割:** 既存コンポーネントに不足している UX パターン・小機能を追加
**対象:** `.tsx` `.jsx`

### 必ず1つ以上追加すること

#### A. 状態管理の3層 (最重要)

コンポーネントに該当するものを全て追加:

- **ローディング状態**: データ取得中のスケルトン表示
- **空状態**: データ0件時のリッチ UI (アイコン + メッセージ + CTA)
- **エラー状態**: API エラー時のリトライボタン付き UI

#### B. ボタン・フォームの強化

- 送信ボタンにローディング状態 (`disabled` + スピナー)
- 破壊的操作 (削除・退会) の前に `window.confirm()` で確認

```tsx
<button disabled={isSubmitting} className="relative ...">
  {isSubmitting ? (
    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
  ) : (
    "保存"
  )}
</button>
```

#### C. 視覚的フィードバック

- カードに `hover:shadow-lg transition-shadow` を追加
- ボタンに `hover:scale-105 transition-transform` を追加

### 判断基準

- コメントだけの追加は禁止 — 具体的なコードを追加すること
- 既存のロジックは変更しない — UX パターンの追加のみ
- 既存の関数・export を絶対に削除しない

---

## 🔍 サブエージェント 6: New Feature Discovery

**役割:** サービス拡充のための新機能アイデアを探索・提案する。実装はしない — 調査と提案レポートのみ。
**対象:** プロジェクト全体 (各 Cycle の最後に1回実行)
**出力:** `improvement-report.md` に提案セクションを追記

### 分析の観点

#### 1. 競合アプリ・業界トレンド分析

現在の UCFitness の機能セット (歩数トラッキング、グループ競争、コイン経済、バッジ、ショップ) と
一般的なフィットネス／ウェルネスアプリのトレンドを比較し、不足している機能を特定する:

- **ソーシャル機能**: フレンド機能、アクティビティフィード、チャレンジ招待、リアクション
- **ゲーミフィケーション**: デイリーミッション、シーズンイベント、実績ツリー、レベルシステム
- **ヘルス連携**: 睡眠データ、心拍数、消費カロリー、水分摂取記録
- **コミュニティ**: グループチャット、掲示板、写真シェア
- **パーソナライゼーション**: AIコーチ、適応型目標設定、ウィークリーレポート

#### 2. 既存コードベースからの拡張ポイント発見

コードベースを分析し、**既存の仕組みを活用して低コストで追加できる機能**を優先的に提案:

```
例:
- coin_transactions テーブルが既にある → ギフト送信、フレンド間コイン交換
- user_badges が既にある → バッジコレクション画面、レアバッジ表示
- group_members が既にある → グループ内チャレンジ、週間MVP
- daily_steps が既にある → 週間/月間サマリー、歩数予測
- push_subscriptions が既にある → リマインダー通知、目標達成通知
```

#### 3. ユーザーエンゲージメント向上施策

- **リテンション**: ログインボーナス、連続記録報酬、離脱防止リマインダー
- **バイラル**: 招待報酬、SNSシェア、公開プロフィール
- **マネタイズ基盤**: プレミアムバッジ、限定アイテム、広告枠 (Amazon アフィリエイト拡充、AdSense 導入、プレミアムサブスクリプション)

#### 4. 技術的フィージビリティ評価

各提案に以下を付与:

- **実装難易度**: 🟢 Easy (1-2日) / 🟡 Medium (3-5日) / 🔴 Hard (1週間+)
- **必要な変更**: DB スキーマ変更、新規 API、新規コンポーネント、外部サービス連携
- **既存コードへの影響**: 破壊的変更の有無
- **期待効果**: DAU向上 / リテンション改善 / エンゲージメント増加 / 収益化

### 出力フォーマット

`improvement-report.md` に以下のフォーマットで追記:

```markdown
## 🔍 新機能提案 — Cycle N (YYYY-MM-DD)

### 🏆 優先度 High (すぐに着手すべき)

| #   | 機能名 | 概要 | 難易度 | 既存活用          | 期待効果 |
| --- | ------ | ---- | ------ | ----------------- | -------- |
| 1   | ...    | ...  | 🟢     | coin_transactions | DAU +15% |

### 📋 優先度 Medium (次スプリントで検討)

| # | 機能名 | 概要 | 難易度 | 既存活用 | 期待効果 |

### 💡 優先度 Low (バックログ)

| # | 機能名 | 概要 | 難易度 | 既存活用 | 期待効果 |

### 📐 実装設計メモ (High 項目のみ)

#### 機能名

- DB変更: ...
- API: ...
- コンポーネント: ...
- 既存ファイルへの影響: ...
```

### 判断基準

- **実装はしない** — 提案とレポートのみ
- 既存のテーブル・API・コンポーネントを最大限活用する提案を優先
- 新規外部ライブラリが必要な提案は難易度を上げる
- 技術的に実現不可能な提案は含めない
- 最低5件、最大15件の提案を含める

---

## 共通禁止事項

- **main/master への push・merge は私の承認なしに実行しない**
- `dark:` は使わない (CSS 変数 `var(--theme-primary)` 等を使用)
- `framer-motion` は使わない
- 新しい外部ライブラリは追加しない
- 既存の関数・export は絶対に削除しない
- `git push` は明示的に許可があるまで実行しない
- ファイル末尾には必ず改行を入れる
