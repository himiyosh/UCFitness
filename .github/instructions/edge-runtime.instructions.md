---
applyTo: "app/**/page.tsx,app/**/route.ts"
---

# Edge Runtime & Cloudflare Pages 互換性

UCFitness は Cloudflare Pages にデプロイされるため、すべてのルートで Edge Runtime が必須。

## 必須宣言

ファイル先頭に必ず以下を記載（import の前）:

```ts
export const runtime = "edge";
```

- `layout.tsx` には不要（ページと API ルートのみ）
- 新規ファイル作成時は最初の行に必ず追加

## Node.js 専用 API の使用禁止

Edge Runtime では以下は使用不可:

- `fs`, `path`, `child_process` — 代替手段を使うこと
- `Buffer.from()` → `btoa()` / `atob()` を使用
- `crypto` → Web Crypto API (`crypto.subtle`) を使用
- `process.env` は使用可能（ただし動的アクセスは不可）

## ビルド検証

- push 前に `npx tsc --noEmit` で型チェック（キャッシュ破損しない）
- `npx next build` を実行した後は、必ず `.next` ディレクトリを削除すること
- `npx @cloudflare/next-on-pages` で Cloudflare ビルド検証

## `.next` キャッシュ破損の防止

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
```

`next build` は `.next` 内のファイルを本番用に上書きするため、`next dev` で使うキャッシュと不整合を起こす。
