---
applyTo: "**/*.{test,spec}.{ts,tsx}"
---

# Playwright & Vitest テストガイドライン

UCFitness のテスト作成・実行のベストプラクティス。

## 基本原則

- **実装ではなく動作をテスト** — private な内部実装には依存しない
- **テスト間の独立性** — 各テストは他のテストの結果に依存しない
- **既存テスト変更は慎重に** — テスト失敗時はまず実装のバグを疑う
- **テスト対象のコードを変更しない** — テストしやすいよう本番コードを変更するのではなく、コードをそのままテストする

## Vitest (ユニットテスト)

### テスト構造

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

describe("関数名 / コンポーネント名", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
- テストごとに `vi.restoreAllMocks()` でリセット（`afterEach` 推奨）
- **テスト対象の内部実装はモックしない** — 外部依存（DB, API, 認証, タイマー）のみモック

### カバレッジ

- 新規ユーティリティ関数にはテストを追加
- エッジケース（null, undefined, 空配列, 境界値）をカバー
- ハッピーパス + エラーパスの両方をテスト
- `sleep(1000)` は使わない → `waitFor()` / `findBy*` を使用

### コンポーネントテスト指針

| 種別 | テスト内容 | モック対象 |
|------|-----------|-----------|
| ユーティリティ関数 (`lib/`) | 純粋な入出力テスト。境界値・エッジケース網羅 | 外部 API のみ |
| カスタム Hooks (`hooks/`) | `renderHook` で戻り値・状態変化を検証 | API・タイマー |
| Client Component | ユーザー操作 → UI 変化を検証 | API・router・翻訳 |
| API Route (`app/api/`) | Request → Response のステータスコード・ボディ検証 | DB・認証 |

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

- **クエリ優先順位**: `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByTestId`（最終手段）
- `waitForSelector` より `expect(...).toBeVisible()` の自動待機を活用
- テストごとに独立した状態を保つ（テスト間の依存なし）
- アクセシビリティ機能・キーボードナビゲーションもテスト
- ページ横overflowは`scrollWidth - clientWidth <= 0`で判定する。Linux Chromiumではスクロールバー幅等により負値になり得るため、厳密な`0`一致を要求しない

## 共通ルール

- テスト名は日本語 OK（何をテストしているか明確に）
- テスト名は 3 パート構造: `対象_条件_期待結果`
- 1 テスト = 1 シナリオ（複数シナリオを詰め込まない）
- 既存テストが失敗した場合、テストコードの修正より実装のバグを疑う
- テスト修正が必要な場合はユーザーに確認

## アンチパターン（禁止）

- `sleep(ms)` によるハードウェイト → `waitFor()` / `findBy*`
- snapshot テスト多用 → 具体的アサーション
- テスト対象の内部実装への直接アクセス
