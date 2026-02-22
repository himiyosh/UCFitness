---
mode: "agent"
description: "Conventional Commits 規約に従うコミットメッセージを日本語で生成する"
---

# コミットメッセージ生成

ステージングされた変更内容を分析し、Conventional Commits 規約に従ったコミットメッセージを日本語で生成してください。

## フォーマット

```
<type>(<scope>): <日本語の説明>

<本文 — 変更の詳細を日本語で>

<フッター — Breaking Changes, Issue 参照など>
```

## Type 一覧

| Type | 用途 |
|------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメント変更 |
| `style` | フォーマット（コードの意味に影響しない） |
| `refactor` | リファクタリング（機能変更なし） |
| `perf` | パフォーマンス改善 |
| `test` | テスト追加・修正 |
| `chore` | ビルド・ツール変更 |
| `ci` | CI 設定変更 |

## Scope 候補（UCFitness）

`auth`, `steps`, `groups`, `challenges`, `shop`, `wallet`, `profile`, `settings`, `i18n`, `api`, `ui`, `db`, `pwa`, `analytics`

## ルール

1. **タイトルは 50 文字以内**（日本語の場合は全角換算で注意）
2. **本文は 72 文字で折り返す**
3. **命令形ではなく説明形で書く**（日本語なので「〜を追加」「〜を修正」等）
4. **Breaking Change がある場合はフッターに `BREAKING CHANGE:` を記載**

## 手順

1. `git diff --staged` でステージングされた変更を確認
2. 変更内容を分類（feat/fix/refactor 等）
3. 適切な scope を選択
4. 日本語のコミットメッセージを生成
5. ユーザーに提案し、確認後 `git commit` を実行
