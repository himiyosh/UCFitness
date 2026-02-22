---
mode: "agent"
description: "プロジェクトを分析し、copilot-instructions.md を自動生成する"
---

# Copilot Instructions 自動生成

プロジェクトのコードベースを分析して、`.github/copilot-instructions.md` の内容を自動生成してください。

## 分析対象

1. **技術スタック**: `package.json`, `tsconfig.json`, `next.config.ts`
2. **コーディングパターン**: 既存コンポーネント、API ルート、ユーティリティ
3. **プロジェクト構造**: ディレクトリ構成、命名規則
4. **設定ファイル**: ESLint, Prettier, EditorConfig
5. **テスト**: テストフレームワーク、テストパターン
6. **CI/CD**: GitHub Actions ワークフロー

## 出力セクション

### 1. アプリケーション概要
技術スタックの自動検出と記述

### 2. コーディング規約
既存コードから抽出されたパターン:
- インポート順序
- 命名規則
- ファイル構造
- 型定義パターン

### 3. 禁止事項
`package.json` や既存コードから推測される制約

### 4. テンプレート
既存ページ / コンポーネントの共通パターンを抽出

### 5. デプロイメント
デプロイ先に応じた制約

## ルール

- 既存の `copilot-instructions.md` がある場合は差分を提案する形で出力
- 実際のコードに基づいた指示のみ生成（推測は明記する）
- UCFitness プロジェクト固有のルールを尊重する
