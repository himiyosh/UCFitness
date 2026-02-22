---
applyTo: ".github/workflows/**"
---

# GitHub Actions CI/CD ベストプラクティス

UCFitness の CI/CD ワークフロー構築・修正時のガイドライン。

## セキュリティ

- Actions は SHA ピンニングで固定（`@v4` ではなく `@<sha>`）
- `permissions` は最小権限で明示的に設定
- シークレットは `${{ secrets.NAME }}` で使用、ログに出力しない
- サードパーティ Actions は信頼できるソースのみ使用

## ワークフロー構造

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx tsc --noEmit
```

## キャッシュ

- `actions/cache` または `actions/setup-node` の `cache` オプションで `node_modules` をキャッシュ
- キャッシュキーに `package-lock.json` のハッシュを含める

## デプロイ

- Cloudflare Pages への自動デプロイはメインブランチのプッシュ時のみ
- PR にはプレビューデプロイを設定
- Edge Runtime 互換性チェックを CI に含める

## テスト

- `npx tsc --noEmit` を CI に含める（型チェック）
- ESLint チェックを CI に含める
- テストがある場合は `npm test` を実行
