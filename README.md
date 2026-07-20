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
| **バッジ & 称号** | 連続達成や累計歩数・順位に応じたバッジ獲得・称号付与システム |
| **コイン経済** | 歩数でコインを獲得し、7/30/100/365日のストリーク節目で一回限りの追加UCを受け取り、ショップでギアを購入 |
| **ギア & リアクション** | プロフィールギア装着、メンバーへのリアクション |
| **プッシュ通知** | 言語設定対応のWeb Push、バッジ横断集約、歩数リマインダー、ウィークリーサマリー、端末重複制御、通知嗜好が利用不能でも警告付きFeedを継続 |
| **i18n** | 日本語・英語の 2 言語対応 |
| **法務情報** | アプリ内の `/legal/terms` と `/legal/privacy` で利用条件・健康情報の注意・データ取扱いを ja/en で明示 |
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
- **Strict CSP**: HTML応答はEdge middlewareでrequestごとのnonceを生成し、Next.js scriptsへ自動付与する。productionのscript policyは`strict-dynamic` + nonceでnonceなしinline scriptと全inline handlerを拒否し、`base-uri 'none'`とsame-origin workerに制限する。HMR用`unsafe-eval`とDev Overlay用inline style elementは開発時だけ許可し、Reactの動的style属性はproductionでも`style-src-attr 'unsafe-inline'`を維持する
- **supabaseAdmin**: サーバーサイドの DB アクセスはサービスロールキーを使用
- **型安全性契約**: 外部データは具体型または `unknown` + 型ガードで扱い、Supabaseの選択列・RPC応答は`types/database.ts`のDatabase型から射影する。明示的な`any`と`no-explicit-any`抑制は使用しない
- **Dual-Library Strategy**: Google Health を明示的に接続したユーザーは同APIを優先し、未接続または明示解除したユーザーはFitbitを継続利用。再認証待ち・エラー時はデータ混在を避けるため暗黙切替しない
- **責務分離**: 認証IDの継続照合記録 (`user_auth_identities`) と健康データ接続 (`fitness_connections`) を分離する。ログインは `provider + provider_account_id` だけで照合し、メール一致による暗黙リンクは行わない
- **OAuthコールバック保護**: Google HealthのOAuth stateは有効期限・nonce・開始ユーザーIDをHMAC署名へ含め、コールバック時のセッションユーザー不一致をトークン交換前に拒否する。Google Health IDの継続性確認、更新トークン保持、資格情報保存はユーザー行ロック下の単一DB関数で原子的に行う
- **接続UX**: 設定画面でGoogle同意画面への外部遷移、読み取り範囲、再認証中の同期停止、Fitbitへの暗黙切替を行わないこと、解除後の同期元または同期停止を接続状況に応じて明示する。セッション切れ時は再認証通知を保持し、FitbitログインがUCFitness本人確認であることを説明して設定画面へ戻す
- **トークン保護**: Google HealthトークンはユーザーID・プロバイダ・用途をAADへ含めたAES-256-GCM v2で暗号化する。解除時はDB内で接続停止・同期リース無効化・資格情報消去を原子的に完了してからGoogle側の失効を試行し、失効失敗でも接続を復活させない
- **履歴の一貫性**: Google Health初回移行では前日まで365日分を最大90日単位で全取得した後、DBで一度だけ原子的に置換する。ユーザー単位の同期リースでCron・手動同期を直列化し、トークン更新・状態遷移・履歴置換・当日upsert・同期完了記録の全書き込みで同じリースIDを検証する。当日はGoogle Health／Fitbitとも保存済み最大値を維持する。Fitbit履歴は外部取得後にDB関数内で接続元を再検証し、Google Health接続・移行と競合した古い書き込みを拒否する。履歴差し替えで獲得済みUCは再計算・減額しない
- **同期結果の明示**: `/api/steps/sync` は更新、データなし、再認証待ち、別同期の進行中、報酬処理失敗、利用不能を構造化コードで返す。バッジ・称号・コインのいずれかが失敗した場合は保存済み歩数を保持しつつ同期成功にしない
- **コイン再計算の原子化**: 未適用の`migrations/20260721_atomic_daily_coin_recalculation.sql`と`migrations/20260721_atomic_historical_coin_backfill.sql`は、既知DDL・RLS・ACL・既存writerのユーザー行ロックをfail-closed検証し、STEPS減額、既存STEPS日の欠落、同一STEPS時のGOAL_BONUS/STREAK_BONUS減額を置換前に拒否する。日次・履歴RPCが入力・削除・再生成するのは歩数由来の`STEPS` / `GOAL_BONUS` / `STREAK_BONUS`だけで、別経路の獲得済み`RANK_BONUS`等を保持したまま全台帳残高を同一transactionで再集計する。日次RPCだけがアプリ接続済みで、履歴RPCのPhase B wiring、実catalog実行、DB適用は未実施
- **通知品質契約**: `users.language`から生成したja/en文言をRFC 8291暗号化payloadで端末へ届ける。バッジは個人・全体・グループをユーザー単位1通へ統合し、同一UA/legacy購読は最新1件、404/410 endpointは削除する。Push `Topic`とNotification `tag`で同種通知を置換し、通知ベルの集約単位と未読数も一致させる
- **ストリーク節目報酬契約**: 完了済みJST日と全シールド利用履歴をDBで再検証し、7/30/100/365日の限定バッジと固定UCを一回だけ付与する。歩数同期・ミッション入金・節目加算は同じユーザー行ロックへ直列化する
- **ソーシャルデータの状態分離**: `/api/user/following` はプロフィール・歩数クエリ失敗を5xxで返し、歩数未記録は `hasTodaySteps: false`、実際の0歩は `hasTodaySteps: true` として区別する。ホームは `limit=5&sort=recent` で必要な5件だけを取得する
- **公開プロフィールAPIの入力契約**: Achievement進捗と年間歩数カレンダーは認証を要求しつつ、UUID検証済みの公開target `userId`をそのまま照会する。フォロー状態と公開リアクションもtarget UUID・emoji・periodをDB操作前に検証する。プロフィール/バナー画像の保存拡張子は元ファイル名ではなく検証済みMIMEから決定し、`contentType`と一致させる
- **全ページ品質契約**: 17ユーザールートを共通Shell・競争・アカウント・商取引へ分け、正常/空/障害/権限/320px/キーボード状態を監査する。Portal Dialogは共通focus stack、視覚チャートは数値表、GROUPランキングはmembership認可を必須とする
- **認証ページUI契約**: 標準ページは`AuthenticatedPageHeader` + `PageIntro`で多色ブランド、context label、操作群、パンくず、唯一の`h1`、意味色アクセントを統一する。プロフィール導線はcanonical `/user/{username}`へ直接つなぎ、route固有スケルトンとServer確定日付で白画面・水和差を防ぐ
- **狭幅レスポンシブ契約**: 320pxから法務Footerと44px操作領域を維持し、1024pxはSidebar差引後の本文幅で設計する。複雑な多列化・詳細展開は1280pxへ送り、Shop/Settingsを含む通常ページは自然スクロールへ統一する
- **Home Quest契約**: 認証ホームは進捗・競争・歩いた価値・次の一歩を1つのQuest面で連結する。Mission→Weekly→Reward→Challengeの後はQuickActionsを独立補助Dockとし、Friend Pulseと週間Rankingをxlで直接同一行にする。Friend Pulseは個別目標と正歩数の活動人数/合計/達成人数、Rankingは次ライバル名/必要歩数を表示する。詳細Rankingは固定5行を維持し、Competition Missionへ現在順位・参加者数・次ライバル・トップ差を集約、外側多列化は2xlへ遅らせる
- **Challenge継続契約**: Challengesは参加中・active・開始済み・未終了・未達成・進捗取得済みを優先し、残り歩数→期限→報酬で並べる。主表示は最大500歩、期限/報酬は補足、作成は一覧後へ置く。期限は一覧・カード・参加APIでJST統一し、進捗不明を0へ変換しない
- **競争差の導線継続**: Homeで示す「あと何歩」を、歩数が記録されたユーザーのグローバルランキング・選択グループ・グループ詳細の自分順位サマリーでも表示する。0歩・不在時は順位・メダル・成功形の対象にせず、空行でランキング5行・72px固定仕様を維持する。取得失敗は未所属表示へ変換せず、Global/Group双方でエラーと再試行を明示する。計算は`getRankGapInsight()`へ集約する
- **Amazon CTA実験契約**: プロフィール・ホーム・ShopのAmazon導線はセッション内で安定した配置/文言2×2実験を行い、50%以上を1秒表示したimpressionとclickだけをPIIなしの構造化platform logへ送る。価格・配送はAPI値を推測せずAmazon.co.jp確認と明記し、PR開示と`sponsored` linkを必須にする
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
|   |   +-- badge-awards.ts     # ランキング・個人・ストリーク節目バッジ付与
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
|   +-- skills/                  # Copilot スキル (6 スキル)
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

#### F016 Supabase RLS 強化

Phase 1 は `migrations/20260720_harden_api_keys_rls.sql` で、外部ランキング認証に使う
`api_keys` を保護する。UCFitness は NextAuth と `public.users` を正本とし、
Supabase Auth の `auth.uid()` / `auth.users` は使用しない。アプリのDB呼び出しは
サーバー専用の `supabaseAdmin`（`service_role`）経由であり、anon clientの直接利用はない。

`origin/main` のコードから参照される25テーブルはすべてservice-role-onlyに分類した。
browser/anon必須テーブルは0件。追跡済みmigrationに完全なschema一覧がないため、
実DBだけに存在するテーブルは未分類であり、F016は全テーブル完了までin-progressとする。
`avatars` / `group-assets` はSupabase Storage bucketのため、この表分類には含めない。

Phase 1 migrationはpolicyを作らず、通常roleをdefault denyにする。`PUBLIC` / `anon` /
`authenticated`と既存の`service_role`権限を剥奪後、稼働中の経路に必要な
8列の`SELECT`と`last_used_at`列の`UPDATE`だけを`service_role`へ再付与する。
テーブル、列、`public.users(id)` FK、所有者、既存policy、`service_role BYPASSRLS`が
期待と異なる場合は同一トランザクションを中止する。`FORCE ROW LEVEL SECURITY`は使わない。
APIキーの平文`key`列とlegacy照合の廃止はPhase 1対象外で、後続Phaseで扱う。

Phase 2 は `migrations/20260720_harden_push_subscriptions_rls.sql` で、
`push_subscriptions` を保護する。購読登録は`INSERT`/`UPDATE`、配信・再購読重複整理は
`SELECT`、解除・404/410 cleanupは`DELETE`を使い、すべて`supabaseAdmin`経由である。
browser clientは`/api/push/subscribe`だけを呼び、Supabaseへ直接接続しない。

Phase 2 migrationは既知7列の型・nullability、`public.users(id)`へのcascade FK、
主キー、`(user_id, endpoint)` unique制約、owner、policy、BYPASSRLSを検証する。
全ACLを剥奪後、`service_role`へ7列SELECT、ID以外6列のINSERT/UPDATE、table DELETE、
対象table所有sequenceだけのUSAGEを付与する。追跡済み履歴は完全なschema manifestでは
ないため、未知の追加列・default・indexの完全性と実catalogは未検証である。
初期作成履歴には旧policyがあるため、実catalogに残存していればmigrationは自動削除せず
中断し、適用前の個別確認と承認を要求する。

Phase 3 は `migrations/20260720_harden_coin_transactions_rls.sql` で、高整合性台帳
`coin_transactions` を保護する。直接経路は履歴・Wallet・export・週次通知の`SELECT`、
歩数再計算・ログインボーナス・backfillの`INSERT`/`UPDATE`/`DELETE`を使う。原子RPCも
追跡済みSQLでは既定の`SECURITY INVOKER`であるため、`service_role`へ8列SELECT、
書込み6列INSERT/UPDATE、table DELETE、対象所有sequenceのUSAGEだけを付与する。
既知8列、UUID/時刻default、`public.users(id)` FK、主キー、type check、idempotency
unique index、owner、policy、BYPASSRLSが一致しなければtransactionを中止する。

Phase 4 は `migrations/20260720_harden_coin_balances_rls.sql` で`coin_balances`を保護する。
直接8経路は7列の`SELECT`だけであり、service_roleへ直接DMLを許可しない。既存4 writer
RPCはtable owner、BYPASSRLS、固定search_path、限定EXECUTEを検証後、関数を置換せず
`SECURITY DEFINER`へ変更する。既知8列、default、`public.users(id)` FK、主キー、非負
check、owner、policy、所有sequenceなしが不一致なら中止する。Group reward migrationは
現stacked baseにないため、後続統合時は`credit_balance`のcatalog契約を再確認する。

Phase 5 は `migrations/20260720_harden_user_badges_rls.sql` で`user_badges`を保護する。
直接5 SELECT・2 INSERTと手動upsertに合わせ、service_roleへ7列SELECT、5列INSERT、競合3列UPDATEだけを許可する。
既知schema・3 FK・PK/unique・default・owner・policy・所有sequenceなしと既存atomic RPC境界が不一致なら中止する。

Phase 6 は `migrations/20260720_harden_badges_rls.sql` で定義表`badges`を保護する。
直接2 SELECT・`user_badges` relation 2 SELECTに必要な8列だけをservice_roleへ許可し、直接DMLは許可しない。
raw SQL seedはowner実行境界として分離し、既知schema・PK/unique・incoming FK・owner・policy・所有sequenceなしが不一致なら中止する。

Phase 7 は個人データ`walking_routes`を候補として監査したが、migrationを作らない
audit-onlyとした。現行コードにはserver-sideの`.from('walking_routes')`が6件あり、
一覧`SELECT`、件数`SELECT`、`INSERT`＋returning `SELECT`、所有者確認`SELECT`、
`UPDATE`＋returning `SELECT`、`DELETE`をすべて`supabaseAdmin`で実行する。
各routeは`user_id = session.user.id`を維持し、browser componentは同一origin APIだけを
呼び、Supabase clientを直接利用しない。

入力境界は、POSTでname/description/distance/duration/difficulty、PATCH/DELETEで
route IDのUUIDを検証する。PATCHの所有者確認`SELECT`は`PGRST116`だけを404とし、
その他のDB障害や`data: null, error: null`の不正shapeは更新前に報告して500を返す。

schema確定後に限るgrant候補は、`service_role`へ12列のcolumn `SELECT`、
`user_id` / `name` / `description` / `distance_km` / `duration_minutes` /
`difficulty`のcolumn `INSERT`、`updated_at` / `is_favorite` / `walk_count` /
`last_walked_at` / `name` / `description`のcolumn `UPDATE`、table `DELETE`、
実在するowned sequenceだけの`USAGE`である。`PUBLIC` / `anon` /
`authenticated`には権限を残さず、policy、`auth.uid()`、`FORCE ROW LEVEL SECURITY`、
`GRANT ALL`は追加しない。ただしこれは現行コードから得た必要権限候補であり、
schema証拠ではないため、今回grantも実行していない。

コードから確認できる使用列は`id` / `user_id` / `name` / `description` /
`distance_km` / `duration_minutes` / `difficulty` / `is_favorite` / `walk_count` /
`last_walked_at` / `created_at` / `updated_at`である。しかし`origin/main`には
`walking_routes`の追跡DDLも`types/database.ts`のDatabase型もなく、
`docs/improvement-report.md`が参照する`migrations/023_walking_routes.sql`も
Git履歴に存在しない。実catalog用の接続文字列、`.env.local`、`psql`、Supabase CLIも
このworkspaceにないため、型、nullability、default、`public.users(id)` FK、PK、
unique/check、owner、RLS/policy、ACL、owned sequenceを安全に確定できない。
これらをコードから推測したfail-closed migrationは作成せず、production /
nonproduction DBへの接続・適用・read/writeも実施していない。

Phase 8 はソーシャルグラフ`user_follows`を候補として監査したが、Phase 7と同様に
migrationを作らないaudit-onlyとした。現行コードには8つのserver routeから9件の
`.from('user_follows')`があり、7 `SELECT`、1 `INSERT`、1 `DELETE`をすべて
`supabaseAdmin`で実行する。直接`UPDATE` / upsertは存在しない。browser componentは
`/api/user/follow`、`/api/user/follow/status`、`/api/user/following`、
`/api/user/following-comparison`、`/api/user/feed`等のsame-origin APIだけを呼び、
Supabase clientへ直接接続しない。

使用する読取列は`id` / `follower_id` / `following_id` / `created_at`、作成列は
`follower_id` / `following_id`である。解除は認証ユーザーを`follower_id`に固定し、
対象の`following_id`と組み合わせて削除する。schema確定後の`service_role`へのgrant候補は4列のcolumn `SELECT`、
`follower_id` / `following_id`のcolumn `INSERT`、table `DELETE`、実在するowned
sequenceだけの`USAGE`である。`PUBLIC` / `anon` / `authenticated`には権限を残さず、
policy、`auth.uid()`、`FORCE ROW LEVEL SECURITY`、`GRANT ALL`は追加しない。

`types/database.ts`の`UserFollowRow`は4列を非nullableなTypeScript値として表し、
`INSERT`は`id` / `created_at`を省略するため両列の自動生成に依存する。ただし、
DB default、generated列、trigger等のどの仕組みで補うかは追跡証拠から確定できない。
一方、現行treeにもGit履歴にも`user_follows`の追跡DDLはなく、型はPostgreSQLの
`uuid`と`text`、`timestamp with time zone`と`timestamp without time zone`、
default式の違いを証明しない。2つの`public.users(id)` FKと削除動作、PK、
`(follower_id, following_id)` unique、self-follow check、owner、既存RLS/policy、
table/column ACL、owned sequenceも実catalogなしでは確定できない。アプリのUUID検証、
重複時`23505`処理、自分自身の拒否はschema制約の証拠として扱わない。

このためfail-closed差異判定の期待値を推測せず、Phase 8もproduction / nonproduction
DBへの接続・適用・read/writeを行っていない。保護済み件数は9/25のまま、F016は
in-progressを維持する。migration設計前にはPhase 7のread-only catalog queryで
対象名だけを`public.user_follows`へ置き換え、全結果をDB管理者と確認する。

#### Phase 9: `daily_steps` audit-only

`daily_steps`は歩数履歴を保持する高感度健康データである。現行treeの追跡済み
migrationには完全DDLがない。Git履歴の`46a3af7:supabase_schema.sql`
（SHA-256 `261aa4b63d97ac3b924fc46a57109c2f4371a584c3ab63535f71157b5bedad31`）
には旧完全DDLがあるが、nullableな`user_id`、checkなしの`steps`、公開SELECT
policyを含む古いsnapshotであり現行catalogの証拠にはできない。
`types/database.ts`も3列だけで`id` / timestampsを欠く。承認済みread-only
実catalog接続がなく、現行default/nullability/PK/FK/unique/check/owner/ACL/
RLS/policy/owned sequenceを確定できないためaudit-onlyとし、9/25に据え置く。

コメントを除外した実行可能コードには32 ファイル、41 件のdirect PostgREST
経路があり、すべてservice-roleの`SELECT`だった。direct `INSERT` / `UPDATE` /
`DELETE` / upsertとbrowser clientからの直接接続はない。

| 分類 | direct経路（件数） | 認可・エラー境界 |
|---|---|---|
| Home / profile / analytics | `app/[locale]/page.tsx` (1), `app/[locale]/user/[username]/page.tsx` (2), `app/[locale]/wallet/page.tsx` (1), `app/[locale]/debug/session/page.tsx` (1), `lib/services/analytics-service.ts` (1) | Server Component / service。profileとanalyticsは取得失敗をunavailable / throwへ分離 |
| Group / challenge | `app/[locale]/groups/[groupId]/page.tsx` (1), `app/api/challenge/[challengeId]/progress/route.ts` (2), `app/api/challenge/[challengeId]/route.ts` (1), `app/api/group/[groupId]/events/[eventId]/route.ts` (1), `app/api/group/[groupId]/ranking/route.ts` (1), `app/api/group/[groupId]/weekly-report/route.ts` (1), `lib/services/group-comparison-service.ts` (1) | session / membership認可後の期間集計。一部の参加者・歩数結果は別Fix候補 |
| Reward / achievement | `app/api/amazon/personalized/route.ts` (1), `app/api/user/achievement-progress/route.ts` (2), `app/api/user/achievements/route.ts` (2), `app/api/user/missions/route.ts` (2), `app/api/user/step-calendar/route.ts` (1), `app/api/user/weekly-goal/route.ts` (1), `lib/services/badge-allocator.ts` (1), `lib/services/badge-awards.ts` (3), `lib/services/coin-service.ts` (2), `lib/services/title-achievement-service.ts` (2) | session / service / cron境界。複数経路がDB errorを0・未達成・no dataへ変換するため別Fix候補 |
| Social / export | `app/api/user/following/route.ts` (1), `app/api/user/following-comparison/route.ts` (1), `app/api/user/export/route.ts` (1) | session userを固定。following-comparisonの部分障害境界は別Fix候補 |
| Cron / integration / debug | `app/api/cron/step-reminder/route.ts` (1), `app/api/cron/weekly-summary/route.ts` (1), `app/api/external/ranking/route.ts` (1), `app/api/notify-teams/route.ts` (1), `app/api/debug/db-check/route.ts` (1) | cron secret / API key / sessionを各routeで検証 |
| Utility / script | `lib/supabase-utils.ts` (1), `scripts/check_group_info.ts` (1) | server helper / service-role運用script。JSDoc例は件数から除外 |

関連RPC呼び出しは合計10件である。4 writerは
`migrations/20260617_add_multi_provider_connections.sql`に追跡され、
`search_path = ''`、lease/source conflict guard、service-role限定`EXECUTE`を持つ。
追跡DDL上は`SECURITY DEFINER`指定がなく、既定invoker権限で`daily_steps`を更新する。

| RPC | 呼び出し | read / write契約 |
|---|---:|---|
| `replace_daily_steps_range` | 1 | Google Health lease所有権を`FOR UPDATE`で検証し、期間`DELETE`後に取得済み行を`INSERT ... ON CONFLICT DO UPDATE`で置換 |
| `upsert_daily_steps_max` | 1 | Google Health lease必須。当日値を`GREATEST`で単調upsertし、確定`steps`を返す |
| `upsert_fitbit_daily_steps_max` | 1 | Fitbit userとGoogle Health状態をlockし、source conflict時は拒否。単調upsertして確定`steps`を返す |
| `upsert_fitbit_daily_steps_batch` | 1 | 最大1000入力、履歴権威とsource conflictをlock下で検証し、単調batch upsert |
| `get_user_step_stats` | 4 | 全期間集計read。型と呼び出しだけがあり、SQL定義、owner、security mode、`search_path`、`EXECUTE` ACLは未追跡 |
| `get_batch_user_step_totals` | 1 | badge batch集計read。SQL定義、owner、security mode、`search_path`、`EXECUTE` ACLは未追跡 |
| `award_streak_milestones` | 1 | `daily_steps`をreadし、Phase 4 migrationでowner固定・`SECURITY DEFINER`・service-role限定`EXECUTE`を検証済み |

完全schema取得後もdirect操作と関数内部操作を分離する。direct grant候補は
service-roleの`SELECT`だけで、直接DMLは現行経路にない。ただし`select('*')` /
count経路が存在するため、列grantは全列catalogなしに確定できない。writerを
definer化する場合だけ、実catalogでowner / BYPASSRLS / `prosecdef` / 固定
`search_path` / 限定`EXECUTE`を検証し、lease ownership、monotonic upsert、
history replacement、source conflict guardを保持した後にdirect DMLを除去する。
`GRANT ALL`、`auth.uid()`、`auth.users`、broad policy、
`FORCE ROW LEVEL SECURITY`は使用しない。

PostgREST既定1000行上限について、global/group rankingの共通helperは900行
OFFSET paginationと一意な`date,user_id`順序を使うが、stable orderは
snapshotではない。同期中に別pageへ移ると集計時点は混在し得る。exportは
最大365日、profileは直近400日で上限内だが、全ユーザーの当日badge候補、
10ユーザー×30日履歴、GROUP challenge/rankingの参加者×期間は1000行を超え得る。
ループ内のユーザー単位`daily_steps` N+1は検出していない。ランキングは集計後に
正歩数だけを順位化する。recorded 0は行として分母に含め、missing rowと区別する。

高確度のDB error fallbackはRLS変更へ混ぜず、別Fix候補とする。

| 経路 | 現在の偽装 | 正しい障害境界 |
|---|---|---|
| `app/api/user/achievements/route.ts` | 修正前はcount / goal / `get_user_step_stats` errorを0歩・0日・未達成へ変換 | DB障害・未設定・不正shapeを0や10,000へ偽装せず、query別の固定5xxで判定停止 |
| `lib/services/badge-allocator.ts` | 修正前は日次歩数・累計RPC errorを0へ変換しbadge未達成として継続 | DB障害・不正shapeを未達成へ偽装せず対象ユーザーの割当失敗として隔離し、insert成功後だけ通知 |
| `lib/services/badge-awards.ts` | Phase A/Bに続きPhase Cでstreak milestone RPCのexact row・報酬・SQLSTATE・重複を検証し、部分成功は成功通知後に固定AppErrorでCronへ伝播。Teams enrichmentはuser/badge全件の検証失敗を固定AppErrorだけで1回reportし、主バッジ付与を維持 | badge-awards coreの依存障害分離は完了。Teams webhook transport自体のbest-effort処理は`lib/api/teams.ts`の別境界で維持 |
| `lib/services/title-achievement-service.ts` | 修正前は歩数・目標・残高・件数のerrorを0または既定値へ変換 | DB障害・未設定・不正shapeを未達成へ偽装せず、称号付与だけを失敗として隔離 |
| `lib/services/coin-service.ts` | 修正前はbackfillのuser / steps errorを未記録・no dataとしてreturnし、DELETE / batch INSERT失敗後も処理を継続 | DB error・不正shape・未来日・重複/非昇順・計算overflowを原子RPC前に固定AppErrorで拒否する。全履歴のexact 4-key payloadを`apply_coin_backfill`へ1回だけ渡し、RPC失敗・不正応答を固定AppErrorとして伝播する。direct DELETE / batch INSERT / 残高再計算へfallbackせず、`RANK_BONUS`等の別経路報酬はPhase A RPC側で保持する |
| `app/api/user/following-comparison/route.ts` | follow / users / steps errorを空比較・`Unknown`・日別0歩へ変換 | dependencyごとに5xxまたは部分障害を返し、missing / recorded 0と分離 |

`migrations/20260721_atomic_historical_coin_backfill.sql`は、履歴全件の検証、stale guard、
歩数由来3種の置換、全台帳残高再集計を単一transactionへ閉じ込めるPhase Aである。
Phase Bでは`backfillCoinsForUser`を同RPCへ接続済みで、payloadの`user_id`除外、
exact `{date,type,amount,description}`、exact `{success:true}`応答、direct writer不在を
アプリ側でも固定した。実catalog接続・SQL実行・DB適用は未実施のままとする。
Phase 9で必要なtable catalogは、下記blockの対象
`public.walking_routes`を`public.daily_steps`へ置換して同じread-only transactionで
取得する。加えて、未追跡aggregation RPCを含む関数owner / security / config /
ACL / dependencyを次のSQLで取得する。これは承認後のread-only接続専用であり、
今回のPRではDBへ接続・実行していない。

```sql
BEGIN TRANSACTION READ ONLY;

WITH expected(signature) AS (
  VALUES
    ('public.replace_daily_steps_range(uuid,date,date,jsonb,uuid)'::text),
    ('public.upsert_daily_steps_max(uuid,date,integer,uuid)'::text),
    ('public.upsert_fitbit_daily_steps_max(uuid,date,integer)'::text),
    ('public.upsert_fitbit_daily_steps_batch(uuid,jsonb)'::text),
    ('public.award_streak_milestones(date)'::text)
)
SELECT signature, to_regprocedure(signature) AS oid
FROM expected
ORDER BY signature;

SELECT
  procedure.oid::regprocedure AS routine,
  owner.rolname AS owner,
  owner.rolbypassrls AS owner_bypassrls,
  language.lanname,
  procedure.prosecdef,
  procedure.proconfig,
  procedure.proacl,
  pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
  pg_get_functiondef(procedure.oid) AS function_definition,
  has_function_privilege('service_role', procedure.oid, 'EXECUTE') AS service_role_execute,
  has_function_privilege('authenticated', procedure.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', procedure.oid, 'EXECUTE') AS anon_execute
FROM pg_proc AS procedure
JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
JOIN pg_roles AS owner ON owner.oid = procedure.proowner
JOIN pg_language AS language ON language.oid = procedure.prolang
WHERE namespace.nspname = 'public'
  AND procedure.proname = ANY (ARRAY[
    'replace_daily_steps_range', 'upsert_daily_steps_max', 'upsert_fitbit_daily_steps_max',
    'upsert_fitbit_daily_steps_batch', 'get_user_step_stats',
    'get_batch_user_step_totals', 'award_streak_milestones'
  ])
ORDER BY procedure.oid::regprocedure::text;

WITH target AS (
  SELECT to_regclass('public.daily_steps') AS oid
)
SELECT
  procedure.oid::regprocedure AS routine,
  dependency.deptype,
  referenced.oid::regclass AS referenced_relation
FROM pg_proc AS procedure
JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
CROSS JOIN target
LEFT JOIN pg_depend AS dependency
  ON dependency.classid = 'pg_proc'::regclass
 AND dependency.objid = procedure.oid
 AND dependency.refclassid = 'pg_class'::regclass
 AND dependency.refobjid = target.oid
LEFT JOIN pg_class AS referenced ON referenced.oid = dependency.refobjid
WHERE namespace.nspname = 'public'
  AND procedure.proname = ANY (ARRAY[
    'replace_daily_steps_range', 'upsert_daily_steps_max', 'upsert_fitbit_daily_steps_max',
    'upsert_fitbit_daily_steps_batch', 'get_user_step_stats',
    'get_batch_user_step_totals', 'award_streak_milestones'
  ])
ORDER BY procedure.oid::regprocedure::text, dependency.deptype;

SELECT
  procedure.oid::regprocedure AS routine,
  grantor.rolname AS grantor,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_proc AS procedure
JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
LEFT JOIN LATERAL aclexplode(
  COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
) AS acl ON true
LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
WHERE namespace.nspname = 'public'
  AND procedure.proname = ANY (ARRAY[
    'replace_daily_steps_range', 'upsert_daily_steps_max', 'upsert_fitbit_daily_steps_max',
    'upsert_fitbit_daily_steps_batch', 'get_user_step_stats',
    'get_batch_user_step_totals', 'award_streak_milestones'
  ])
ORDER BY procedure.oid::regprocedure::text, grantee.rolname;

ROLLBACK;
```

`pg_depend`はclass/refclassを限定して補助証拠として取得するが、PL/pgSQL本文の
table参照を完全には記録しない。必ず`pg_get_functiondef`の完全定義と照合する。

RLS変更とは分離すべき高確度のerror fallbackも監査した。

| 経路 | 現行のDB障害時挙動 | 別Fix候補 |
|---|---|---|
| `POST /api/user/follow`の対象ユーザー確認 | `users`照会errorを取得せず404へ変換 | DB errorを報告して5xx |
| `GET /api/user/followers`のプロフィール取得 | `users`照会errorを取得せず欠落行または空の200へ変換 | 取得不能を空状態から分離 |
| `GET /api/user/following-comparison` | `user_follows`照会errorを空比較へ、users/steps errorを`Unknown`/0歩へ変換 | 各errorを報告して非成功応答 |
| group invite anti-abuse | `user_follows`照会errorを「フォローなし」の403へ変換 | 権限拒否とDB障害を分離 |

migration設計前に、DB管理者が承認したread-only接続で次を保存する。結果に未知の列、
制約、policy、grantee、owner、BYPASSRLS、sequenceがあれば設計を中止して個別に確認する。

```sql
BEGIN TRANSACTION READ ONLY;

SELECT c.relkind, c.relrowsecurity, c.relforcerowsecurity,
       owner.rolname AS owner_name, owner.rolbypassrls AS owner_bypassrls
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_roles AS owner ON owner.oid = c.relowner
WHERE c.oid = pg_catalog.to_regclass('public.walking_routes');

SELECT a.attnum, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
       a.attnotnull, a.attgenerated,
       pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute AS a
LEFT JOIN pg_catalog.pg_attrdef AS d
  ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = pg_catalog.to_regclass('public.walking_routes')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

SELECT conname, contype, convalidated, confrelid::regclass AS referenced_table,
       confdeltype, pg_catalog.pg_get_constraintdef(oid, true) AS definition
FROM pg_catalog.pg_constraint
WHERE conrelid = pg_catalog.to_regclass('public.walking_routes')
ORDER BY contype, conname;

SELECT indexrelid::regclass AS index_name, indisprimary, indisunique,
       pg_catalog.pg_get_indexdef(indexrelid) AS definition
FROM pg_catalog.pg_index
WHERE indrelid = pg_catalog.to_regclass('public.walking_routes')
ORDER BY indexrelid::regclass::text;

SELECT tgname, tgtype, tgenabled, pg_catalog.pg_get_triggerdef(oid, true) AS definition
FROM pg_catalog.pg_trigger
WHERE tgrelid = pg_catalog.to_regclass('public.walking_routes')
  AND NOT tgisinternal
ORDER BY tgname;

SELECT polname, polcmd, polpermissive, polroles, polqual, polwithcheck
FROM pg_catalog.pg_policy
WHERE polrelid = pg_catalog.to_regclass('public.walking_routes');

SELECT COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
       privilege.privilege_type, privilege.is_grantable
FROM pg_catalog.pg_class AS c
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
) AS privilege
LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
WHERE c.oid = pg_catalog.to_regclass('public.walking_routes')
ORDER BY grantee, privilege.privilege_type;

SELECT a.attname AS column_name,
       COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
       privilege.privilege_type, privilege.is_grantable
FROM pg_catalog.pg_attribute AS a
CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS privilege
LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
WHERE a.attrelid = pg_catalog.to_regclass('public.walking_routes')
  AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
ORDER BY a.attnum, grantee, privilege.privilege_type;

SELECT sequence.oid::regclass AS owned_sequence, dependency.deptype,
       dependency.refobjsubid AS owning_column_number,
       owner.rolname AS owner_name, sequence.relacl
FROM pg_catalog.pg_class AS sequence
JOIN pg_catalog.pg_depend AS dependency
  ON dependency.objid = sequence.oid AND dependency.deptype IN ('a', 'i')
JOIN pg_catalog.pg_roles AS owner ON owner.oid = sequence.relowner
WHERE sequence.relkind = 'S'
  AND dependency.refobjid = pg_catalog.to_regclass('public.walking_routes');

SELECT sequence.oid::regclass AS owned_sequence,
       COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
       privilege.privilege_type, privilege.is_grantable
FROM pg_catalog.pg_class AS sequence
JOIN pg_catalog.pg_depend AS dependency
  ON dependency.objid = sequence.oid AND dependency.deptype IN ('a', 'i')
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(sequence.relacl, pg_catalog.acldefault('S', sequence.relowner))
) AS privilege
LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
WHERE sequence.relkind = 'S'
  AND dependency.refobjid = pg_catalog.to_regclass('public.walking_routes')
ORDER BY sequence.oid::regclass::text, grantee, privilege.privilege_type;

SELECT rolname, rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role');

SELECT member_role.rolname AS member_role,
       granted_role.rolname AS granted_role,
       membership.admin_option
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
WHERE member_role.rolname IN ('anon', 'authenticated', 'service_role')
   OR granted_role.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY member_role.rolname, granted_role.rolname;

ROLLBACK;
```

適用前に読み取り専用で `pg_class` / `pg_roles` / `pg_policy` /
`pg_proc` / `information_schema.role_table_grants` / `column_privileges` /
`routine_privileges` を確認し、owner・BYPASSRLS・policy・ACL・関数属性を保存する。production /
nonproductionへの適用は明示承認後のみ実施する。

ロールバックは、最初に`service_role`の最小GRANTを前方修正し、それで復旧しない場合のみ
対象tableのRLSを無効化する。anon/authenticatedへの再GRANTは保存した適用前ACLに基づく
明示的なセキュリティ承認がある場合だけ行う。

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
| `npm run audit:responsive` | Playwright レスポンシブ/a11y監査 (320 / 375 / 768 / 1024 / 1920px、ja/en) |
| `npm test` | Vitest テスト実行 |
| `npm run test:watch` | Vitest ウォッチモード |
| `npm run test:coverage` | テストカバレッジレポート |

### 公開LPのCore Web Vitals基準

- 公開LPはServer Componentを正本とし、言語切替・横スクロール案内・認証callback復元など、ブラウザ状態が必要な部分だけをClient islandにする
- モバイルのファーストビューでは、歩数カードに「次は300歩」の再開行動を表示し、ログインCTAの連携説明を隠さない
- 日本語本文はHiragino Sans / Yu Gothic / Meiryoのシステムフォントを使用する。複数weightの日本語Webフォントをグローバル配信する場合は、生成CSS・転送量とLCPを実測してから採用する
- Lighthouse Mobile（Fast 3G相当・CPU 4倍）でLCP 2.5秒未満、CLS 0.1未満を出荷基準とする
- 2026-07-16のF019基準値: LCP 2,349ms、CLS 0、操作Event Timing最大48ms。LCP要素はヒーロー説明文

### Client bundle budget

- `npm run build` のroute表で、全ページのFirst Load JSを200KB未満に保つ
- Client Componentと共有するmoduleからSupabase等のserver-only依存を静的importしない
- Recharts、下部チャット、ギア等の非critical UIはClient境界内の`next/dynamic`とviewport判定で遅延し、loading名、`aria-busy`、低減モーション、JS無効時の主要情報を維持する
- 2026-07-18のF020実測: wallet 260→141KB、group detail 207→152KB、leaderboard 198→146KB。遅延chunkの存在と初期route manifestからの分離も同じproduction buildで確認した
- ランキング/Feedの1ページロードは10クエリ未満を維持し、独立queryを並列化して依存waveを減らす。daily_stepsはdate+user ID、同歩数・同平均はIDで決定順を保つ。2026-07-18のF021固定RTTモデルではGROUP ranking 6→4クエリ、Feed 10→8クエリ、依存waveはいずれも6→4で、待ち時間は33.3%改善。実Supabaseログ、production p95、本番index/EXPLAIN、更新中データの複数ページsnapshot整合性は未検証のためF021はin-progress

### i18n quality

- 英語の購入確認CTAは具体的な動詞`Purchase`を使い、`×`値のストリーク表示は英語`Streak Multiplier`・日本語`ストリーク倍率`へ統一する

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

`UCFitnessAgent.agent.md` はセッション開始・ロール選択・完了契約に集中するオーケストレーターです。詳細ルールと Lessons Learned は `.github/copilot-instructions.md`、`.github/instructions/`、`.github/skills/`、`.agents/skills/` を正本とし、`npm run check:agents` で prompt の 30,000 Unicode 文字上限と、agent picker 用 profile 全体の 24,000 UTF-8 bytes 運用上限を検証します。

#### エージェント組織階層図 (テキスト版)

```
👤 User (VS Code Chat Panel / Slash Commands)
│
├── ⚙️ UCFitnessAgent [Orchestrator — Layer 1]
│   │  専門ロールを委任し、認証・同期・並行membershipの原子性、通知品質、Friend Pulse、Competition Mission、Challenge継続、固定ランキング、公開LPを完了前に検証
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
│   │   │   ├── 🔧 [hallmark skill]
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
    ├── hallmark                           新規UI・監査・再設計・design DNA抽出のデザイン規律
    ├── self-critique-gate                 完了前の自己批判・Setup/Settings/Profile/Wallet/Groups状態分離・狭幅境界・44px・App Shell / PageIntro・水和・回帰防止ゲート
    ├── web-design-reviewer                UI/UX ビジュアルチェック・レスポンシブ検証
    ├── ucfitness-rule-enforcement         UCFitness 固有ルールの静的検出・強制
    ├── postgresql-optimization            PostgreSQL クエリ最適化・パフォーマンス分析
    └── next-intl-add-language             next-intl 翻訳キー追加ワークフロー
```

#### エージェント詳細一覧

| 名前 | ファイル | モデル | 役割 |
|---|---|---|---|
| **UCFitnessAgent** | [UCFitnessAgent.agent.md](.github/agents/UCFitnessAgent.agent.md) | - | マスターオーケストレーター。Setup/Settings/Profile/Wallet/Groups状態分離、Home Quest/Friend Pulse、Competition Mission、Challenge継続、認証App Shell、通知品質、固定ランキング、OAuth・同期・並行membershipの原子性を統括する |
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
| Hallmark、新規UI設計、デザイン監査、redesign、study、デザインDNA | 🟧 **UX Designer** + **hallmark** (`default` / `audit` / `redesign` / `study`) |
| アクセシビリティ、WCAG、a11y、スクリーンリーダー | 🟫 **Accessibility Expert** |
| E2E テスト、ブラウザテスト、Playwright、表示確認 | 🎭 **Playwright Tester** |
| ペルソナ、実ユーザー、回遊、行動パターン、ユーザージャーニー、迷い、離脱、改善点 | 🧭 **Persona Journey Review** |
| 計画、設計、アーキテクチャ、見積もり、要件整理 | 📐 **Plan Mode** |
| クリーンアップ、リファクタリング、技術負債、整理 | 🧹 **Universal Janitor** |
| 改善ループ、品質改善、全体チェック、ループ回して | 🔄 **Improvement Loop** |
| 収益化、マネタイズ、広告、アフィリエイト、Premium、課金、収益、売上 | 💰 **Monetization Consultant** |
| 批判、レビュー、見直し、統一性、見切れ、不統一 | 🔴 **Self-Critique** |

> **自動起動**: 他ロールの作業完了後・Improvement Loop 各 Cycle 完了後・PR 作成直前に Self-Critique が自動起動し、全 6 軸 PASS するまで完了報告しない。

Hallmark は UCFitness のデザイン規律を補完する。新規 UI・通常のデザイン改善は `default`、監査のみは編集しない `audit`、明示された構造再設計だけを `redesign`、URL・画像から模倣せず design DNA を抽出する場合を `study` とする。既存のテーマトークン、ja/en、モバイルファースト、44px、アクセシビリティ、セキュリティ、性能、状態網羅、Persona Journey Review、`modern-web-guidance`、`web-design-reviewer`、`self-critique-gate` が常に優先される。

### Skills

詳細はツリー図の「Skills」セクションを参照。

| スキル | 用途 |
|---|---|
| [modern-web-guidance](.agents/skills/modern-web-guidance/SKILL.md) | Chrome Modern Web Guidance。HTML / CSS / クライアントサイド JS / React UI / フォーム / Web Vitals 改善時に guide を検索・取得して適用する |
| [hallmark](.github/skills/hallmark/SKILL.md) | Hallmark 1.1.0。新規 UI の設計、読取専用デザイン監査、明示的な再設計、URL・画像からの design DNA 抽出を UCFitness 固有契約の下で実行する |
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

# 全主要画面のレスポンシブ監査
RESPONSIVE_AUDIT_STORAGE_STATE_JA=/path/to/ja-state.json RESPONSIVE_AUDIT_USERNAME_JA=ja-user RESPONSIVE_AUDIT_GROUP_ID_JA=ja-group \
RESPONSIVE_AUDIT_STORAGE_STATE_EN=/path/to/en-state.json RESPONSIVE_AUDIT_USERNAME_EN=en-user RESPONSIVE_AUDIT_GROUP_ID_EN=en-group \
npm run audit:responsive
```

- テストフレームワーク: **Vitest**
- レスポンシブ監査は `screenshots/responsive/` に全画面画像、`summary.json`、`report.json` を保存し、320/375pxの44px操作領域、横スクロール、CLS、固定要素の見切れ、言語・タイトル、重要アセット取得を検査
- 同じ監査で、操作要素のaccessible name、フォームラベル、見出し順、重複ID、`aria-hidden`内のfocusable要素、スキップリンクの可視focusとmainへの移動、固定ヘッダー下の到達性、reduced-motion設定で初期表示中に開始・継続するCSS/ウェブアニメーションも検査
- 未認証の公開LP・利用規約・プライバシーポリシーだけを確認する場合は `RESPONSIVE_AUDIT_SCOPE=public npm run audit:responsive` を使用（30ケース）。全150ケースの監査はja/en別の認証state、username、閲覧可能なgroup IDを必須とし、DB保存言語への同期、認証切れ、動的ページ省略を成功扱いにしない
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
- **Project / worktree同一性** --- 子セッション作成前に、ユーザー画面上のproject名、project ID / 内部名、main path、cwd、branchを確認する。同じrepositoryの別projectへ無断fallbackせず、目的projectを修復できない場合は現行セッションで専門agentを直接実行する。別project利用はユーザー確認後に限る

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
