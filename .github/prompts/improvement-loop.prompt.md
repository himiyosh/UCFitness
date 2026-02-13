# UCFitness 改善ループ

UCFitness プロジェクトのコード品質改善ループを実行してください。

## 作業ブランチ
`copilot/improvement-loop-1` で作業してください。
main には絶対に push/merge しないこと。

## 改善手順

### Step 1: 事前チェック
1. `git branch` で現在のブランチ確認 → `copilot/improvement-loop-1` に切替
2. `npx tsc --noEmit` で型エラーチェック
3. `npx next build` でビルドエラーチェック
4. エラーがあれば先に修正してコミット

### Step 2: コンポーネント改善ループ
コンポーネントを順に読み、以下の観点で改善:

#### ビルド・型エラー
- TypeScript コンパイルエラー (型の不整合、未使用 import)
- Next.js ビルドエラー (Server/Client Component 混在)
- i18n 翻訳キーの不足 (ja.json / en.json)

#### React レンダリングエラー
- **Rules of Hooks 違反**: 条件分岐や early return の後に Hooks を呼んでいないか
- **SSR/CSR ハイドレーションミスマッチ**: サーバーとクライアントで異なる出力を返していないか
- **レンダリング中の副作用**: render 内で setState、DOM 操作、fetch を直接呼んでいないか
- **条件付きレンダリング**: `&&` で 0 や空文字がフォールスルーしていないか
- **Server/Client 境界**: Server Component で useState/onClick 等を使っていないか
- **useEffect 依存配列**: オブジェクトリテラル直書きで無限ループしていないか
- **key prop**: リスト内の要素に key が設定されているか

#### UI/UX
- ローディングスケルトン・シマー効果
- エラー状態・空状態の適切な表示
- アクセシビリティ (aria-label, キーボードナビゲーション)

#### パフォーマンス
- React.memo / useMemo / useCallback の適切な使用
- 画像の遅延読み込み
- 不要な再レンダリングの最適化

#### セキュリティ
- API ルートの入力検証
- 認証チェック漏れ
- XSS 防止

### Step 3: 検証
- 修正ごとにコミット
- 最後に `npx next build` で 0 エラーを確認

## 禁止事項
- main/master への push・merge は私の承認なしに実行しない
- `dark:` は使わない (CSS 変数 `var(--theme-primary)` 等を使用)
- framer-motion は使わない
- 新しい外部ライブラリは追加しない
- 既存の関数・export は絶対に削除しない
- `git push` は明示的に許可があるまで実行しない
