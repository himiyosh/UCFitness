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

## ルーティング

- `Link` は `@/navigation` からインポート（next-intl 統合）
- Server Actions は `app/actions.ts` に集約
- API Routes は `app/api/` 配下に配置し、必ず `export const runtime = "edge"` を記載

## i18n (next-intl)

- Server Component: `getTranslations("Namespace")`
- Client Component: `useTranslations("Namespace")`
- 翻訳ファイル: `messages/ja.json`, `messages/en.json`
- 新規ページには最低限 `title` と `headerDesc` の翻訳キーを定義
