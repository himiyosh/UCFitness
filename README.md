# UCFitness

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?logo=cloudflarepages)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

## 概要

UCFitness は **複数の健康データソースに段階対応する歩数トラッキング・フィットネス競争アプリ (PWA)**。

グループ対抗のランキング・チャレンジ・リアクション・バッジ・コイン経済を通じて、日常の歩数活動を楽しくゲーミフィケーションする。

## 主な機能

| 機能 | 説明 |
|---|---|
| **歩数トラッキング** | Fitbit API と Google Health の段階移行型自動歩数同期 |
| **ログイン・登録** | Fitbit OAuth後に未設定ユーザーを3ステップsetupへ送り、失敗時は生のAuth.js情報を露出せずja/enの理由と安全な再試行を表示 |
| **初回セットアップ** | プロフィール/歩数ソース→日次目標→グループ/チャレンジの3ステップで、各段階を後回しにでき、保存後の「最初の500歩」からホームの価値ループへ接続 |
| **設定** | 歩数ソースと日次目標をプロフィール・装飾より先に配置し、500〜100,000歩の共通Client/API契約で更新 |
| **プロフィール** | 記録済み0歩・未記録・取得失敗を分離し、歩数・比較・バッジ・装備・コイン等を部分障害でも継続表示 |
| **ウォレット** | 今日の獲得・支出・純増減を分離し、次の歩数UC、取引後残高、日次純増減チャートを部分障害でも表示 |
| **ホームダッシュボード** | 今日の進捗、次ライバル差、固定5行ランキング、個別目標ベースのFriend Pulse、今週トレンド、UC残高、チャレンジ、ミッション、次の行動を意味色と動的barで可視化 |
| **グループ対抗** | 未所属からの参加導線、正歩数だけのメンバー/グループ順位、部分障害でも継続するイベント・チャット・ギア・週間レポート |
| **リーダーボード** | 個人・グループ順位に加え、参加人数・次ライバル名・必要歩数・トップ差をCompetition Missionで可視化 |
| **チャレンジ** | 参加中の残り歩数を優先し、次の最大500歩・期限・UC報酬を示す期間限定チャレンジ |
| **バッジ & 称号** | 達成に応じたバッジ獲得・称号付与システム |
| **コイン経済** | 歩数でコインを獲得、ショップでギアを購入 |
| **ギア & リアクション** | プロフィールギア装着、メンバーへのリアクション |
| **プッシュ通知** | 言語設定対応のWeb Push、バッジ横断集約、歩数リマインダー、ウィークリーサマリー、端末重複制御、通知嗜好が利用不能でも警告付きFeedを継続 |
| **i18n** | 日本語・英語の 2 言語対応 |
| **PWA** | ホーム画面追加、オフライン対応 |

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| **フレームワーク** | Next.js 15 (App Router) |
| **UI** | React 18.3.1, Tailwind CSS v4, CSS カスタムプロパティ (テーマ) |
| **言語** | TypeScript 5（明示的な `any` なし、Supabase Database型を利用） |
| **認証** | NextAuth v5 (beta) / Fitbit OAuth 2.0 |
| **健康データ** | Fitbit Web API / Google Health API (opt-in) |
| **DB** | Supabase (PostgreSQL) |
| **i18n** | next-intl (ja/en) |
| **チャート** | Recharts |
| **プッシュ通知** | Web Push API / RFC 8291 `aes128gcm` (Edge Web Crypto) |
| **デプロイ** | Cloudflare Pages (Edge Runtime) |
| **テスト** | Vitest |

## アーキテクチャ

```
[ユーザー (PWA)] --> [Cloudflare Pages (Edge Runtime)]
                          |
                   [Next.js 15 App Router]
                    /        |        \
            [NextAuth]  [Supabase]  [Health Data Layer]
           (OAuth 2.0)  (PostgreSQL)  /             \
                          |       [Fitbit API] [Google Health API]
                   [Web Push API]       (歩数同期)
                   (プッシュ通知)
```

- **Server Component 優先**: ページはサーバーサイドでレンダリングし、インタラクティブ部分のみ `'use client'`
- **Edge Runtime 必須**: すべての `page.tsx` / `route.ts` に `export const runtime = 'edge'` を宣言
- **supabaseAdmin**: サーバーサイドの DB アクセスはサービスロールキーを使用
- **型安全性契約**: 外部データは具体型または `unknown` + 型ガードで扱い、Supabaseの選択列・RPC応答は`types/database.ts`のDatabase型から射影する。明示的な`any`と`no-explicit-any`抑制は使用しない
- **Dual-Library Strategy**: Google Health を明示的に接続したユーザーは同APIを優先し、未接続または明示解除したユーザーはFitbitを継続利用。再認証待ち・エラー時はデータ混在を避けるため暗黙切替しない
- **責務分離**: 認証IDの継続照合記録 (`user_auth_identities`) と健康データ接続 (`fitness_connections`) を分離する。ログインは `provider + provider_account_id` だけで照合し、メール一致による暗黙リンクは行わない
- **OAuthコールバック保護**: Google HealthのOAuth stateは有効期限・nonce・開始ユーザーIDをHMAC署名へ含め、コールバック時のセッションユーザー不一致をトークン交換前に拒否する。Google Health IDの継続性確認、更新トークン保持、資格情報保存はユーザー行ロック下の単一DB関数で原子的に行う
- **接続UX**: 設定画面でGoogle同意画面への外部遷移、読み取り範囲、再認証中の同期停止、Fitbitへの暗黙切替を行わないこと、解除後の同期元または同期停止を接続状況に応じて明示する。セッション切れ時は再認証通知を保持し、FitbitログインがUCFitness本人確認であることを説明して設定画面へ戻す
- **トークン保護**: Google HealthトークンはユーザーID・プロバイダ・用途をAADへ含めたAES-256-GCM v2で暗号化する。解除時はDB内で接続停止・同期リース無効化・資格情報消去を原子的に完了してからGoogle側の失効を試行し、失効失敗でも接続を復活させない
- **履歴の一貫性**: Google Health初回移行では前日まで365日分を最大90日単位で全取得した後、DBで一度だけ原子的に置換する。ユーザー単位の同期リースでCron・手動同期を直列化し、トークン更新・状態遷移・履歴置換・当日upsert・同期完了記録の全書き込みで同じリースIDを検証する。当日はGoogle Health／Fitbitとも保存済み最大値を維持する。Fitbit履歴は外部取得後にDB関数内で接続元を再検証し、Google Health接続・移行と競合した古い書き込みを拒否する。履歴差し替えで獲得済みUCは再計算・減額しない
- **同期結果の明示**: `/api/steps/sync` は更新、データなし、再認証待ち、別同期の進行中、利用不能を構造化コードで返し、歩数が取得できない状態を成功通知にしない
- **通知品質契約**: `users.language`から生成したja/en文言をRFC 8291暗号化payloadで端末へ届ける。バッジは個人・全体・グループをユーザー単位1通へ統合し、同一UA/legacy購読は最新1件、404/410 endpointは削除する。Push `Topic`とNotification `tag`で同種通知を置換し、通知ベルの集約単位と未読数も一致させる
- **ソーシャルデータの状態分離**: `/api/user/following` はプロフィール・歩数クエリ失敗を5xxで返し、歩数未記録は `hasTodaySteps: false`、実際の0歩は `hasTodaySteps: true` として区別する。ホームは `limit=5&sort=recent` で必要な5件だけを取得する
- **全ページ品質契約**: 17ユーザールートを共通Shell・競争・アカウント・商取引へ分け、正常/空/障害/権限/320px/キーボード状態を監査する。Portal Dialogは共通focus stack、視覚チャートは数値表、GROUPランキングはmembership認可を必須とする
- **認証ページUI契約**: 標準ページは`AuthenticatedPageHeader` + `PageIntro`で多色ブランド、context label、操作群、パンくず、唯一の`h1`、意味色アクセントを統一する。プロフィール導線はcanonical `/user/{username}`へ直接つなぎ、route固有スケルトンとServer確定日付で白画面・水和差を防ぐ
- **狭幅レスポンシブ契約**: 320pxから法務Footerと44px操作領域を維持し、1024pxはSidebar差引後の本文幅で設計する。複雑な多列化・詳細展開は1280pxへ送り、Shop/Settingsを含む通常ページは自然スクロールへ統一する
- **Home Quest契約**: 認証ホームは進捗・競争・歩いた価値・次の一歩を1つのQuest面で連結する。Mission→Weekly→Reward→Challengeの後はQuickActionsを独立補助Dockとし、Friend Pulseと週間Rankingをxlで直接同一行にする。Friend Pulseは個別目標と正歩数の活動人数/合計/達成人数、Rankingは次ライバル名/必要歩数を表示する。詳細Rankingは固定5行を維持し、Competition Missionへ現在順位・参加者数・次ライバル・トップ差を集約、外側多列化は2xlへ遅らせる
- **Challenge継続契約**: Challengesは参加中・active・開始済み・未終了・未達成・進捗取得済みを優先し、残り歩数→期限→報酬で並べる。主表示は最大500歩、期限/報酬は補足、作成は一覧後へ置く。期限は一覧・カード・参加APIでJST統一し、進捗不明を0へ変換しない
- **競争差の導線継続**: Homeで示す「あと何歩」を、歩数が記録されたユーザーのグローバルランキング・選択グループ・グループ詳細の自分順位サマリーでも表示する。0歩・不在時は順位・メダル・成功形の対象にせず、空行でランキング5行・72px固定仕様を維持する。取得失敗は未所属表示へ変換せず、Global/Group双方でエラーと再試行を明示する。計算は`getRankGapInsight()`へ集約する
- **Groups状態分離契約**: グループ内ユーザー順位とグループ対抗順位は正歩数だけを対象にし、ランキング配列長は「ランキング参加人数」と表示する。group/user/membership認可だけを詳細ページの必須境界とし、private group非メンバー404を維持する。メンバー一覧/件数、順位、比較、期間別競争の失敗は個別警告として、取得不能を0人・空順位・未所属へ変換せず、利用可能なイベント・チャット・ギア・週間レポートを継続する
- **ランキング期間コンテキスト**: 期間filterはURLの`period`を唯一の状態として共有し、既存クエリを保持したまま置換する。主要ナビと仲間発見導線は週次へ統一し、グループ詳細もHero直後の分析を週次で開始する。Global・Group・Group detailの表示、再読込、共有URL、リアクション取得を同じ期間へ揃え、旧期間のリアクション応答は中断する。filterは固定semantic色・チェック・高contrast境界を使い、短い期間名とチャート説明を分離する。下部の愛用ギアへは初期viewportの44px導線を残す
- **テーマ優先順位**: 明示的な端末内テーマを優先し、保存値がない端末だけDB装備テーマを初期値として使用する。item code変換は`lib/theme.ts`へ集約

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
|   +-- layout/              # AuthenticatedPageHeader / PageIntro / AppBrandMark 等の共通Shell
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
+-- types/                   # NextAuth拡張・Supabase Database型
+-- public/                  # 静的ファイル (PWA マニフェスト、アイコン)
+-- scripts/                 # ユーティリティスクリプト
+-- docs/                    # ドキュメント
|   +-- CLOUDFLARE_SETUP.md  # Cloudflare Pages セットアップ手順
|   +-- PRODUCT.md           # プロダクト・ブランド文脈
|   +-- improvement-report.md
|   +-- common-agentic-project-rules.md
|   +-- security-hardening-notes.md
+-- .github/
|   +-- copilot-instructions.md  # Copilot 共通指示
|   +-- instructions/            # 補助 Instructions (26 ファイル)
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
- **Google Cloud / Google Health 開発者設定** (Google Healthを有効化する場合)
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
- `GOOGLE_HEALTH_ENABLED` --- Google Healthの新規接続・再接続を制御する機能フラグ。既存接続の状態確認・同期・解除は暗黙のFitbit切替を防ぐため継続する
- `GOOGLE_HEALTH_CLIENT_ID` / `GOOGLE_HEALTH_CLIENT_SECRET` --- Google Health OAuth認証情報
- `GOOGLE_HEALTH_REDIRECT_URI` --- Google Health OAuthコールバックURL
- `FITNESS_TOKEN_ENCRYPTION_KEY` --- 健康データ接続トークン用の32バイトBase64 AES鍵
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` --- Supabase 接続情報
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` --- Web Push VAPID キー

### 5. DB マイグレーション

[migrations/](migrations/) 配下の SQL を Supabase Dashboard または `scripts/run_migration_pg.ts` で適用する。

Google Healthを有効化する前に
`migrations/20260617_add_multi_provider_connections.sql` を適用し、
`fitness_connections.user_id` の参照先が `public.users(id)` であることを確認する。
同マイグレーションはFitbitログインIDを継続同期するDBトリガー、
Google Health履歴を原子的に置換する `replace_daily_steps_range`、
当日の一時的な減少を保存済み最大値で防ぐ `upsert_daily_steps_max`、
Fitbit復帰後も同じ単調性とデータソース選択を検証する `upsert_fitbit_daily_steps_max`、
Cronと手動同期の競合を防ぐ所有者UUID付き同期リース関数も作成する。
トークン更新、再認証状態、同期完了時刻を含む同期由来の書き込みは
すべてDB関数内で同じリースIDの所有権を検証する。
解除は `disconnect_google_health` が接続停止、リース無効化、資格情報消去を
同一トランザクションで完了してから、Google側のトークン失効を試行する。
初回履歴は当日を含めず、全APIチャンク取得成功後に一度のDBトランザクションで置換する。
過去の歩数履歴を差し替えても、獲得済みUCはユーザー資産として再計算・減額しない。

### 6. 開発サーバーの起動

```shell
npm run dev
```

- **ポート 3000 必須** --- NextAuth OAuth コールバック URL が `localhost:3000` に固定されているため、別ポートでは認証が動作しない
- ポート 3000 が使用中の場合は先にプロセスをキルすること
- `upgrade-insecure-requests` は本番CSPだけで有効化する。開発CSPへ追加するとSafariが `/_next` のCSSをHTTPSへ変換し、未装飾の画面になる

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

### 公開LPのCore Web Vitals基準

- 公開LPはServer Componentを正本とし、言語切替・横スクロール案内・認証callback復元など、ブラウザ状態が必要な部分だけをClient islandにする
- 日本語本文はHiragino Sans / Yu Gothic / Meiryoのシステムフォントを使用する。複数weightの日本語Webフォントをグローバル配信する場合は、生成CSS・転送量とLCPを実測してから採用する
- Lighthouse Mobile（Fast 3G相当・CPU 4倍）でLCP 2.5秒未満、CLS 0.1未満を出荷基準とする
- 2026-07-16のF019基準値: LCP 2,349ms、CLS 0、操作Event Timing最大48ms。LCP要素はヒーロー説明文

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
| [.github/instructions/](.github/instructions/) | 補助 Instructions (26 ファイル: a11y, hooks, security, mobile 等) |

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
│   │  専門ロールを委任し、認証安全性・通知品質・Friend Pulse・Competition Mission・Challenge継続・固定ランキング・公開LPを完了前に実測
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
│   ├── 🧭 /common-agentic-rules-maintainer 共通 Agentic Engineering ルール継続改善
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
│   ├── 🔨 /agents/build-validation        ビルド検証・型・部分障害・リント
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
│   └── .github/instructions/ (26 files)   a11y / hooks / security / mobile 等
│
└── 🔧 Skills (再利用可能なドメイン知識)
    ├── modern-web-guidance                Chrome Modern Web Guidance / Baseline 2024 / Web 標準ベストプラクティス
    ├── self-critique-gate                 完了前の自己批判・Setup/Settings/Profile/Wallet/Groups状態分離・狭幅境界・44px・App Shell / PageIntro・水和・回帰防止ゲート
    ├── web-design-reviewer                UI/UX ビジュアルチェック・レスポンシブ検証
    ├── ucfitness-rule-enforcement         UCFitness 固有ルールの静的検出・強制
    ├── postgresql-optimization            PostgreSQL クエリ最適化・パフォーマンス分析
    └── next-intl-add-language             next-intl 翻訳キー追加ワークフロー
```

#### エージェント詳細一覧

| 名前 | ファイル | モデル | 役割 |
|---|---|---|---|
| **UCFitnessAgent** | [UCFitnessAgent.agent.md](.github/agents/UCFitnessAgent.agent.md) | - | マスターオーケストレーター。Setup/Settings/Profile/Wallet/Groups状態分離、Home Quest/Friend Pulse、Competition Mission、Challenge継続、認証App Shell、通知品質、固定ランキング、OAuth・同期安全性を統括する |
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
| [self-critique-gate](.github/skills/self-critique-gate/SKILL.md) | 完了前の自己批判ゲート。Setup/Settings/Profile/Wallet健康データ・狭幅境界・全操作44px・不可視table geometry・route coverage・App Shell / PageIntro・日付水和・固定ランキング・回帰証拠を確認する |
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
- Supabase等のファイル単位モックを確実に分離するため、`forks` pool + `isolate: true` を使用
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
- **Google Health段階移行** --- Fitbit Web APIの2026年9月終了予定に備えたopt-in移行。既存FitbitトークンはGoogle Healthへ移せないため、ユーザーの明示的な再同意が必要
- **Google Health最小権限** --- `googlehealth.activity_and_fitness.readonly` のみを要求し、日次歩数合計以外の健康・医療データを保存しない
- **Google Healthリリース前提** --- OAuth同意画面の本番公開、必要資格情報、暗号鍵、DBマイグレーションの準備が完了するまで `GOOGLE_HEALTH_ENABLED=false` を維持
- **デプロイ制限あり** --- Cloudflare Pages のデプロイ制限があるため、`git push` は明示的な許可後に実行すること

## 関連ドキュメント

| ドキュメント | 説明 |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | リリース単位の追加・変更・修正・既知制約 |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | Copilot 共通指示 (コーディング規約、ページパターン等) |
| [docs/PRODUCT.md](docs/PRODUCT.md) | 対象ユーザー、価値提案、ブランド人格、LPの段階的提示・狭幅補助情報の開示・モーション制約 |
| [docs/professional-ui-redesign-spec.md](docs/professional-ui-redesign-spec.md) | プロ品質 UI への大幅リデザイン設計書（殺風景化フィードバック対応を含む） |
| [docs/DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md) | デザイントークンシステム |
| [docs/improvement-report.md](docs/improvement-report.md) | 改善レポート |
| [docs/security-hardening-notes.md](docs/security-hardening-notes.md) | セキュリティ強化メモ |
| [.env.local.example](.env.local.example) | 環境変数テンプレート |
| [migrations/](migrations/) | DB マイグレーション SQL |

<details>
<summary>変更履歴 (クリックで展開)</summary>

詳細な変更履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。

### v0.1.0 (初期リリース)

- Fitbit 連携歩数トラッキング
- グループ対抗ランキング
- バッジ・コイン経済システム
- PWA 対応
- 日本語・英語 i18n

</details>
