---
applyTo: "**/*.test.ts,**/*.test.tsx"
---

# テスト生成ガイドライン（Vitest + React Testing Library）

## テストフレームワーク

- **テストランナー**: Vitest 4.x（Jest ではない）
- **DOM テスト**: `@testing-library/react` + `@testing-library/user-event`
- **設定ファイル**: `vitest.config.ts`（globals: true, environment: 'node', pool: 'vmForks'）
- **テストファイル命名**: `*.test.ts` / `*.test.tsx`

## 基本構造

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("モジュール名", () => {
  beforeEach(() => {
    // テストごとの初期化
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("関数名 / メソッド名", () => {
    it("正常系: 期待する動作の説明", () => {
      // Arrange
      // Act
      // Assert
    });

    it("異常系: エラーケースの説明", () => {
      // ...
    });
  });
});
```

## テスト設計原則

### ユーザー中心のテスト

- **実装の詳細ではなく、動作をテストする** — 内部 state や private メソッドを直接テストしない
- **ユーザーが見る・操作するものをテストする** — テキスト、ボタン、フォーム入力、画面遷移
- **テスト名は日本語でも OK** — `it("ログインボタンをクリックするとダッシュボードに遷移する")` のように動作を記述

### クエリの優先順位（React Testing Library）

1. **`getByRole`** — アクセシビリティロールで検索（最優先）
2. **`getByLabelText`** — フォーム要素
3. **`getByPlaceholderText`** — プレースホルダーテキスト
4. **`getByText`** — 表示テキスト
5. **`getByTestId`** — 最終手段（他で特定できない場合のみ）

```tsx
// ✅ OK: ロールで検索
const button = screen.getByRole("button", { name: "送信" });

// ❌ NG: テスト ID に頼る
const button = screen.getByTestId("submit-button");
```

### AAA パターン（Arrange-Act-Assert）

```ts
it("歩数が目標を超えた場合にコインを付与する", () => {
  // Arrange: テストデータと前提条件を準備
  const user = createTestUser({ steps: 15000, goal: 10000 });

  // Act: テスト対象の操作を実行
  const result = calculateReward(user);

  // Assert: 期待する結果を検証
  expect(result.coins).toBe(50);
  expect(result.achieved).toBe(true);
});
```

## モック（Mock）ガイドライン

### Vitest のモック API

```ts
// 関数モック
const mockFn = vi.fn();
const mockFnWithReturn = vi.fn().mockReturnValue(42);
const mockAsyncFn = vi.fn().mockResolvedValue({ data: [] });

// モジュールモック
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  },
}));

// スパイ
const spy = vi.spyOn(object, "method");
```

### モック原則

- **外部依存のみモックする** — DB、API、認証、タイマー等
- **テスト対象の内部実装はモックしない** — テスト対象の関数内の helper 関数をモックすると、リファクタ耐性が下がる
- **モックは最小限に** — 過度なモックはテストの信頼性を低下させる
- **`vi.restoreAllMocks()`** を `afterEach` で必ず呼ぶ

## コンポーネントテスト（React）

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";

import MyComponent from "@/components/MyComponent";

describe("MyComponent", () => {
  it("初期表示時にタイトルが表示される", () => {
    render(<MyComponent title="テスト" />);
    expect(screen.getByText("テスト")).toBeInTheDocument();
  });

  it("ボタンクリックでカウントが増加する", async () => {
    const user = userEvent.setup();
    render(<MyComponent />);

    await user.click(screen.getByRole("button", { name: "増加" }));
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
```

## テストカバレッジ

- **新規関数:** 最低限、正常系 + 主要な異常系をカバー
- **バグ修正:** 修正した不具合を再現するテストを必ず追加
- **既存テストが失敗した場合:** テストを安易に修正しない。実装のバグを先に疑う

## アンチパターン（禁止事項）

| ❌ やってはいけないこと | ✅ 代わりにやること |
|---|---|
| `sleep(1000)` で待機 | `waitFor()` や `findBy*` を使う |
| snapshot テストの多用 | 具体的なアサーションを書く |
| テストごとに独立していない | 各テストは他テストに依存しない |
| `any` 型でテストデータ作成 | 適切な型のテストヘルパーを用意 |
| 1 つの `it` に複数のシナリオ | 1 テスト = 1 シナリオ |
| `console.log` でデバッグ | `screen.debug()` を使う |
