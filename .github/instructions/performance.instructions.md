---
applyTo: "**/*.{ts,tsx}"
---

# パフォーマンス最適化ベストプラクティス

UCFitness のフロントエンド・バックエンド両面でのパフォーマンス最適化ルール。

## React レンダリング最適化

### 不要な再レンダリング防止

- 毎レンダー新規作成されるオブジェクト/配列を `useMemo` でメモ化
- インラインコールバック `onClick={() => handle(id)}` を `useCallback` に変換
- 重い子コンポーネントを `React.memo` でラップ

```tsx
// ❌ 毎レンダー新規作成
const options = items.filter(i => i.active).map(i => ({ label: i.name, value: i.id }));

// ✅ useMemo でメモ化
const options = useMemo(
  () => items?.filter(i => i.active).map(i => ({ label: i.name, value: i.id })) ?? [],
  [items]
);
```

### 重いコンポーネントの遅延ロード

- Recharts チャート、モーダル等を `dynamic(() => import(...), { ssr: false })` で遅延
- **⚠️ `{ ssr: false }` の付け忘れ注意**: Recharts は `{ ssr: false }` 必須（SSR エラー防止）
- 必ず loading フォールバックを提供

```tsx
const Chart = dynamic(() => import("@/components/MyChart"), {
  ssr: false,
  loading: () => <div className="animate-pulse h-64 rounded-lg bg-gray-100" />,
});
```

## 計算量の削減

- `filter().map()` を `reduce` に統合できる場合は統合
- ループ内の `find` / `filter` を `Map` / `Set` で置換
- 条件付き early return で不要な処理をスキップ

## API・DB 最適化

- 並列実行可能な `await` を `Promise.all()` に統合
- Supabase クエリで不要なカラムを `select` から除外
- `select('*')` → 必要カラムのみ明示指定

```ts
// ❌ 逐次実行
const user = await getUser(id);
const stats = await getStats(id);

// ✅ 並列実行
const [user, stats] = await Promise.all([getUser(id), getStats(id)]);
```

## バンドルサイズ

- 大きなライブラリ（Recharts 等）は `dynamic` で遅延ロード
- 未使用の import を残さない
- Server Component で処理可能なデータ加工は Client に送らない

## 画像・アセット

- 画像は `next/image` の `<Image>` コンポーネントを使用
- `loading="lazy"` でビューポート外画像を遅延ロード
- 適切な `width` / `height` を指定して CLS を防止
