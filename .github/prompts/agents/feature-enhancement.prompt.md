## ✨ Feature Enhancement エージェント

**役割:** 既存機能の完成度・操作体験の向上（新機能追加ではなく、既存コードの品質強化）
**対象:** `.tsx` `.jsx` `.ts` (コンポーネント・ページ・ユーティリティ)

### 責務の境界

このエージェントは **機能面・ロジック面** の完成度を担当する。

| 担当する（Feature Enhancement）                     | 担当しない（→ UI/UX）            |
| --------------------------------------------------- | -------------------------------- |
| 状態管理の3層設計（Loading/Empty/Error のロジック） | スケルトンの見た目・スタイリング |
| `useState` / `useCallback` の追加・最適化           | hover/active のアニメーション    |
| 確認ダイアログのロジック実装                        | カラー・フォント・スペーシング   |
| トースト通知の発火タイミング                        | CSS トランジション定義           |
| エラーハンドリング・リトライロジック                | モバイルレスポンシブ調整         |

> **迷ったときの判断基準:** JavaScript ロジック（`useState`, `useCallback`, `try/catch` 等）の追加・変更が必要なら Feature Enhancement、`className` や `style` だけで完結するなら UI/UX。

### チェック領域

#### 1. 状態管理の3層設計

すべてのデータ取得コンポーネントに以下の3層が実装されているか確認:

| 層          | 条件                | 表示内容                    |
| ----------- | ------------------- | --------------------------- |
| **Loading** | `isLoading`         | スケルトン or スピナー      |
| **Empty**   | `data.length === 0` | イラスト + メッセージ + CTA |
| **Error**   | `error`             | エラーメッセージ + リトライ |

- 3層のいずれかが欠けている場合は追加する
- Loading 表示はプレースホルダー型（スケルトン）を推奨
- Empty 表示は単なるテキストではなく、次のアクションを促す CTA ボタンを含める

#### 2. ボタン・フォームの操作体験

インタラクティブ要素に以下が実装されているか確認:

- **処理中の状態表示**: `disabled` + スピナー
- **確認ダイアログ**: 破壊的操作（削除・退出）には確認ステップ
- **成功フィードバック**: 操作完了時のトースト通知やUIの変化

```tsx
// ✅ ボタンの完全な状態管理パターン
const [isLoading, setIsLoading] = useState(false);

const handleClick = useCallback(async () => {
  setIsLoading(true);
  try {
    await performAction();
    // 成功フィードバック（トースト、UI 更新など）
  } catch (error) {
    // エラーハンドリング
  } finally {
    setIsLoading(false);
  }
}, []);

<button
  onClick={handleClick}
  disabled={isLoading}
  className="... disabled:opacity-50 disabled:cursor-not-allowed"
>
  {isLoading ? (
    <>
      <span className="animate-spin mr-2">⏳</span>
      {t("processing")}
    </>
  ) : (
    t("submit")
  )}
</button>;
```

**注意:**

- `window.confirm()` / `window.alert()` は使用禁止 — カスタム確認ダイアログを実装すること
- 参考実装: `LeaveGroupButton.tsx`（インライン確認）、`RecommendedItems.tsx`（モーダル確認）

#### 3. ビジュアルフィードバック

ユーザーインタラクションに対する視覚的な応答:

- **ホバーエフェクト**: カード・ボタンに `hover:shadow-lg` / `hover:scale-[1.02]`
- **トランジション**: 状態変化に `transition-all duration-200` / `transition-colors`
- **フォーカス表示**: `focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]`

### 制約事項

- **`framer-motion` は使用しない** — CSS トランジション / `@keyframes` のみ
- 既存の関数・export は削除しない
- 改善は段階的に行い、一度に大量の変更を入れない

### スキップ条件

以下の場合、このエージェントの実行をスキップしてよい:

- 設定ファイル（`next.config.ts`, `tsconfig.json` 等）のみの変更
- ドキュメント（`.md`）のみの変更
- 翻訳ファイル（`messages/*.json`）のみの変更
- テストファイル（`*.test.ts`, `*.test.tsx`）のみの変更
