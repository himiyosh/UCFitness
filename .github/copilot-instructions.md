# UCFitness — GitHub Copilot 共通指示

## アプリケーション概要

UCFitness は Fitbit 連携の歩数トラッキング・フィットネス競争アプリ (PWA)。

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router), React 19, TypeScript
- **スタイリング**: Tailwind CSS v4, CSS カスタムプロパティ (テーマ)
- **認証**: NextAuth v5 (beta)
- **DB**: Supabase (PostgreSQL)
- **i18n**: next-intl (ja/en)
- **デプロイ**: Cloudflare Pages
- **チャート**: Recharts

## 絶対遵守ルール

### ブランチ保護

- **main/master への直接 push は禁止** — 必ずユーザーの明示的な承認を得ること
- **PR merge (gh pr merge, git merge) も承認なしに禁止**
- PR の作成 (`gh pr create`) までは許可

### コーディング規約

- テーマ: `var(--theme-primary)` 等の CSS カスタムプロパティを使用
- `dark:` は使用しない (テーマシステムで対応済み)
- `framer-motion` は使用しない
- 新しい外部ライブラリは追加しない
- 既存の関数・export は絶対に削除しない
- ファイル末尾には必ず改行を入れる

### デプロイ制限

- `git push` は Cloudflare Pages のデプロイ制限があるため、明示的に許可があるまで実行しない

### 言語ポリシー

- コミットメッセージ: 日本語
- コードコメント: 日本語 OK
- ユーザーへの応答: 日本語サマリー + 英語本文
