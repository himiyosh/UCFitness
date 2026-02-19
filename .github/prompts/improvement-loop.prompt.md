```prompt
# UCFitness 改善ループ — マルチエージェント・オーケストレーター

UCFitness プロジェクトのコード品質改善ループを **複数の専門エージェント** を協調させて実行してください。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│         🎯 オーケストレーター (このファイル)            │
│  事前チェック → ファイルルーティング → 検証 → 報告      │
└────────────┬────────────────────────────────────┬────┘
             │  runSubagent で各エージェントを起動  │
   ┌─────────▼──────────┐              ┌─────────▼──────────┐
   │ 🔨 Build Validation│              │ 🎨 UI/UX           │
   │ 型・ビルド・i18n    │              │ 操作性・視覚品質    │
   └────────────────────┘              └─────────────────────┘
   ┌─────────────────────┐             ┌─────────────────────┐
   │ 💰 Monetization     │              │ ⚡ Performance       │
   │ 広告・収益チャネル   │              │ レンダリング・API    │
   └─────────────────────┘             └─────────────────────┘
   ┌─────────────────────┐             ┌─────────────────────┐
   │ 🔒 Security         │              │ ✨ Feature Enhance  │
   │ API・入力検証        │              │ 機能完成度向上      │
   └─────────────────────┘             └─────────────────────┘
   ┌─────────────────────────────────────────────────────────┐
   │ 🔍 New Feature Discovery (サイクル末に1回)               │
   │ 新機能提案・レポート出力                                  │
   └─────────────────────────────────────────────────────────┘
```

## 作業ブランチ

`copilot/improvement-loop-1` で作業してください。
main には絶対に push/merge しないこと。

---

## 全体フロー

### Step 1: 事前チェック

1. `git branch` で現在のブランチ確認 → `copilot/improvement-loop-1` に切替
2. `npx tsc --noEmit` で型エラーチェック（**`next build` はキャッシュ破損するため使わない**）
3. `get_errors` で IDE 上のエラーも確認
4. エラーがあれば先に修正してコミット

### Step 2: サブエージェント改善ループ

対象ファイルごとに、以下の専門サブエージェントの観点で順にレビュー・改善する。
**`runSubagent` を使ってサブエージェントを起動し、並列に処理してもよい。**

**⚠️ スコープ制限:** 1サイクルあたりの変更ファイル数は **最大15ファイル** とする。
大量変更はレビュー困難・リグレッションの原因になるため、優先度の高いファイルから着手し、
残りは次のサイクルに回すこと。

#### エージェント一覧とプロンプトファイル

| # | エージェント名 | プロンプトファイル | 役割 |
|---|--------------|-------------------|------|
| 1 | 🔨 Build Validation | `.github/prompts/agents/build-validation.prompt.md` | 型エラー・ビルドエラー・i18n キー・レンダリングエラー検出 |
| 2 | 🎨 UI/UX | `.github/prompts/agents/ui-ux.prompt.md` | モダン UI/UX 品質向上 |
| 3 | 💰 Monetization | `.github/prompts/agents/monetization.prompt.md` | 広告・収益チャネルの設計最適化 |
| 4 | ⚡ Performance | `.github/prompts/agents/performance.prompt.md` | レンダリング・API・バンドル最適化 |
| 5 | 🔒 Security | `.github/prompts/agents/security.prompt.md` | API・入力検証・セキュリティ脆弱性検出 |
| 6 | ✨ Feature Enhancement | `.github/prompts/agents/feature-enhancement.prompt.md` | 既存機能の完成度向上 |
| 7 | 🔍 New Feature Discovery | `.github/prompts/agents/new-feature-discovery.prompt.md` | 新機能提案（実装はしない） |

#### ファイル種別 → エージェント・ルーティング

ファイルの種類に応じて該当するサブエージェントのみ適用:

| ファイル種別 | 適用エージェント |
|------------|-----------------|
| `.tsx` / `.jsx` | 🔨Build + 🎨UI/UX + 💰Monetization + ⚡Performance + ✨FeatureEnhancement |
| `.ts` / `.js` (API routes, lib/) | 🔨Build + ⚡Performance + 🔒Security |
| `.css` / `.scss` | 🎨UI/UX |
| `.json` (messages/) | 🔨Build (i18n キー検証) |

#### サブエージェント起動方法

各サブエージェントを起動する際は、プロンプトファイルの内容を `read_file` で読み込み、
`runSubagent` の `prompt` パラメーターにその内容 + 対象ファイル情報を渡す。

```
手順:
1. read_file で該当する agents/*.prompt.md を読み込む
2. runSubagent を呼び出し:
   - prompt: 読み込んだプロンプト内容 + "対象ファイル: [ファイルパス]" + "共通禁止事項" (後述)
   - description: エージェント名 (例: "Build Validation")
3. エージェントの結果を受け取り、修正内容を確認
4. 修正ごとにコミット
```

**各 Cycle の最後に** 🔍 New Feature Discovery をプロジェクト全体に対して1回実行する。

### Step 3: 検証

- 修正ごとにコミット (コミットメッセージは日本語)
- 最後に `npx tsc --noEmit` で型エラー 0 を確認（`next build` はキャッシュ破損するため原則使わない）
- 変更したファイルに対して `get_errors` で IDE エラーがないことを確認
- `git push` は明示的に許可があるまで実行しない
- **改善レポート更新**: 各サイクルで行った改善内容を `improvement-report.md` に追記する（全サブエージェントの結果を含む）

### Step 4: dev サーバー再起動

1. **不要ターミナルの削除**: `kill_terminal` で以前のバックグラウンドターミナルをすべて削除
2. **ポート 3000 を確保**: `Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }` を実行
3. **`.next` キャッシュ削除**: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue`
4. **dev サーバー起動**: `npm run dev` を `isBackground: true` で実行
5. **起動確認**: `get_terminal_output` でポート 3000 で起動したことを確認し、ユーザーに報告

### Step 5: 🧠 プロンプト自己学習（分散追記）

サイクル完了後、以下の条件に該当するパターンが見つかった場合、
**該当するサブエージェントのプロンプトファイル** (`.github/prompts/agents/*.prompt.md`) に新しいルールを自動追記する。

#### 追記先の決定

| 追記トリガー | 追記先ファイル |
|------------|--------------|
| ビルド・型・i18n 関連のパターン | `agents/build-validation.prompt.md` |
| UI/UX の共通バグ・デザインパターン | `agents/ui-ux.prompt.md` |
| 広告・収益関連のパターン | `agents/monetization.prompt.md` |
| パフォーマンス最適化パターン | `agents/performance.prompt.md` |
| セキュリティ脆弱性パターン | `agents/security.prompt.md` |
| 機能改善の共通パターン | `agents/feature-enhancement.prompt.md` |
| 共通禁止事項・リグレッション | **このファイル** (オーケストレーター) |

#### 追記トリガー条件（いずれか1つ以上に該当）

1. **同一パターンの修正を2回以上行った場合**
   - 例: 同じ種類の CSS バグを複数ファイルで修正 → `agents/ui-ux.prompt.md` にルール追加
2. **ユーザーからの指示・修正フィードバックがあった場合**
   - 例: 「この書き方はやめて」「こっちのパターンを使って」→ 対応エージェントファイルに禁止/推奨パターン追加
3. **copilot-instructions.md に記載があるがプロンプトに反映されていないルールを発見した場合**
   - 例: copilot-instructions にモバイルファーストの詳細ルールがあるが prompt に未記載 → 追加
4. **新しい技術的制約を発見した場合**
   - 例: Edge Runtime で使えない API を発見 → `agents/build-validation.prompt.md` に追加

#### 追記の方法

- **フォーマット**: 既存のチェック項目と同じ Markdown 形式（番号付きリスト or 箇条書き）
- **過去のバグへの言及**: `（過去にN回修正した問題）` のようなコメントを添えて、なぜそのルールが存在するかを明示する
- **コミット**: プロンプト更新も通常の改善と同様にコミット対象に含める（コミットメッセージ例: `[Docs] 改善ループプロンプト更新: Flexbox中央揃えルール追加`）

#### 追記しないもの

- 一度しか発生していない個別のバグ修正（プロンプトが肥大化するため）
- プロジェクト固有のビジネスロジック（それは copilot-instructions.md に書くべき）
- 既にプロンプトに記載済みのルールの重複

---

## 共通禁止事項

**以下のルールは全サブエージェントに共通で適用される。`runSubagent` 起動時に必ず含めること。**

- **main/master への push・merge は私の承認なしに実行しない**
- `dark:` は使わない (CSS 変数 `var(--theme-primary)` 等を使用)
- `framer-motion` は使わない
- 新しい外部ライブラリは追加しない
- 既存の関数・export は絶対に削除しない
- `git push` は明示的に許可があるまで実行しない
- ファイル末尾には必ず改行を入れる

## ⚠️ リグレッション防止ルール

### 変更前の確認

- 変更対象ファイルの**既存の動作を理解してから**修正に着手する
- 特に他ファイルから import されている関数・型・コンポーネントの変更は慎重に行う
- `grep_search` でファイル名や関数名を検索し、影響範囲を確認する

### 変更後の確認

- 変更したファイルごとに `get_errors` で IDE エラーがないことを確認
- 関連する import 元のファイルもエラーチェック対象に含める
- **同じ問題を複数回修正しない** — 過去に「垂直中央揃え」で6回コミットした教訓から、初回で正しいパターンを適用すること

### 変更しすぎの兆候

以下の場合はサイクルを打ち切り、コミット・報告する:
- 1ファイルの修正が 50行以上 の差分になった場合 → 変更が大きすぎないか再確認
- 修正が別の箇所を壊している場合 → 元に戻して別アプローチを検討
- 3回以上同じファイルを再修正している場合 → 根本原因を見直す
```

