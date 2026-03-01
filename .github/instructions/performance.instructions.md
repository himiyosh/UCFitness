---
applyTo: "**/*.{ts,tsx}"
---

# パフォーマンス最適化ベストプラクティス

UCFitness のフロントエンド・バックエンド両面でのパフォーマンス最適化ルール。

## 基本原則

- **計測してから最適化** — プロファイラやベンチマークで実際のボトルネックを特定してから最適化する。推測で最適化しない
- **頻度の高いパスを重点的に** — 稀にしか通らないコードパスには過度な最適化を行わない
- **保守性とのバランス** — 明快で読みやすいコードを優先し、必要な場合のみ最適化を適用

## React レンダリング最適化

### 不要な再レンダリング防止

- 毎レンダー新規作成されるオブジェクト/配列を `useMemo` でメモ化
- インラインコールバック `onClick={() => handle(id)}` を `useCallback` に変換
- 重い子コンポーネントを `React.memo` でラップ
- `key` プロパティには安定した一意値を使用 — 配列 `index` を `key` に使わない

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

### イベントハンドリング

- scroll / resize / input イベントは `debounce` / `throttle` で頻度を制限
- `useEffect` のクリーンアップでイベントリスナー・タイマーを確実に解除（メモリリーク防止）

## 計算量の削減

- `filter().map()` を `reduce` に統合できる場合は統合
- ループ内の `find` / `filter` を `Map` / `Set` で置換（O(n) → O(1) ルックアップ）
- 条件付き early return で不要な処理をスキップ
- O(n²) 以上のアルゴリズムが含まれていないかレビュー時に確認

## API・DB 最適化

- 並列実行可能な `await` を `Promise.all()` に統合
- Supabase クエリで不要なカラムを `select` から除外
- `select('*')` → 必要カラムのみ明示指定
- **N+1 クエリ禁止**: ループ内で DB リクエストしない — バッチ/JOIN で統合
- 大量データは `LIMIT` / ページネーションで制限
- ストリーミング処理が可能な場合は全データのメモリロードを避ける

```ts
// ❌ 逐次実行
const user = await getUser(id);
const stats = await getStats(id);

// ✅ 並列実行
const [user, stats] = await Promise.all([getUser(id), getStats(id)]);
```

## キャッシュ戦略

- 高頻度アクセスデータにはキャッシュを検討
- キャッシュの無効化戦略を明確にする（TTL / イベントベース）
- 機密データや揮発性の高いデータはキャッシュしない

## バンドルサイズ

- 大きなライブラリ（Recharts 等）は `dynamic` で遅延ロード
- 未使用の import を残さない
- Server Component で処理可能なデータ加工は Client に送らない
- tree-shaking が効くようにライブラリの個別モジュールからインポート

## 画像・アセット

- 画像は `next/image` の `<Image>` コンポーネントを使用
- `loading="lazy"` でビューポート外画像を遅延ロード
- 適切な `width` / `height` を指定して CLS を防止
- WebP / AVIF 等のモダンフォーマットを優先

## ネットワーク最適化

- `<link rel="preload">` でクリティカルリソースを先読み
- `font-display: swap` でフォントの非ブロッキングロードを保証
- レスポンスは gzip / Brotli で圧縮

## パフォーマンスレビューチェックリスト

コード変更時に以下を確認:

- [ ] O(n²) 以上の計算量がないか
- [ ] N+1 クエリがないか
- [ ] 不要な再計算・再レンダリングがないか
- [ ] 大量ペイロードにページネーション/ストリーミングを適用しているか
- [ ] 未使用 import・デッドコードが残っていないか
- [ ] メモリリークの原因（未クリーンアップのリスナー等）がないか
