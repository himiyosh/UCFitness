# UCFitness

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?logo=cloudflarepages)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

## 概要

UCFitness は **Fitbit 連携の歩数トラッキング・フィットネス競争アプリ (PWA)**。

グループ対抗のランキング・チャレンジ・リアクション・バッジ・コイン経済を通じて、日常の歩数活動を楽しくゲーミフィケーションする。

## 主な機能

| 機能 | 説明 |
|---|---|
| **歩数トラッキング** | Fitbit API を使用した自動歩数同期 |
| **グループ対抗** | グループ作成・参加、メンバーランキング、週間レポート |
| **リーダーボード** | 個人・グループ・パーセンタイルランキング |
| **チャレンジ** | 期間限定のウォーキングチャレンジ |
| **バッジ & 称号** | 達成に応じたバッジ獲得・称号付与システム |
| **コイン経済** | 歩数でコインを獲得、ショップでギアを購入 |
| **ギア & リアクション** | プロフィールギア装着、メンバーへのリアクション |
| **プッシュ通知** | Web Push による歩数リマインダー、ウィークリーサマリー通知 |
| **i18n** | 日本語・英語の 2 言語対応 |
| **PWA** | ホーム画面追加、オフライン対応 |

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| **フレームワーク** | Next.js 15 (App Router) |
| **UI** | React 19, Tailwind CSS v4, CSS カスタムプロパティ (テーマ) |
| **言語** | TypeScript 5 |
| **認証** | NextAuth v5 (beta) / Fitbit OAuth 2.0 |
| **DB** | Supabase (PostgreSQL) |
| **i18n** | next-intl (ja/en) |
| **チャート** | Recharts |
| **プッシュ通知** | Web Push (web-push) |
| **デプロイ** | Cloudflare Pages (Edge Runtime) |
| **テスト** | Vitest |

## アーキテクチャ

```
[ユーザー (PWA)] --> [Cloudflare Pages (Edge Runtime)]
                          |
                   [Next.js 15 App Router]
                    /        |        \
            [NextAuth]  [Supabase]  [Fitbit API]
           (OAuth 2.0)  (PostgreSQL)  (歩数同期)
                          |
                   [Web Push API]
                   (プッシュ通知)
```

- **Server Component 優先**: ページはサーバーサイドでレンダリングし、インタラクティブ部分のみ `'use client'`
- **Edge Runtime 必須**: すべての `page.tsx` / `route.ts` に `export const runtime = 'edge'` を宣言
- **supabaseAdmin**: サーバーサイドの DB アクセスはサービスロールキーを使用

## プロジェクト構造

```
UCFitness/
+-- app/
|   +-- [locale]/            # i18n ルーティング (ja/en)
|   |   +-- page.tsx         # ダッシュボード (ランディングページ兼用)
|   |   +-- analytics/       # 個人分析
|   |   +-- challenges/      # チャレンジ一覧
|   |   +-- groups/          # グループ詳細・設定
|   |   +-- leaderboard/     # リーダーボード
|   |   +-- profile/         # プロフィール・バッジ
|   |   +-- recommendations/ # おすすめ商品
|   |   +-- settings/        # 設定
|   |   +-- setup/           # 初回セットアップ
|   |   +-- shop/            # ショップ
|   |   +-- user/            # ユーザー公開ページ
|   |   +-- wallet/          # ウォレット
|   |   +-- layout.tsx       # 共通レイアウト
|   +-- api/                 # API ルート
|   |   +-- auth/            # NextAuth エンドポイント
|   |   +-- cron/            # Cron ジョブ (歩数同期、リマインダー等)
|   |   +-- group/           # グループ CRUD
|   |   +-- steps/           # 歩数データ API
|   |   +-- shop/            # ショップ・コイン API
|   |   +-- push/            # プッシュ通知登録
|   |   +-- reactions/       # リアクション API
|   |   +-- ...
|   +-- actions.ts           # Server Actions
|   +-- globals.css          # グローバルスタイル (テーマ変数)
+-- components/              # React コンポーネント (~100 ファイル)
+-- hooks/                   # カスタム Hooks
|   +-- useGearReactions.ts
|   +-- useGroupReactions.ts
|   +-- useWebPush.ts
|   +-- ...
+-- lib/                     # ビジネスロジック・ユーティリティ
|   +-- auth.ts              # NextAuth 設定
|   +-- supabase.ts          # Supabase クライアント (supabaseAdmin)
|   +-- fitbit.ts            # Fitbit API 連携
|   +-- coin-service.ts      # コイン経済ロジック
|   +-- badge-service.ts     # バッジ判定・付与
|   +-- push-messages.ts     # プッシュ通知メッセージ (i18n)
|   +-- ranking-service.ts   # ランキングロジック
|   +-- ...
+-- messages/                # 翻訳ファイル
|   +-- ja.json              # 日本語
|   +-- en.json              # 英語
+-- migrations/              # Supabase DB マイグレーション SQL
+-- types/                   # TypeScript 型定義
+-- public/                  # 静的ファイル (PWA マニフェスト、アイコン)
+-- scripts/                 # ユーティリティスクリプト
+-- docs/                    # ドキュメント
|   +-- CLOUDFLARE_SETUP.md  # Cloudflare Pages セットアップ手順
|   +-- improvement-report.md
|   +-- security-hardening-notes.md
+-- .github/
|   +-- copilot-instructions.md  # Copilot 共通指示
|   +-- instructions/            # 補助 Instructions (18 ファイル)
|   +-- agents/                  # Copilot カスタムエージェント
|   +-- prompts/                 # Copilot カスタムプロンプト
+-- middleware.ts            # i18n ミドルウェア
+-- navigation.ts            # next-intl ナビゲーション設定
+-- i18n.ts                  # next-intl 設定
+-- next.config.ts           # Next.js 設定
+-- vitest.config.ts         # Vitest テスト設定
```

## セットアップ

### 1. リポジトリの取得

```shell
git clone https://github.com/user/UCFitness.git
cd UCFitness
```

### 2. 前提条件

- **Node.js** 18 以上
- **npm** 9 以上
- **Fitbit 開発者アカウント** (OAuth 2.0 アプリ登録)
- **Supabase プロジェクト** (PostgreSQL)

### 3. 依存関係のインストール

```shell
npm install
```

### 4. 環境変数の設定

[.env.local.example](.env.local.example) をコピーして `.env.local` を作成し、各値を設定する:

```shell
cp .env.local.example .env.local
```

必要な環境変数:
- `NEXTAUTH_SECRET` --- NextAuth セッション暗号化キー
- `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` --- Fitbit OAuth 2.0 認証情報
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` --- Supabase 接続情報
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` --- Web Push VAPID キー

### 5. DB マイグレーション

[migrations/](migrations/) 配下の SQL を Supabase Dashboard または `scripts/run_migration_pg.ts` で適用する。

### 6. 開発サーバーの起動

```shell
npm run dev
```

- **ポート 3000 必須** --- NextAuth OAuth コールバック URL が `localhost:3000` に固定されているため、別ポートでは認証が動作しない
- ポート 3000 が使用中の場合は先にプロセスをキルすること

ブラウザで http://localhost:3000 を開く。

## 使い方

### npm スクリプト

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 (ポート 3000) |
| `npm run build` | プロダクションビルド |
| `npm run pages:build` | Cloudflare Pages ビルド |
| `npm run lint` | ESLint 実行 |
| `npm test` | Vitest テスト実行 |
| `npm run test:watch` | Vitest ウォッチモード |
| `npm run test:coverage` | テストカバレッジレポート |

### Cloudflare Pages デプロイ

```shell
npm run pages:build
```

- すべての `page.tsx` / `route.ts` に `export const runtime = 'edge'` が必要
- `layout.tsx` には不要

## エージェント・プロンプト構成

### Copilot Instructions

| ファイル | 概要 |
|---|---|
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | メイン指示 (コーディング規約、ページパターン、UI ルール等) |
| [.github/instructions/](.github/instructions/) | 補助 Instructions (18 ファイル: a11y, hooks, security, mobile 等) |

### カスタムエージェント

| 名前 | 説明 |
|---|---|
| [UCFitnessAgent](.github/agents/UCFitnessAgent.agent.md) | UCFitness 専用の開発支援エージェント |

### カスタムプロンプト

| プロンプト | 用途 |
|---|---|
| `/context-map` | プロジェクトコンテキストマップ生成 |
| `/conventional-commit` | コミットメッセージ生成 |
| `/create-implementation-plan` | 実装計画作成 |
| `/create-readme` | README 生成 |
| `/git-flow-branch` | Git フローブランチ管理 |
| `/review-and-refactor` | コードレビュー・リファクタリング |
| `/refactor-plan` | リファクタリング計画 |
| `/next-intl-add-language` | 翻訳キー追加 |
| `/postgresql-review` | PostgreSQL クエリレビュー |

<details>
<summary>エージェント用サブプロンプト (クリックで展開)</summary>

| プロンプト | 用途 |
|---|---|
| `/agents/build-validation` | ビルド検証 |
| `/agents/feature-enhancement` | 機能拡張提案 |
| `/agents/monetization` | マネタイズ戦略 |
| `/agents/new-feature-discovery` | 新機能発見 |
| `/agents/performance` | パフォーマンス最適化 |
| `/agents/security` | セキュリティ監査 |
| `/agents/testing` | テスト生成 |
| `/agents/ui-ux` | UI/UX 改善 |

</details>

## テスト方法

```shell
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジ付き
npm run test:coverage
```

- テストフレームワーク: **Vitest**
- テストファイル: `lib/__tests__/` 配下
- 型チェック: `npx tsc --noEmit` (ビルド検証の代替としても使用)

## 注意事項 / 制約

- **Edge Runtime 必須** --- Cloudflare Pages は Edge Runtime のみ対応。`fs`, `path` 等の Node.js ネイティブモジュールは使用不可
- **ポート 3000 固定** --- NextAuth OAuth コールバック URL の制約。開発サーバーは必ずポート 3000 で起動すること
- **`framer-motion` 使用禁止** --- CSS アニメーション + Tailwind で代替すること
- **`dark:` 使用禁止** --- テーマシステム (CSS カスタムプロパティ) で管理
- **`supabaseAdmin` 必須** --- サーバーサイドの DB アクセスは `supabase` ではなく `supabaseAdmin` を使用
- **デプロイ制限あり** --- Cloudflare Pages のデプロイ制限があるため、`git push` は明示的な許可後に実行すること

## 関連ドキュメント

| ドキュメント | 説明 |
|---|---|
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | Copilot 共通指示 (コーディング規約、ページパターン等) |
| [docs/improvement-report.md](docs/improvement-report.md) | 改善レポート |
| [docs/security-hardening-notes.md](docs/security-hardening-notes.md) | セキュリティ強化メモ |
| [.env.local.example](.env.local.example) | 環境変数テンプレート |
| [migrations/](migrations/) | DB マイグレーション SQL |

<details>
<summary>変更履歴 (クリックで展開)</summary>

### v0.1.0 (初期リリース)

- Fitbit 連携歩数トラッキング
- グループ対抗ランキング
- バッジ・コイン経済システム
- PWA 対応
- 日本語・英語 i18n

</details>
