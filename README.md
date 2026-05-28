# UCFitness

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react)
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
| **UI** | React 18.3.1, Tailwind CSS v4, CSS カスタムプロパティ (テーマ) |
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
+-- components/              # React コンポーネント (カテゴリ別サブフォルダ + 既存ルート配置)
+-- hooks/                   # カスタム Hooks
|   +-- useGearReactions.ts
|   +-- useGroupReactions.ts
|   +-- useWebPush.ts
|   +-- ...
+-- lib/                     # ビジネスロジック・ユーティリティ
|   +-- auth.ts              # NextAuth 設定
|   +-- auth-redirect.ts     # 未ログイン深いリンクのログイン導線
|   +-- supabase.ts          # Supabase クライアント (supabaseAdmin)
|   +-- fitbit.ts            # Fitbit API 連携
|   +-- services/
|   |   +-- analytics-service.ts # 個人分析集計ロジック
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
|   |   +-- awesome-copilot/     # awesome-copilot から導入 (8 ファイル)
│   +-- agents/                  # Copilot カスタムエージェント (14 ファイル)
|   +-- skills/                  # Copilot スキル (5 スキル)
|   +-- prompts/                 # Copilot カスタムプロンプト
+-- .agents/
|   +-- skills/
|       +-- modern-web-guidance/ # Chrome Modern Web Guidance skill
+-- skills-lock.json        # 導入済み skill のロックファイル
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

- **Node.js** 22 以上（`.nvmrc` で固定。`nvm use` 推奨。Cloudflare Pages の `NODE_VERSION` も 22）
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

<details>
<summary>awesome-copilot Instructions (クリックで展開)</summary>

[github/awesome-copilot](https://github.com/github/awesome-copilot) から導入した補助 Instructions:

| ファイル | 対象 | 用途 |
|---|---|---|
| [nextjs.instructions.md](.github/instructions/awesome-copilot/nextjs.instructions.md) | Next.js | App Router / RSC / Server Actions ベストプラクティス |
| [nextjs-tailwind.instructions.md](.github/instructions/awesome-copilot/nextjs-tailwind.instructions.md) | Next.js + Tailwind | Tailwind CSS 統合パターン |
| [reactjs.instructions.md](.github/instructions/awesome-copilot/reactjs.instructions.md) | React | コンポーネント設計・Hooks・状態管理 |
| [a11y.instructions.md](.github/instructions/awesome-copilot/a11y.instructions.md) | アクセシビリティ | WCAG 2.1 AA 準拠ガイダンス |
| [performance-optimization.instructions.md](.github/instructions/awesome-copilot/performance-optimization.instructions.md) | パフォーマンス | Web Vitals・バンドル最適化・キャッシュ戦略 |
| [security-and-owasp.instructions.md](.github/instructions/awesome-copilot/security-and-owasp.instructions.md) | セキュリティ | OWASP Top 10 対策・入力検証 |
| [typescript-5-es2022.instructions.md](.github/instructions/awesome-copilot/typescript-5-es2022.instructions.md) | TypeScript | TS 5 / ES2022 コーディング規約 |
| [playwright-typescript.instructions.md](.github/instructions/awesome-copilot/playwright-typescript.instructions.md) | テスト | Playwright E2E テスト生成ガイド |

</details>

### カスタムエージェント

#### エージェント組織階層図 (テキスト版)

```
👤 User (VS Code Chat Panel / Slash Commands)
│
├── ⚙️ UCFitnessAgent [Orchestrator — Layer 1]
│   │  クエリを分析し、適切な専門ロールを自動選択・組み合わせて委任
│   │
│   ├── 📁 フロントエンド開発 (Next.js + React)
│   │   ├── 🟦 Next.js Expert              ページ追加 / SSR / Edge Runtime / i18n
│   │   │   └── 🔧 [next-intl-add-language skill]
│   │   └── 🟩 React Expert                Hooks / 状態管理 / パフォーマンス最適化
│   │
│   ├── 📁 品質・セキュリティ
│   │   ├── 🟥 Security Expert             OWASP Top 10 / 認証 / XSS / IDOR
│   │   ├── 🟨 QA                          テスト戦略 / エッジケース / カバレッジ
│   │   └── 🟪 Debug Mode                  エラー調査 / クラッシュ分析 / 5ステップRCA
│   │
│   ├── 📁 デザイン・アクセシビリティ
│   │   ├── 🟧 UX Designer                 UI/UX / モバイルファースト / ゲーミフィケーション
│   │   │   └── 🔧 [web-design-reviewer skill]
│   │   └── 🟫 Accessibility Expert        WCAG 2.1/2.2 / ARIA / キーボードナビ
│   │
│   ├── 🎭 Playwright Tester               全要素精査型 E2E テスト / レスポンシブ検証
│   │
│   ├── 🧭 Persona Journey Review           実ユーザー行動パターン回遊監査
│   │   ├── 🟦 Persona Mobile Beginner      375px 初回/ライトユーザー
│   │   ├── 🟩 Persona Competitive Athlete  ランキング・競争モチベーション
│   │   ├── 🟨 Persona Returning Low Activity 低活動・復帰ユーザー
│   │   ├── 🟪 Persona Reward Shop Explorer コイン・ショップ・報酬理解
│   │   └── 🟫 Persona Accessibility Keyboard キーボード・低視力・a11y
│   │
│   ├── 📐 Plan Mode                       計画 / アーキテクチャ / 要件整理
│   │
│   ├── 🧹 Universal Janitor              クリーンアップ / リファクタリング / 技術負債
│   │   └── 🔄 Improvement Loop            品質改善ループ・レトロスペクティブ
│   │
│   ├── 💰 Monetization Consultant       収益化戦略 / Amazon アフィリエイト / 広告 / Premium
│   │
│   └── 🔴 Self-Critique                   成果物の 6 軸批判・品質ゲート (自動起動)
│       ├── 🔧 [self-critique-gate skill]
│       └── 批判→修正→再批判ループ (全軸 PASS まで最大 3 回)
│
├── ⚡ Slash Commands (Prompts) — ユーザーが直接呼び出す定型タスク
│   ├── 📋 /context-map                    プロジェクトコンテキストマップ生成
│   ├── 📝 /conventional-commit            コミットメッセージ生成
│   ├── 📖 /copilot-instructions-blueprint Copilot Instructions テンプレート
│   ├── 📐 /create-implementation-plan     実装計画作成
│   ├── 📄 /create-readme                  README 生成
│   ├── 🔀 /git-flow-branch               Git フローブランチ管理
│   ├── 📋 /my-issues                      Issue 管理
│   ├── 🔍 /review-and-refactor           コードレビュー・リファクタリング
│   ├── 📐 /refactor-plan                  リファクタリング計画
│   ├── 🌐 /next-intl-add-language         翻訳キー追加
│   ├── 🐘 /postgresql-review              PostgreSQL クエリレビュー
│   └── ❓ /what-context-do-you-need       コンテキスト発見
│
├── ⚡ Agent Sub-Prompts — UCFitnessAgent 内部で使用するワークフロー
│   ├── 🔨 /agents/build-validation        ビルド検証・型チェック・リント
│   ├── ✨ /agents/feature-enhancement     機能拡張 (状態設計・エラーハンドリング)
│   ├── 💰 /agents/monetization            マネタイズ戦略・収益機能提案
│   ├── 🔍 /agents/new-feature-discovery   新機能発見・バリデーション
│   ├── ⚡ /agents/performance              パフォーマンス最適化
│   ├── 🔒 /agents/security                API セキュリティ監査
│   ├── 🧪 /agents/testing                 テストカバレッジ分析・提案
│   └── 🎨 /agents/ui-ux                   UI/UX 改善 (スタイル・CSS のみ)
│
├── 📋 Shared Instructions (全エージェント共通ルール)
│   ├── copilot-instructions.md            リポジトリ共通ルール・コーディング規約
│   └── .github/instructions/ (18 files)   a11y / hooks / security / mobile 等
│
└── 🔧 Skills (再利用可能なドメイン知識)
    ├── modern-web-guidance                Chrome Modern Web Guidance / Baseline 2024 / Web 標準ベストプラクティス
    ├── self-critique-gate                 完了前の自己批判・回帰防止・Lessons Learned ゲート
    ├── web-design-reviewer                UI/UX ビジュアルチェック・レスポンシブ検証
    ├── ucfitness-rule-enforcement         UCFitness 固有ルールの静的検出・強制
    ├── postgresql-optimization            PostgreSQL クエリ最適化・パフォーマンス分析
    └── next-intl-add-language             next-intl 翻訳キー追加ワークフロー
```

#### エージェント詳細一覧

| 名前 | ファイル | モデル | 役割 |
|---|---|---|---|
| **UCFitnessAgent** | [UCFitnessAgent.agent.md](.github/agents/UCFitnessAgent.agent.md) | - | マスターオーケストレーター。リクエストのキーワード・文脈から専門ロールを自動判定し、委任する |
| Next.js Expert | [expert-nextjs-developer.agent.md](.github/agents/expert-nextjs-developer.agent.md) | GPT-4.1 | Next.js 15.5.18 App Router / Server Components / Edge Runtime / next-intl 専門 |
| React Expert | [expert-react-frontend-engineer.agent.md](.github/agents/expert-react-frontend-engineer.agent.md) | - | React 18.3 Hooks / Client Components / a11y / パフォーマンス最適化 |
| SE: Security | [se-security-reviewer.agent.md](.github/agents/se-security-reviewer.agent.md) | GPT-5 | OWASP Top 10 / Zero Trust / LLM Security / API エンドポイントセキュリティ |
| SE: UX Designer | [se-ux-ui-designer.agent.md](.github/agents/se-ux-ui-designer.agent.md) | GPT-5 | JTBD 分析 / ユーザージャーニー / UX リサーチ / Figma 連携 |
| Accessibility Expert | [accessibility.agent.md](.github/agents/accessibility.agent.md) | GPT-4.1 | WCAG 2.1/2.2 準拠 / ARIA / キーボードナビ / スクリーンリーダー対応 |
| Playwright Tester | [playwright-tester.agent.md](.github/agents/playwright-tester.agent.md) | Claude Sonnet 4 | Playwright MCP による全要素精査型 E2E テスト / レスポンシブ検証 |
| Persona Mobile Beginner | [persona-mobile-beginner.agent.md](.github/agents/persona-mobile-beginner.agent.md) | GPT-5.4 | 375px モバイル、初回/ライトユーザー、次アクション理解を回遊監査 |
| Persona Competitive Athlete | [persona-competitive-athlete.agent.md](.github/agents/persona-competitive-athlete.agent.md) | Claude Sonnet 4.6 | ランキング、グループ、チャレンジ、競争モチベーションを回遊監査 |
| Persona Returning Low Activity | [persona-returning-low-activity.agent.md](.github/agents/persona-returning-low-activity.agent.md) | GPT-5.2 | 低活動・復帰ユーザー、再開導線、励まし、空状態を回遊監査 |
| Persona Reward Shop Explorer | [persona-reward-shop-explorer.agent.md](.github/agents/persona-reward-shop-explorer.agent.md) | GPT-4.1 | コイン、ショップ、ウォレット、報酬理解、購入前不安を回遊監査 |
| Persona Accessibility Keyboard | [persona-accessibility-keyboard.agent.md](.github/agents/persona-accessibility-keyboard.agent.md) | GPT-4.1 | キーボード、スクリーンリーダー、低視力、フォーカス、a11y を回遊監査 |
| Monetization Consultant | [monetization-consultant.agent.md](.github/agents/monetization-consultant.agent.md) | - | 収益化戦略立案 / Amazon アフィリエイト最適化 / 広告戦略 / Premium 機能設計 |
| Self-Critique | [self-critique.agent.md](.github/agents/self-critique.agent.md) | - | 成果物の 6 軸批判 (デザイン一貫性・余白密度・レスポンシブ・翻訳・インタラクション・コード品質) |

#### ロール自動選択ルール (UCFitnessAgent)

UCFitnessAgent はリクエストのキーワード・文脈から以下のルールで専門ロールを自動判定する。複数ロールが必要な場合は組み合わせて対応する。

| トリガーキーワード | 選択ロール |
|---|---|
| ページ追加、ルーティング、SSR、Edge Runtime、i18n | 🟦 **Next.js Expert** |
| Hooks、コンポーネント、再レンダリング、状態管理 | 🟩 **React Expert** |
| 脆弱性、認証、OWASP、XSS、IDOR、入力検証 | 🟥 **Security Expert** |
| テスト、テストケース、バグ、品質、エッジケース | 🟨 **QA** |
| エラー、バグ修正、クラッシュ、動かない、原因調査 | 🟪 **Debug Mode** |
| UI、UX、ユーザー体験、レイアウト、デザイン | 🟧 **UX Designer** |
| アクセシビリティ、WCAG、a11y、スクリーンリーダー | 🟫 **Accessibility Expert** |
| E2E テスト、ブラウザテスト、Playwright、表示確認 | 🎭 **Playwright Tester** |
| ペルソナ、実ユーザー、回遊、行動パターン、ユーザージャーニー、迷い、離脱、改善点 | 🧭 **Persona Journey Review** |
| 計画、設計、アーキテクチャ、見積もり、要件整理 | 📐 **Plan Mode** |
| クリーンアップ、リファクタリング、技術負債、整理 | 🧹 **Universal Janitor** |
| 改善ループ、品質改善、全体チェック、ループ回して | 🔄 **Improvement Loop** |
| 収益化、マネタイズ、広告、アフィリエイト、Premium、課金、収益、売上 | 💰 **Monetization Consultant** |
| 批判、レビュー、見直し、統一性、見切れ、不統一 | 🔴 **Self-Critique** |

> **自動起動**: 他ロールの作業完了後・Improvement Loop 各 Cycle 完了後・PR 作成直前に Self-Critique が自動起動し、全 6 軸 PASS するまで完了報告しない。

### Skills

詳細はツリー図の「Skills」セクションを参照。

| スキル | 用途 |
|---|---|
| [modern-web-guidance](.agents/skills/modern-web-guidance/SKILL.md) | Chrome Modern Web Guidance。HTML / CSS / クライアントサイド JS / React UI / フォーム / Web Vitals 改善時に guide を検索・取得して適用する |
| [self-critique-gate](.github/skills/self-critique-gate/SKILL.md) | 完了前の自己批判ゲート。要件充足・回帰防止・検証証拠・Lessons Learned・README 同期を確認し、NG があれば修正→再批判を繰り返す |
| [web-design-reviewer](.github/skills/web-design-reviewer/SKILL.md) | UI/UX デザインレビュー・ビジュアルチェックリスト |
| [ucfitness-rule-enforcement](.github/skills/ucfitness-rule-enforcement/SKILL.md) | UCFitness 固有ルール違反の静的検出・強制メカニズム |
| [postgresql-optimization](.github/skills/postgresql-optimization/SKILL.md) | PostgreSQL クエリ最適化・パフォーマンス分析 |
| [next-intl-add-language](.github/skills/next-intl-add-language/SKILL.md) | next-intl 翻訳キー追加ワークフロー |

### MCP Server

| MCP | 用途 |
|---|---|
| [awesome-copilot](.vscode/mcp.json) | github/awesome-copilot の検索・インストール MCP (Docker 必須) |

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
- **Modern Web Guidance 適用** --- HTML / CSS / クライアントサイド JS / React UI / フォーム / Web Vitals 改善では `modern-web-guidance` skill を先に参照する。ブラウザサポート方針は Baseline 2024
- **`supabaseAdmin` 必須** --- サーバーサイドの DB アクセスは `supabase` ではなく `supabaseAdmin` を使用
- **共通 App Shell** --- 認証済みデスクトップ画面の左サイドバーは `app/[locale]/layout.tsx` で一元表示し、ページ単位で表示有無をばらつかせない
- **自然スクロール優先** --- root の transform スケーリングや `html/body` のスクロールロックは禁止。閲覧不能な情報を作らない
- **デプロイ制限あり** --- Cloudflare Pages のデプロイ制限があるため、`git push` は明示的な許可後に実行すること

## 関連ドキュメント

| ドキュメント | 説明 |
|---|---|
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | Copilot 共通指示 (コーディング規約、ページパターン等) |
| [docs/professional-ui-redesign-spec.md](docs/professional-ui-redesign-spec.md) | プロ品質 UI への大幅リデザイン設計書（殺風景化フィードバック対応を含む） |
| [docs/DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md) | デザイントークンシステム |
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
