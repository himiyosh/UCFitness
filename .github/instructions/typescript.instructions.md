---
applyTo: "**/*.{ts,tsx}"
---

# TypeScript 開発ガイドライン

UCFitness (TypeScript 5.x, ES2022) のコーディング規約。

## 型安全性

- `any` の使用は最小限に — やむを得ない場合は `// eslint-disable-next-line @typescript-eslint/no-explicit-any` を付与
- `unknown` を `any` の代わりに使用し、型ガードで絞り込む
- 戻り値の型は明示する（特に公開 API/ユーティリティ関数）
- `as` によるキャストは最小限に — 型ガード (`instanceof`, `in`, `typeof`) を優先

## Null Safety

- Strict null checks を前提にコーディング
- Optional chaining (`?.`) と Nullish coalescing (`??`) を活用
- Non-null assertion (`!`) は避け、適切なチェックを行う

## インターフェース & 型定義

- コンポーネント Props は `interface` で定義
- ユーティリティ型（`Pick`, `Omit`, `Partial`, `Record`）を活用
- 列挙は `const enum` または union 型を使用

```tsx
// ✅ Props は interface で定義
interface CardProps {
  title: string;
  description?: string;
  onClick: () => void;
}
```

## import / export

- 型のみの import は `import type` を使用
- barrel export (`index.ts`) は必要最小限に — ツリーシェイキングに影響
- 未使用の import は残さない

```ts
import type { User } from "@/types";
```

## 命名規則

- コンポーネント: PascalCase (`UserProfile`)
- 関数・変数: camelCase (`getUserData`)
- 型・インターフェース: PascalCase (`UserData`, `CardProps`)
- 定数: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- ファイル: コンポーネントは PascalCase、その他は camelCase

## エラーハンドリング

- `try/catch` でエラーを適切にハンドル
- catch したエラーは `unknown` 型として扱い、型ガードで判定
- エラーは握りつぶさず、ログ記録またはユーザーへの通知を行う
