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
- `.tsx` / `.jsx` → 🔨Build + 🎨UI/UX + ⚡Performance + ✨FeatureEnhancement
- `.ts` / `.js` (API routes, lib/) → 🔨Build + ⚡Performance + 🔒Security
- `.css` / `.scss` → 🎨UI/UX
- `.json` (messages/) → 🔨Build (i18n キー検証)

### Step 3: 検証
- 修正ごとにコミット (コミットメッセージは日本語)
- 最後に `npx next build` で 0 エラーを確認
- `git push` は明示的に許可があるまで実行しない

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
if (loading) return (
  <div className="space-y-3 p-4">
    <div className="animate-pulse rounded-lg h-10 w-2/3" style={{background: 'var(--theme-secondary)'}}/>
    <div className="animate-pulse rounded-lg h-6 w-full" style={{background: 'var(--theme-secondary)'}}/>
  </div>
);
```

#### B. 空状態のリッチUI
データが0件の場合にアイコン + メッセージ + CTA ボタンを表示:
```tsx
if (!data?.length) return (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <span className="text-5xl mb-4">🏃</span>
    <h3 className="text-lg font-bold" style={{color: 'var(--theme-primary)'}}>まだデータがありません</h3>
    <p className="text-sm mt-2" style={{color: 'var(--foreground-muted)'}}>歩数を記録して始めましょう！</p>
  </div>
);
```

#### C. エラー状態のUI
APIエラー時にリトライボタン付きUIを表示:
```tsx
if (error) return (
  <div className="flex flex-col items-center py-12 text-center">
    <span className="text-4xl mb-3">⚠️</span>
    <p className="font-semibold">データの取得に失敗しました</p>
    <button onClick={() => refetch()} className="mt-4 px-4 py-2 rounded-lg text-white"
      style={{background: 'var(--theme-primary)'}}>再試行</button>
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
const options = items.filter(i => i.active).map(i => ({label: i.name, value: i.id}));
// After
const options = useMemo(() => items.filter(i => i.active).map(i => ({label: i.name, value: i.id})), [items]);
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
const data = await supabase.from('users').select('*').eq('id', userId);
// After: 認証付き
const session = await auth();
if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const data = await supabase.from('users').select('id,name').eq('id', session.user.id);
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
  ) : '保存'}
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

## 共通禁止事項
- **main/master への push・merge は私の承認なしに実行しない**
- `dark:` は使わない (CSS 変数 `var(--theme-primary)` 等を使用)
- `framer-motion` は使わない
- 新しい外部ライブラリは追加しない
- 既存の関数・export は絶対に削除しない
- `git push` は明示的に許可があるまで実行しない
- ファイル末尾には必ず改行を入れる
