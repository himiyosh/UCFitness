---
applyTo: "components/**/*.tsx"
---

# React 19 コンポーネント開発ガイドライン

UCFitness (React 19, TypeScript) のコンポーネント設計・実装パターン。

## コンポーネント設計原則

- 1 コンポーネント = 1 責務（単一責任の原則）
- Props は `interface` で明確に定義
- デフォルト値は分割代入のデフォルトで設定
- 大きなコンポーネントは小さなサブコンポーネントに分割

## テーマ & スタイリング

- CSS カスタムプロパティを使用: `var(--theme-primary)`, `var(--theme-secondary)` 等
- `dark:` クラスは使用しない（テーマシステムで対応済み）
- `framer-motion` は使用しない（CSS keyframes + Tailwind アニメーションのみ）

## 状態管理の 3 層パターン

すべてのデータ表示コンポーネントに以下の 3 状態を実装:

### ローディング状態

```tsx
if (loading) return (
  <div className="space-y-3 p-4">
    <div className="animate-pulse rounded-lg h-10 w-2/3" style={{ background: "var(--theme-secondary)" }} />
  </div>
);
```

### 空状態

```tsx
if (!data?.length) return (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <span className="text-5xl mb-4">🏃</span>
    <h3 className="text-lg font-bold" style={{ color: "var(--theme-primary)" }}>データがありません</h3>
  </div>
);
```

### エラー状態

```tsx
if (error) return (
  <div className="flex flex-col items-center py-12 text-center">
    <span className="text-4xl mb-3">⚠️</span>
    <p className="font-semibold">データの取得に失敗しました</p>
    <button onClick={() => refetch()} className="mt-4 px-4 py-2 rounded-lg text-white"
      style={{ background: "var(--theme-primary)" }}>再試行</button>
  </div>
);
```

## 確認ダイアログ

- `window.confirm()` / `window.alert()` は使用禁止
- `createPortal(…, document.body)` で viewport 中央に表示
- 破壊的操作は赤いアクションボタン + キャンセルボタンの 2 択構成
- 処理中はスピナー（`animate-spin`）+ ボタン `disabled`
- 参考実装: `LeaveGroupButton.tsx`, `RecommendedItems.tsx`

## インタラクション

- ボタンに `hover:scale-105 transition-transform` を追加
- カードに `hover:shadow-lg transition-shadow` を追加
- 送信中ボタンはスピナー付き + `disabled`

## 禁止事項

- 既存の関数・export は絶対に削除しない
- 新しい外部ライブラリは追加しない
- ファイル末尾には必ず改行を入れる
