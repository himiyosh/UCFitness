---
mode: "agent"
description: "Git Flow ブランチ命名規則に従ったブランチ名を生成する"
---

# Git Flow ブランチ名生成

タスクの内容に基づいて、Git Flow 規約に従ったブランチ名を生成してください。

## ブランチタイプ

| プレフィックス | 用途 | 元ブランチ |
|---------------|------|-----------|
| `feature/` | 新機能開発 | `develop` or `main` |
| `fix/` | バグ修正 | `develop` or `main` |
| `hotfix/` | 本番緊急修正 | `main` |
| `refactor/` | リファクタリング | `develop` or `main` |
| `docs/` | ドキュメント | `develop` or `main` |
| `chore/` | ビルド/ツール変更 | `develop` or `main` |
| `copilot/` | Copilot 設定変更 | `develop` or `main` |

## 命名規則

1. **英語小文字 + ハイフン区切り**: `feature/add-group-analytics`
2. **イシュー番号がある場合は先頭に追加**: `feature/123-add-group-analytics`
3. **短く具体的に**: 3-5 語程度
4. **動詞から始める**: `add-`, `fix-`, `update-`, `remove-`, `improve-`

## 手順

1. タスクの内容を分析
2. 適切なプレフィックスを選択
3. ブランチ名を生成
4. ユーザーに提案

## 出力例

```
タスク: グループ分析画面にチャートを追加
→ feature/add-group-analytics-chart

タスク: ログインボーナスのバグ修正
→ fix/login-bonus-calculation

タスク: README の更新
→ docs/update-readme
```
