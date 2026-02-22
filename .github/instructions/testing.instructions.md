---
applyTo: "**/*.{test,spec}.{ts,tsx}"
---

# Playwright & Vitest テストガイドライン

UCFitness のテスト作成・実行のベストプラクティス。

## Vitest (ユニットテスト)

### テスト構造

```ts
import { describe, it, expect, vi } from "vitest";

describe("関数名 / コンポーネント名", () => {
  it("期待する動作を説明する", () => {
    // Arrange → Act → Assert パターン
    const input = createTestData();
    const result = targetFunction(input);
    expect(result).toBe(expected);
  });
});
```

### モック

- 外部依存は `vi.mock()` でモック化
- `vi.fn()` でスパイ・スタブを作成
- テストごとに `vi.clearAllMocks()` でリセット

### カバレッジ

- 新規ユーティリティ関数にはテストを追加
- エッジケース（null, undefined, 空配列, 境界値）をカバー
- ハッピーパス + エラーパスの両方をテスト

## Playwright (E2E テスト)

### テスト構造

```ts
import { test, expect } from "@playwright/test";

test.describe("ページ名", () => {
  test("ユーザーシナリオを説明する", async ({ page }) => {
    await page.goto("/path");
    await expect(page.getByRole("heading", { name: "タイトル" })).toBeVisible();
  });
});
```

### ベストプラクティス

- `getByRole`, `getByText`, `getByLabel` を優先（テスト ID は最後の手段）
- `waitForSelector` より `expect(...).toBeVisible()` の自動待機を活用
- テストごとに独立した状態を保つ（テスト間の依存なし）

## 共通ルール

- テスト名は日本語 OK（何をテストしているか明確に）
- 既存テストが失敗した場合、テストコードの修正より実装のバグを疑う
- テスト修正が必要な場合はユーザーに確認
