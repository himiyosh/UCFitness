---
applyTo: "app/**/*.tsx,app/**/*.ts"
---

# Next.js 15 (App Router) ベストプラクティス

UCFitness で使用する Next.js 15 App Router の規約とパターン。

## Server Components vs Client Components

- **デフォルトは Server Component** — `'use client'` は必要な場合のみ
- Server Component でしか使えないもの: `async/await`, `getTranslations`, `auth()`, `supabaseAdmin`
- Client Component でしか使えないもの: `useState`, `useEffect`, `onClick`, `useTranslations`
- データフェッチは Server Component で行い、Client Component には props で渡す
- Client Component は小さく保つ — ページ全体を `'use client'` にせず、インタラクティブ部分だけを切り出す

### Server Component 内で Client Component を使う場合

- Client 専用ロジックは `'use client'` 宣言した専用コンポーネントに分離
- `next/dynamic` + `{ ssr: false }` は **Server Component 内では使用禁止**（ビルドエラーになる）
- Client Component は直接 import して使用する

```tsx
// ✅ Server Component で Client Component を直接使用
import InteractivePanel from "@/components/InteractivePanel"; // 'use client' 付きファイル

export default async function Page() {
  const data = await fetchData();
  return <InteractivePanel data={data} />;
}
```

## ページ構造の必須パターン

```ts
export const runtime = "edge";
// ... imports ...
export const dynamic = "force-dynamic";
```

- Server Component のページでは `supabaseAdmin`（`supabase` ではない）を使用
- `session.user.image` / `session.user.name` は OAuth 値のため直接表示に使わない → DB から取得
- `username` チェック → `/setup` リダイレクトは省略禁止

## 動的インポート

```tsx
import dynamic from "next/dynamic";

const HeavyChart = dynamic(() => import("@/components/HeavyChart"), {
  ssr: false,
  loading: () => <Skeleton />,
});
```

- Recharts 等の重いライブラリは必ず `{ ssr: false }` 付きで動的インポート
- `{ ssr: false }` は `'use client'` 宣言のある Client Component 内でのみ使用可能

## Route Handlers (API Routes)

- `app/api/` 配下に配置し、必ず `export const runtime = "edge"` を記載
- HTTP メソッドに対応した関数をエクスポート（`GET`, `POST` 等）
- 入力は常にバリデーション・サニタイズ
- **Server Component から自身の Route Handler を `fetch('/api/...')` で呼ばない** — 共通ロジックは `lib/` に切り出して直接呼ぶ（余分なサーバーホップを避ける）

## ルーティング

- `Link` は `@/navigation` からインポート（next-intl 統合）
- Server Actions は `app/actions.ts` に集約
- Route Groups `(admin)` で URL に影響せずルートをグループ化可能

## i18n (next-intl)

- Server Component: `getTranslations("Namespace")`
- Client Component: `useTranslations("Namespace")`
- 翻訳ファイル: `messages/ja.json`, `messages/en.json`
- 新規ページには最低限 `title` と `headerDesc` の翻訳キーを定義

## エラーハンドリング

- `error.tsx` で適切なエラーバウンダリを提供
- `loading.tsx` で Suspense ベースのローディング UI を提供
- `not-found.tsx` で 404 ページをカスタマイズ
