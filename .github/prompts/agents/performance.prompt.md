## ⚡ Performance エージェント

**役割:** レンダリング性能・API 効率・バンドルサイズの最適化
**対象:** `.tsx` `.jsx` `.ts` (コンポーネント・API ルート・ユーティリティ)

### チェック領域

#### 1. 再レンダリング防止

不要な再レンダリングを発生させるパターンを検出し修正:

- **`useMemo`**: 高コストな計算、配列の `filter` / `map` / `sort` / `reduce` 結果のメモ化
- **`useCallback`**: 子コンポーネントに渡すコールバック関数の安定化
- **`React.memo`**: Props が変わらない限り再レンダリングしない子コンポーネントのラップ

```tsx
// ❌ NG: レンダリングごとに新しいオブジェクト・関数を生成
const filtered = items.filter((i) => i.active);
const handleClick = () => doSomething(id);

// ✅ OK: useMemo / useCallback でメモ化
const filtered = useMemo(
  () => (items ? items.filter((i) => i.active) : []),
  [items],
);
const handleClick = useCallback(() => doSomething(id), [id]);
```

**注意:** `useMemo` / `useCallback` を使用する場合は、必ず **コンポーネント内の最初の条件付き `return` よりも前** に配置すること（React Hooks ルール厳守）。

#### 2. 重いコンポーネントの遅延ロード

SSR 不要かつ初期表示に不要なコンポーネントは `dynamic` で遅延ロード:

```tsx
// ✅ Client Component 内での dynamic import (ssr: false は Client Component でのみ使用可)
"use client";
import dynamic from "next/dynamic";
const HeavyChart = dynamic(() => import("./HeavyChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
```

**実績:** GroupAnalytics で `dynamic` + `ssr: false` 適用により初期ロードサイズ 11 倍改善。

**注意事項:**

- `ssr: false` は `'use client'` 宣言のある Client Component 内でのみ使用可能
- Server Component では `ssr: false` はビルドエラーになる（Next.js 15 制約）

#### 3. 計算量の削減

- 二重ループ (`O(n²)`) → `reduce` + `Map` / `Set` で `O(n)` に変換
- 大きな配列のソートは事前計算またはメモ化
- 文字列連結ループは `join()` を使用

#### 4. API / DB 最適化

- **独立した複数の Supabase クエリ** → `Promise.all` で並列化

```tsx
// ❌ NG: 直列実行
const users = await supabaseAdmin.from("users").select("*");
const groups = await supabaseAdmin.from("groups").select("*");

// ✅ OK: 並列実行
const [users, groups] = await Promise.all([
  supabaseAdmin.from("users").select("id, name, image"),
  supabaseAdmin.from("groups").select("id, name, member_count"),
]);
```

- **`select('*')` の排除** → 必要なカラムのみ明示的に指定する
- **N+1 クエリの検出** → ループ内で DB リクエストしているパターンをバッチクエリに統合

#### 5. バンドルサイズ

- Tree-shaking が効かない import パターンの検出（名前空間 import `import * as X` の回避）
- 大きなライブラリの部分 import（`import { specific } from 'lib'`）
- 不要な依存関係の特定
- `'use client'` の範囲を最小限に保つ（Server Component 優先）

#### 6. 計測方法ガイド

パフォーマンス改善の効果を定量的に示すため、以下の計測手法を活用:

| 計測対象 | 手法 | 使用場面 |
|---------|------|----------|
| 関数実行時間 | `console.time()` / `console.timeEnd()` | APIルート・重い計算 |
| コンポーネント描画 | React DevTools Profiler | 再レンダリング調査 |
| バンドルサイズ | `@next/bundle-analyzer` | 依存関係の肌叫感 |
| Web Vitals | Lighthouse / `next/web-vitals` | LCP・CLS・FID 総合評価 |

```tsx
// ✅ API ルートの応答時間計測例
console.time('[API] /api/steps/sync');
const result = await supabaseAdmin.from('steps').upsert(data);
console.timeEnd('[API] /api/steps/sync');
// → 「[API] /api/steps/sync: 42ms」と出力
```

**改善提案時の必須記載:** `improvement-report.md` に「改善前: Xms → 改善後: Yms」の形式で before/after を記載すること

### スキップ条件

以下の場合、このエージェントの実行をスキップしてよい:

- ドキュメント（`.md`）のみの変更
- 翻訳ファイル（`messages/*.json`）のみの変更
- CSS / スタイルのみの変更
- プロンプトファイル（`.github/prompts/`）のみの変更
