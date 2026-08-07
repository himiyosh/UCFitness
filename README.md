# UCFitness

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?logo=cloudflarepages)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

**English** | [日本語](#概要)

UCFitness is a step-tracking and fitness-competition PWA. It syncs daily activity
from health-data providers and gamifies it through group rankings, time-limited
challenges, badges, reactions, and an in-app coin economy.

**Stack** — Next.js 15 (App Router) · React 18 · TypeScript 5 · Tailwind CSS v4 ·
NextAuth v5 with Fitbit OAuth 2.0 · Supabase (PostgreSQL) · Cloudflare Pages
(Edge Runtime) · next-intl (ja/en) · Vitest · PWA with Web Push.

### Engineering highlights

- **Graceful degradation by default.** The profile, wallet, group, leaderboard,
  and notification surfaces each keep rendering when a backend dependency fails,
  showing partial data with an explicit warning instead of blanking the screen.
  Recorded-zero, never-recorded, and fetch-failed step states are modelled as
  three distinct cases rather than collapsed into one empty state.
- **Staged health-provider migration.** Fitbit Web API integration with an opt-in
  path to Google Health ahead of the Fitbit API's scheduled shutdown. Existing
  tokens cannot be carried over, so the flow is built around explicit user
  re-consent, requests only the `activity_and_fitness.readonly` scope, and
  persists nothing beyond daily step totals.
- **Failure-aware onboarding.** OAuth failures surface a localized reason and a
  safe retry path instead of raw Auth.js internals, and unconfigured users are
  routed into a three-step setup that can be deferred at each stage.
- **Hardened value transfers.** Database access is server-side only under Row
  Level Security, with non-negative balance constraints, idempotency keys, and
  atomic credit/debit implemented as PostgreSQL functions.
- **Standards-based Web Push.** RFC 8291 `aes128gcm` payload encryption built on
  Edge Web Crypto, with per-device deduplication and language-aware delivery.

Further reading: [`docs/PRODUCT.md`](docs/PRODUCT.md) ·
[`docs/security-hardening-notes.md`](docs/security-hardening-notes.md) ·
[`docs/harness-engineering-design.md`](docs/harness-engineering-design.md)

Licensed under the [MIT License](LICENSE).

---

## 概要

UCFitness は **複数の健康データソースに段階対応する歩数トラッキング・フィットネス競争アプリ (PWA)**。

グループ対抗のランキング・チャレンジ・リアクション・バッジ・コイン経済を通じて、日常の歩数活動を楽しくゲーミフィケーションする。

## 主な機能

| 機能 | 説明 |
|---|---|
| **歩数トラッキング** | Fitbit API と Google Health の段階移行型自動歩数同期 |
| **ログイン・登録** | Fitbit OAuth後に未設定ユーザーを3ステップsetupへ送り、失敗時は生のAuth.js情報を露出せずja/enの理由と安全な再試行を表示 |
| **初回セットアップ** | プロフィール/歩数ソース→日次目標→グループ/チャレンジの3ステップで、各段階を後回しにでき、全状態で単一mainを維持。状態取得・session更新失敗は識別子やraw Errorを含まない固定ログだけを残し、保存後の「最初の500歩」からホームの価値ループへ接続 |
| **設定** | 歩数ソースと日次目標をプロフィール・装飾より先に配置し、500〜100,000歩の共通Client/API契約で更新 |
| **プロフィール** | 記録済み0歩・未記録・取得失敗を分離し、歩数・比較・バッジ・装備・コインを部分障害でも継続表示。所有者には参加日時の新しい100件を対象とした終了チャレンジと、獲得日時が確かなバッジの成長タイムラインを10件ずつ開示 |
| **ウォレット** | 今日の獲得・支出・純増減を分離し、次の歩数UC、取引後残高、日次純増減チャートを部分障害でも表示 |
| **ホームダッシュボード** | 今日の進捗、次ライバル差、固定5行ランキング、個別目標ベースのFriend Pulse、今週トレンド、UC残高、チャレンジ、ミッション、次の行動を意味色と動的barで可視化 |
| **グループ対抗** | 未所属からの参加導線、正歩数だけのメンバー/グループ順位、部分障害でも継続するイベント・チャット・ギア・週間レポート |
| **リーダーボード** | 個人・グループ順位に加え、参加人数・次ライバル名・必要歩数・トップ差をCompetition Missionで可視化 |
| **チャレンジ** | 参加中の残り歩数を優先し、次の最大500歩・期限・UC報酬を示す期間限定チャレンジ。終了イベントは殿堂入り・開催履歴へ残し、個人の達成記録と区別 |
| **バッジ & 称号** | 連続達成や累計歩数・順位に応じたバッジ獲得・称号付与システム |
| **コイン経済** | 歩数でコインを獲得し、7/30/100/365日のストリーク節目で一回限りの追加UCを受け取り、ショップでギアを購入 |
| **ギア & リアクション** | プロフィールギア装着、メンバーへのリアクション |
| **プッシュ通知** | 言語設定対応のWeb Push、バッジ横断集約、歩数リマインダー、ウィークリーサマリー、端末重複制御、通知嗜好が利用不能でも警告付きFeedを継続 |
| **i18n** | 日本語・英語の 2 言語対応 |
| **法務情報** | アプリ内の `/legal/terms` と `/legal/privacy` で利用条件・健康情報の注意・データ取扱いを ja/en で明示 |
| **PWA** | 安定したアプリID・スコープとfitness/health/lifestyleカテゴリを明示したマニフェスト、ホーム画面追加、オフライン対応。identity/categoryと既存display・色・iconsはVitest回帰で固定 |

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
- **Fitbit一時障害の再試行**: 冪等な歩数GETだけを429・5xx・通信障害で1秒、2秒、4秒後に再試行する。401は既存の再認証経路へ即時返し、回転するrefresh tokenのPOSTは二重実行しない
- **通知品質契約**: `users.language`から生成したja/en文言をRFC 8291暗号化payloadで端末へ届ける。バッジは個人・全体・グループをユーザー単位1通へ統合し、同一UA/legacy購読は最新1件、404/410 endpointは削除する。Push `Topic`とNotification `tag`で同種通知を置換し、通知ベルの集約単位と未読数も一致させる
- **ストリーク節目報酬契約**: 完了済みJST日と全シールド利用履歴をDBで再検証し、7/30/100/365日の限定バッジと固定UCを一回だけ付与する。歩数同期・ミッション入金・節目加算は同じユーザー行ロックへ直列化する
- **ミッション全達成ボーナス再試行契約**: `GET /api/user/missions` は全ミッション完了時に`coin_transactions`の`mission-bonus:{userId}:{date}`を正本として`bonusStatus`と`bonusPending`を返す。未付与だけを再試行可能にし、付与済み・DB障害・不正応答をpendingへ偽装しない。照会障害は生DB情報を捨てた固定`AppError`と503へ変換し、POSTは既存`credit_balance`のユーザー行ロックと一意な冪等キーを再利用する
- **ソーシャルデータの状態分離**: `/api/user/following`、`/api/user/followers`、`/api/user/follow`、`/api/user/follow/status` はDB障害をoperation・stage・codeだけの固定`AppError`へ変換し、生エラーとユーザーIDをログへ渡さない。一覧はexact count、行形状、一意性、必須プロフィールを検証し、欠落・重複・切り捨てを成功形へ変換しない。実`reportError`から`console.error`へ出る構造化JSONを解析する回帰で、raw message/code/cause/context/nested fieldとUUIDの非露出を固定する。歩数未記録は `hasTodaySteps: false`、記録済み0歩は `hasTodaySteps: true` として区別し、ホームは `limit=5&sort=recent` で必要な5件だけを取得する
- **グループ比較データの完全性契約**: `group_members`、必須プロフィール、`daily_steps`を`unknown`から検証し、欠落・外部参照・重複・不正日付・負数/unsafe歩数・exact count不一致を空/Unknown/0へ変換しない。比較サービスは固定`AppError`だけを投げ、グループ詳細の専用境界がoperation・stage・codeだけを1回記録する。チャート値はUUID由来の安定した`seriesKey`で`dataPoint.values`へ格納する。username/nameはNFC正規化・trimし、空候補をfallback対象から除外して両方空の場合だけ拒否し、衝突しない`displayLabel`としてのみ使用するため、`date`/`label`、同名利用者、Unicode正規化同値、生成suffixと同じ実名でも系列値を上書きしない。歩数は複数OFFSETを使わず、単一要求でexact countと1,000行上限を照合して切り捨てを拒否する。メンバー集合を跨ぐ複数照会はMVCC snapshotではないため、1,000行超と厳密な同時点比較には将来のtransactional DB集約RPCが必要
- **フォロー歩数比較の表示契約**: 日別チャートは記録済み0歩を基準線上の点、未記録を線の切れ目として表示し、tooltipと読み上げ用数値表でも両者を区別する
- **公開プロフィールAPIの入力契約**: Achievement進捗と年間歩数カレンダーは認証を要求しつつ、UUID検証済みの公開target `userId`をそのまま照会する。フォロー状態と公開リアクションもtarget UUID・emoji・periodをDB操作前に検証する。プロフィール/バナー画像の保存拡張子は元ファイル名ではなく検証済みMIMEから決定し、`contentType`と一致させる
- **バナー画像編集のgeometry契約**: 2.5:1のcrop高さ・bleed・offset clamp・ズーム中心は、DPR精度へ正規化した現在のrendered preview幅と画像のnatural sizeから同じpure helperで算出する。初期幅0はCSS `aspect-ratio`で領域を予約し、ResizeObserverでは幅比で元画像上の選択中心を保持する。画像比率由来のdynamic minimum scale、画像load世代、局所`touch-action: none`と`passive: false`のwheel listenerにより、resize・zoom・orientation・連続選択でも空白・stale state・横overflowを防ぐ。保存画像はDPRとnatural crop上限から最大1200pxで生成し、upload先、MIME、5 MB上限、JPEG圧縮契約は変更しない
- **整数・距離入力の検証契約**: `/api/user/analytics`の`months`は省略時3、指定時1〜12、`/api/user/step-calendar`の`year`は省略時JST現在年、指定時2000〜2100だけを受理する。入力は空白なしの10進整数全文（先頭の`+`/`-`は構文上許可）かつsafe integerに限定し、小数・指数・16進・部分一致・空文字・範囲外をclampや既定化せず400で拒否する。Walking Routes POSTの`duration_minutes`は省略/`null`または非負safe integer、`distance_km`は省略/`null`または非負finite numberだけを受理し、型・小数（時間）・非finite値を`null`へ偽装せずDB照会前に400とする。Clientの時間は同じ整数正本とnative `badInput`を検証する。距離はブラウザが字句を正規化する`type="number"`を使わず、`type="text"` + `inputMode="decimal"`で生文字列を保持し、空文字だけを省略値、存在時は符号・空白・指数・部分一致・locale依存のカンマ表記を含まない非負10進数全文かつfinite値として送信前に検証する。不正値はPOSTせず、16pxの可視ラベル付き入力へfield固有alertと`aria-invalid` / `aria-describedby`を関連付け、error DOM反映後に対象fieldへfocusする。native入力回帰はrunner既設Google Chromeをskip/fallbackなしで使い、320/375/1280px、keyboard、console、cold startupを含む対象test 30秒と各操作5秒を分離する。非同期の作成・更新・削除失敗はfield errorと独立した単一の`role="alert"`で通知し、画面外なら最小距離で可視化する。pointer起動時はfocusを奪わず、keyboard起動時はTab停止を増やさずエラー本文へfocusし、次のTabで翻訳済み44px dismiss buttonを操作できるようにする。create/favorite/log/deleteはUI disabledに加えて同期lockで1件へ直列化し、pending中は全route controls・追加・キャンセルをdisabled、対象routeだけspinner表示、delete dialogのopen/confirmとは相互排他にする。`finally`はloading終了とrelease tokenだけをscheduleし、error DOM・keyboard focusまたはsuccess/loading stateがcommitした同一effectでtokenを消費してlockを解放する。alert解除は接続中の起動button、favorite/logのキーボード成功は起動button、作成・削除成功は安定した追加buttonへcommit後focusを戻す。dialog openだけではトリガーbuttonをdisabledにせず、背景`inert`とhandler guardで操作を拒否してCancel/Escape後のfocusをトリガーへ戻す。delete dialogは説明を`aria-describedby`で関連付け、route ID + 単調generation tokenを全close経路で同期invalidateする。confirm closureはactive route/token完全一致時だけDELETEを許可し、各action開始で既存alertをunmountして同一文言の逐次失敗も新しいalertとして通知する
- **全ページ品質契約**: 17ユーザールートを共通Shell・競争・アカウント・商取引へ分け、正常/空/障害/権限/320px/キーボード状態を監査する。Portal Dialogは共通focus stackでEscape、Tab循環、背景`inert`、body scroll lockを統一する。close時は接続・表示・操作可能なprevious active element、effect開始時fallback、cleanup時current fallback、cleanup時`#main-page-content`の順にfocusを戻し、disabled・hidden・unmount済み要素を飛ばす。視覚チャートは数値表、GROUPランキングはmembership認可を必須とする
- **認証ページUI契約**: 標準ページは`AuthenticatedPageHeader` + `PageIntro`で多色ブランド、context label、操作群、パンくず、唯一の`h1`、意味色アクセントを統一する。プロフィール導線はcanonical `/user/{username}`へ直接つなぎ、route固有スケルトンとServer確定日付で白画面・水和差を防ぐ
- **狭幅レスポンシブ契約**: 320pxから法務Footerと44px操作領域を維持し、1024pxはSidebar差引後の本文幅で設計する。複雑な多列化・詳細展開は1280pxへ送り、Shop/Settingsを含む通常ページは自然スクロールへ統一する
- **Home Quest契約**: 認証ホームは進捗・競争・歩いた価値・次の一歩を1つのQuest面で連結する。Mission→Weekly→Reward→Challengeの後はQuickActionsを独立補助Dockとし、Friend Pulseと週間Rankingをxlで直接同一行にする。Friend Pulseは個別目標と正歩数の活動人数/合計/達成人数、Rankingは次ライバル名/必要歩数を表示する。詳細Rankingは固定5行を維持し、Competition Missionへ現在順位・参加者数・次ライバル・トップ差を集約、外側多列化は2xlへ遅らせる
- **Challenge継続契約**: Challengesは参加中・active・開始済み・未終了・未達成・進捗取得済みを優先し、残り歩数→期限→報酬で並べる。主表示は最大500歩、期限/報酬は補足、作成は一覧後へ置く。開始前イベントはactive一覧で予告表示を維持し、開始日を明記して参加ボタンを出さない。参加APIもGROUP認可後・participant照会前に同じJST開始日境界を強制する。期限のUI解釈は一覧・カード・詳細Dialog・Home widgetとGroup Eventのactive/past分類・カードの日付/状態表示でschedule-onlyの共有JST正本へ統一し、進捗不明を0へ変換しない。ChallengeListは表示中の参加済みIDだけを`POST /api/challenge/progress`へ送り、bodyを`{ challengeIds: string[] }`の1〜50件・重複なしUUIDに限定する。APIは認証を1回だけ共有し、server-only単件serviceを固定4 workerで実行して各challengeの現GROUP認可、fresh再計算、`challenge_participants`永続化を維持する。応答は入力順の`{ results }`で、各項目を`ok` / `not_found` / `forbidden` / `not_participating` / `unavailable`、成功時を`record_status`と`schedule_status`で分離し、未記録・記録済み0・開始前・終了・障害を0へ偽装しない。既存`GET /api/challenge/{challengeId}/progress`は同じserviceを再利用して互換維持する。Clientは一覧世代ごとに単一batchだけを発行し、AbortController、request ID、最新tab refを参加・離脱・tab変更後も維持する。開いたChallengeカードと詳細Dialogは各1件、Home widgetとGroup Event一覧は表示中項目全体の最早開始/終了境界だけを上限付きtimerで再計算し、hidden中に境界を跨いだ場合はvisible復帰時に同期する。終了後は参加・離脱・編集操作を表示せず、未送信の編集Dialogも閉じる。境界と競合した未送信submitは同じ純粋時間契約で可視エラーを表示し、保存と全入力を無効化する。開始済みPUTが境界を跨いだ場合はDialogを保持して追加送信を遮断し、successだけ既存更新・close、failureはdraftとalertを残して安全に退出可能にする。更新APIはGROUP認可とcreator確認後にJST当日より前の保存済み`end_date`を拒否し、更新文自体にも`end_date >= today`を含める。要求された`end_date`も同じ認可完了後にJST当日と比較し、前日以前は400 `CHALLENGE_END_DATE_IN_PAST`、当日は許可する。Edit Dialogはこのcodeだけをja/enの修正案付きfield alertへ写像し、draftを保持して再送信可能にする。0件更新は409 `CHALLENGE_NOT_EDITABLE`として、Edit Dialogはraw server文を表示せずja/enの単一alert、draft保持、追加送信遮断、閉じて一覧へ戻るCTA/Escapeのfocus復帰へ写像する。殿堂入り・開催履歴は閲覧可能な終了イベント全体をAPI順で表示し、参加済みカードで記録歩数が目標へ達した場合だけ個人達成として示す。`GET/POST /api/challenge`の依存障害と予期しない例外は、raw Error・DB詳細・user/group/challenge UUIDを渡さず、固定operation・stage・codeだけを最終構造化ログへ記録する
- **Timezone-safe date/timestamp parseガード**: `app` / `components` / `contexts` / `hooks` / `lib` / `types`のproduction TS/TSXをTypeScript ASTで走査し、`new Date`と`Date.parse`へ渡すISO date-only literal、`start_date` / `end_date`、offsetなしのstatic full timestampとtemplate/binary連結、date-only安全性を証明できない動的文字列を拒否する。既存`Date`、epoch number、timestamp field、`Z` / `+09:00` / `+0900`を持つfull timestamp、共有JST helperは許可し、コメント、docs、test/spec、fixtureは対象外とする。共有`parseTimestampMillis`もcalendar validityと明示offsetを必須にし、offsetなし日時をruntime local timezoneへ補完しない。notification feedのcursor・並び順・未読境界、group message cursor、GroupChat相対時刻、招待期限は不正値を0・先頭ページ・相対時刻・成功応答へ偽装せず明示失敗へ分離する。date-onlyの順序比較は検証済み`YYYY-MM-DD`文字列、日付演算・表示は明示UTC/JST、Challenge/Group Eventの操作可否は`getChallengeScheduleMetrics`を正本にする
- **Dynamic timestamp source契約**: 明示offsetのsuffixだけで動的式を許可しない。productionで認めるdate-only構築元は既存の検証済みcalendar名とdate validation helperへ限定し、`unvalidatedDate`のようなDate風の名前や、`updateDateProfile(value)`のように関数名へDateを含むだけの値は拒否する
- **Challenge進捗UUID・0歩契約**: UUIDはcase-insensitive検証の直後にlowercaseへcanonicalizeし、case-only重複、DB query、DB返却ID、batch response照合へ同じ値を使う。GROUP RPCの合計0は記録済みと推測せず、0歩GROUP全件を1回の`daily_steps` relation queryで取得し、exact count・最大1,000行・challenge参加・現group membership・各期間を照合して`not_recorded` / 記録済み0へ分ける。不完全shape、DB障害、1,000行超は0へ偽装せず対象項目を`unavailable`にし、複数OFFSETやGROUP件数分の追加queryを使わない
- **Challenge進捗認証ログ契約**: 単件GETと一括POSTは`auth()`を既存の固定`AppError` / `reportError`境界内で実行する。セッション不在は従来どおりログなし401、認証基盤の例外は同一codeの`AppError`を含めてraw Error・message・cause・context・user/group/challenge UUIDを再利用せず、固定operation・`unexpected` stage・codeだけを最終構造化ログへ記録し、進捗・0歩・未記録の応答契約を変更しない
- **GROUP Challenge認可契約**: public閲覧と参加を分離し、join/progress/leaveは現group member、PUTはcreatorかつ現OWNER/ADMINだけを許可する。GROUP作成はservice-role専用`create_group_challenge`、進捗は同専用`get_group_challenge_progress` RPCでDB再認可する。進捗RPCは参加者と現memberをDB内でintersectionし、inclusive期間の正歩数を`bigint`集計するためPostgRESTの1000行上限へ依存しない。両migrationは本番未適用で、未適用時は明示的な5xxとする
- **F006 migration運用**: productionはPhase 2A→3A→3B1→3C Outbox (`20260722`)→3C claim lease (`20260723`)→精算Cron/報酬Push Cron scheduleの順に適用する。途中の歩数減少・欠測による先払いを避けるため終了翌日以降に精算し、settlement transaction→durable outbox→最大20ユーザーのclaim lease→`users.language`によるja/en集約Push（同一ユーザー1通、Topic/tag=`group-challenge-reward`）→成功時complete/失敗時releaseで配信を再試行可能にする。rollbackは両scheduleを停止してから報酬Push→claim→outbox→3B1→3A→2Aの逆順（各RPCのREVOKE/DROP、`credit_balance`・取引type・settlement列/constraintの復元を含む）で行う。Phase 2A/3A/3B1/3C migrationsと両Cron scheduleはproduction未適用で、適用・schedule設定がF006完了blocker
- **競争差の導線継続**: Homeで示す「あと何歩」を、歩数が記録されたユーザーのグローバルランキング・選択グループ・グループ詳細の自分順位サマリーでも表示する。0歩・不在時は順位・メダル・成功形の対象にせず、空行でランキング5行・72px固定仕様を維持する。取得失敗は未所属表示へ変換せず、Global/Group双方でエラーと再試行を明示する。計算は`getRankGapInsight()`へ集約する
- **Amazon CTA実験契約**: プロフィール・ホーム・ShopのAmazon導線はセッション内で安定した配置/文言2×2実験を行い、50%以上を1秒表示したimpressionとclickだけをPIIなしの構造化platform logへ送る。価格・配送はAPI値を推測せずAmazon.co.jp確認と明記し、PR開示と`sponsored` linkを必須にする
- **Groups状態分離契約**: グループ内ユーザー順位とグループ対抗順位は正歩数だけを対象にし、ランキング配列長は「ランキング参加人数」と表示する。group/user/membership認可だけを詳細ページの必須境界とし、private group非メンバー404を維持する。メンバー一覧/件数、順位、比較、期間別競争の失敗は個別警告として、取得不能を0人・空順位・未所属へ変換せず、利用可能なイベント・チャット・ギア・週間レポートを継続する
- **F030招待リンク**: `POST /api/group/invite`の`create`/`join`はEdge Runtimeで動作し、発行はOWNER/ADMINだけをDB RPC内で認可する。256-bit生tokenは成功時に一度だけ返し、DBにはSHA-256 hashと7日後の失効時刻だけを保存する。UIは生tokenを`/groups/invite#token=...`のfragmentだけに置き、読取後すぐURLから除去してメモリ内retryに限定する。Clipboard失敗時は選択可能なread-only linkを維持し、参加画面は404/410/既参加/成功/通信・基盤障害を分離する。参加は単一RPCでmembershipと`group_keyword`を原子的に同期する。migrationは未適用のため、`migrations/20260719_add_group_invite_links.sql`適用前はUIが明示的な利用不能状態を表示する
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
|   |   +-- analytics/       # 識別子を持たない集約分析API
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
|   +-- landing/             # 公開LPの小さなClient island
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
|   +-- public-landing-vitals.ts        # 公開LP計測の厳格schema・量子化
|   +-- public-landing-vitals-client.ts # 最新値batchのprivacy-safe配送
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
|   +-- check-ucfitness-rules.sh    # 全rule-checkのBash CLI・集約
|   +-- ucfitness-rule-targets.mjs  # Challenge/date-only共有semantic engine
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

Push購読CASのclean 3-layerは、Layer 1を`migrations/20260725_delete_push_subscription_if_unchanged.sql`、Layer 2をruntime PostgreSQL検証、Layer 3をアプリ配線とする。PR #302は3層を混在させた994行差分のためsupersedeし、本migrationだけをLayer 1の正本とする。適用順は`20260720_harden_push_subscriptions_rls.sql`、Layer 1、Layer 2のruntime検証、Layer 3の順である。Layer 2がmainへ入りnegative catalog fixture・exact/stale結果・二接続競合を実PostgreSQLで検証する前のproduction適用は禁止し、production適用には明示承認が必要である。

Layer 1は既知schema/default、`public.users(id)` cascade FK、ordered non-deferrable `(user_id, endpoint)` uniqueとvalid/ready/immediate backing index、owner/RLS/policy、table/column ACLをfail closedで検証する。`service_role`だけが実行できる`SECURITY DEFINER` RPCは`id`で特定した主キー行を`FOR UPDATE`し、ロック後に`user_id`、`endpoint`、`p256dh`、`auth`、`user_agent`、`created_at`を`IS NOT DISTINCT FROM`で比較して同じ`id`だけを削除する。missing/staleは`false`、完全一致だけを削除して`true`を返す。static testはmigration SHA-256とcritical clauseを固定するが、runtime PASSはLayer 2でのみ判定する。

ロールバックは依存するLayer 3を先に停止・撤去し、`BEGIN; REVOKE ALL ON FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role; DROP FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz); COMMIT;`を実行する。`push_subscriptions`本体と既存hardening migrationは保持する。

Personalized Push delayed-delivery privacyのclean 3-layerは、Layer 1を`migrations/20260726_create_push_subscription_ownership.sql`、Layer 2を`npm run test:postgres:push-generation`のruntime PostgreSQL検証、Layer 3をsubscribe/payload/Service Worker配線とする。PR #300 / #301のblockerは、HTTP送信後に同一endpointの所有者が変わり、TTL 300の旧ユーザー向け健康payloadが遅延到着し得る点である。Layer 2は実DB契約だけを証明し、Layer 3が揃うまでアプリ配線はMERGE BLOCKED、migrationのproduction適用も禁止とし、適用には明示承認を必須とする。

Layer 1はendpoint本文を保持しないSHA-256 digest主キーの`push_subscription_ownership`を作り、owner、`UNIQUE current subscription_id`、ランダム`recipient_generation`、version、時刻をDB正本にする。digestとadvisory lockにはraw endpointでなく、Layer 3共有`getPushEndpointOwnershipKey`がhost case、default port、unreserved percent encoding、fragmentを正規化したcanonical ownership keyを使う。SQLへRFC 3986正規化を再実装せず、legacy raw rowからownerを推測するbackfillは行わない。既存購読はauthority/generationなしで全件隔離して件数だけを報告し、認証済みrefresh/saveで初めてauthorityを作る。

save/transferはraw endpointを`push_subscriptions`保存だけに使い、canonical key単位でownerを移転する。raw 20件上限をuser lock下で守り、same-ownerはgeneration維持＋version進行、transfer/releaseはgeneration回転、releaseはgeneration＋versionでfenceする。非更新read RPCは最大20組のobserved subscription ID＋canonical keyを受け、authority owner・digest・current subscription IDと保存行userがexact一致する行だけ`subscription_id, recipient_generation, version`をUUID順で返す。foreign/missing/staleはskipし、重複入力は1行へ集約する。authority tableのdirect SELECTは許可せず、saveをread代用しない。既存CASはsubscription exact rowだけを削除しauthorityへ触れず、Push network待機中にSQL transactionを保持しない。

Layer 3はraw→canonical key consistencyをshared helperのalias vectorで検証し、personalized send前にread RPCを通してgeneration authorityがないlegacy rowを送らない。payloadへgenerationを含め、Service Workerは端末保存generationとの一致時だけ表示し、logoutでclear、account switch/refreshでupdate、旧generationとgenerationなしをdropする。適用順は既存CAS→Layer 1→Layer 2 runtime→Layer 3 deploy→送信停止中の旧worker排出・新SW確認→`ACCESS EXCLUSIVE` cutoverでdirect write revoke→送信再開とし、raw rowからauthorityを再同期しない。Layer 2はmigration SHA、exact catalog/ACL、canonical alias/material差、同時claim、19→20/20→reject、逆順transfer、user削除、generation/stale release、legacy隔離、exact read、CAS-first/save-first、rollbackをfresh PostgreSQL 16で証明する。rollbackは送信停止後にread→release→save RPC、owner index、authority tableの順にREVOKE/DROPし、generation付きqueueが残る間はSW比較を先に撤去しない。

受信者protocol readiness Layer 1は`migrations/20260727_add_push_recipient_protocol_readiness.sql`でauthorityへ`recipient_protocol_version smallint NOT NULL DEFAULT 0`を追加する。既存authorityはdefault 0の未準備状態になり、旧6引数saveとreleaseがowner/generation/versionを更新するとtriggerで0へ戻る。新7引数saveだけがallowlist済みversion 1を同じtransactionのexact current authorityへ保存し、read RPCはexact owner/key/subscription一致へprotocol versionを追加して返す。Layer 3 senderはpersonalized健康payloadに必要なversion以上を要求し、generic通知はsender Layerでこの制約から分離する。

本Layerのruntime PostgreSQL検証は`npm run test:postgres:push-protocol`を正本とし、digest固定の20260726 ownership migrationと20260727 protocol migrationをfresh PostgreSQLへ未変更のまま適用する。exact catalog/default/check/index/FK/owner/RLS/ACL/function contract、既存protocol 0、version 1 save/read/release、旧saveのreadiness reset、逆順競合、rollback、失敗cleanupを実行検証する。PR #314のserver sender、PR #315のclient/SW protocol、旧worker排出を含むrollout planが揃うまでPR #300とPR #301を含むpersonalized送信はMERGE BLOCKEDで、migrationのproduction適用は禁止する。適用順は20260726 ownership Layer 2→本migration→本runtime Layer→server→client/SW→rolloutである。rollbackは新callerを先に停止し、read RPCを20260726の定義へ戻す→7引数save→reset trigger/function→protocol check→columnの順に撤去し、既存authorityと購読行を保持する。main mergeとproduction applyには別途明示承認が必要である。

Layer 3A1は`lib/services/push-subscription-ownership.ts`のserver-only typed wrapperだけを提供する。将来の共有helperが生成するcanonical ownership keyを入力として受け、wrapperではDB契約と同じ長さ・HTTPS・fragmentなしのshapeだけを検証し、URL正規化を重複実装しない。protocol 1の7引数save、最大20件をUUID順でexact dedupするread、generation/version fence付きreleaseを各1回だけ呼び、unknown結果を厳格parseして`subscriptionId`・generation・version・protocolまたはstrict booleanだけを返す。生DB error・UUID・ownership keyを`cause`/`context`/内部ログへ渡さず、現時点のproduction importは0件でPR #314のcallsite配線までinertとする。ownership/protocol migrationはproduction未適用であり、本wrapperだけをDB可用性や安全なpersonalized配信の根拠にしない。

通知配信outboxのclean 3-layerは、Layer 1を`migrations/20260725_create_notification_delivery_outbox.sql`、Layer 2をruntime PostgreSQL検証、Layer 3を3Aのtyped wrapperと3B/CのCron配線に分ける。Layer 1は`(notification_type, occurrence_key, user_id)`を一意にし、`step-reminder`のJST日`YYYY-MM-DD`と`weekly-summary`のJST週`YYYY-Www`だけを受理する。payload・endpoint等は保存せず、pending/claimed/completed/failed、owner/token、5分lease、5 attempt、90日保持だけをDB正本にする。

claimは1〜20件の入力userをUUID安定順で`FOR UPDATE`し、台帳を同一transactionで作成・lockして、pendingまたは期限切れclaimedだけへ新tokenを発行する。active claim・completed・failedはskipし、返却はuser IDとclaim tokenだけとする。Layer 3はpersonalized data取得・Push送信より前にclaimし、completeは通知結果が契約を満たした場合だけ呼ぶ。端末部分失敗の契約はLayer 3で決定し、releaseは所有中の未期限切れtokenだけを失敗記録して再試行可能にする。HTTP 503の通常retryは非completed行だけを再claimし、completedを再送しない。

static testはmigration SHA-256、catalog/default/FK/index/owner/RLS/ACL、lock順、stale token、未配線を固定する。Layer 2のruntime PostgreSQL検証はfresh DBで実catalog、条件を弱体化したmigration fixture、claim・owner/token fencing・5 attempt、JST日/ISO週境界、90日保持、逆順入力の二接続競合、rollback、失敗時cleanupを実行する。Layer 3のCron配線は次段とし、Layer 2がmainへ入った後もproduction適用には明示承認が必要である。rollbackはLayer 3を停止してactive leaseを待ってから`release→complete→claim→index→table`の順にREVOKE/DROPし、過去migrationは編集しない。

Layer 3Aは`lib/services/notification-delivery-outbox.ts`のserver-only typed wrapperだけを提供する。先頭の`import 'server-only'`をNext compiler境界とし、exact RPC引数・1回呼出、最大20 UUIDの安定dedup、4桁年をUTC parse/roundtripするJST日/ISO週key、unknown返却shape、owner/token fencing、固定release failure code、内部`reportError`なし、raw Error object graphとUUIDを含まない固定`AppError`を検証する。全tracked TS/TSXのproduction importは0件でCron callsiteはまだinert、route配線はLayers 3B/Cで別途行う。Layer 1 migrationはproduction未適用のため、このwrapper追加をDB利用可能性や実配信の根拠にしない。

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

コメントを除外した実行可能コードには32 ファイル、40 件のdirect PostgREST
経路があり、すべてservice-roleの`SELECT`だった。direct `INSERT` / `UPDATE` /
`DELETE` / upsertとbrowser clientからの直接接続はない。

| 分類 | direct経路（件数） | 認可・エラー境界 |
|---|---|---|
| Home / profile / analytics | `app/[locale]/page.tsx` (1), `app/[locale]/user/[username]/page.tsx` (2), `app/[locale]/wallet/page.tsx` (1), `app/[locale]/debug/session/page.tsx` (1), `lib/services/analytics-service.ts` (1) | Server Component / service。profileとanalyticsは取得失敗をunavailable / throwへ分離 |
| Group / challenge | `app/[locale]/groups/[groupId]/page.tsx` (1), `lib/services/challenge-progress-service.ts` (2), `app/api/challenge/[challengeId]/route.ts` (1), `app/api/group/[groupId]/events/[eventId]/route.ts` (1), `app/api/group/[groupId]/ranking/route.ts` (1), `app/api/group/[groupId]/weekly-report/route.ts` (1), `lib/services/group-comparison-service.ts` (1) | session / membership認可後の期間集計。Challenge進捗は単件・50件上限batchの両routeが同じserver-only serviceを再利用し、未記録・0・障害を分離する。一部の参加者・歩数結果は別Fix候補 |
| Reward / achievement | `app/api/amazon/personalized/route.ts` (1), `app/api/user/achievement-progress/route.ts` (1), `app/api/user/achievements/route.ts` (2), `app/api/user/missions/route.ts` (2), `app/api/user/step-calendar/route.ts` (1), `app/api/user/weekly-goal/route.ts` (1), `lib/services/badge-allocator.ts` (1), `lib/services/badge-awards.ts` (3), `lib/services/coin-service.ts` (2), `lib/services/title-achievement-service.ts` (2) | session / service / cron境界。achievement-progressは7依存のDB errorを503、不正形状を500へ分離し、正当な0・空・残高行なしだけを成功形として維持。他経路の偽装は別Fix候補 |
| Social / export | `app/api/user/following/route.ts` (1), `app/api/user/following-comparison/route.ts` (1), `app/api/user/export/route.ts` (1) | session userを固定。following-comparisonの部分障害境界は別Fix候補 |
| Cron / integration / debug | `app/api/cron/step-reminder/route.ts` (1), `app/api/cron/weekly-summary/route.ts` (1), `app/api/external/ranking/route.ts` (1), `app/api/notify-teams/route.ts` (1), `app/api/debug/db-check/route.ts` (1) | cron secret / API key / sessionを各routeで検証。外部ランキングはoptional `groupId`をUUID全文検証し、不正400・不存在404・DB/shape障害500を固定`AppError`へ分離する。4 list queryは`count: exact`と返却長を照合し、PostgREST上限による部分配列を500で拒否する。成功形`{ date, groups }`は維持し、記録済み正歩数だけを安定順で連続rank化する。設定上限を超える完全取得と一貫したsnapshotは将来のtransactional RPC対象 |
| Utility / script | `lib/supabase-utils.ts` (1), `scripts/check_group_info.ts` (1) | server helper / service-role運用script。JSDoc例は件数から除外 |

Challenge進捗の認証ログ境界は、serviceの生情報除去とrouteのfailure stage帰属を2層で維持する。`check:rules`はsingle/double quoteのどちらでも単件・batchの固定operation/message/codeを検出し、Vitestの一時fixtureで同値な引用符変更の受理と境界欠落・値違いの拒否を固定する。

内部ランキング取得のDB障害は`ranking-service`で固定`AppError`へ変換し、Ranking API・Home・Groups・Group detail・Profileのcallerでは`reportRankingServiceFailure`が元例外を再利用せず、許可済みのservice operation・stage・codeだけを新しい例外へ写して記録する。user ID、group ID、username、group keyword、生DB message/code/causeはcallerの構造化ログへ渡さず、`check:rules`が6つのcaller operationと専用capture境界を固定する。

`GET /api/user/achievement-progress`の累計歩数は`get_user_step_stats`で全期間集計し、PostgRESTの1000行上限を回避する。RPCのarray/object両形状、公開target user ID、購入・グループ件数0、streak・owned items空を受理し、errorless null・unsafe integer・重複日付・壊れたrelation rowはskipせず固定エラーにする。

関連RPC呼び出しは合計11件である。4 writerは
`migrations/20260617_add_multi_provider_connections.sql`に追跡され、
`search_path = ''`、lease/source conflict guard、service-role限定`EXECUTE`を持つ。
追跡DDL上は`SECURITY DEFINER`指定がなく、既定invoker権限で`daily_steps`を更新する。

| RPC | 呼び出し | read / write契約 |
|---|---:|---|
| `replace_daily_steps_range` | 1 | Google Health lease所有権を`FOR UPDATE`で検証し、期間`DELETE`後に取得済み行を`INSERT ... ON CONFLICT DO UPDATE`で置換 |
| `upsert_daily_steps_max` | 1 | Google Health lease必須。当日値を`GREATEST`で単調upsertし、確定`steps`を返す |
| `upsert_fitbit_daily_steps_max` | 1 | Fitbit userとGoogle Health状態をlockし、source conflict時は拒否。単調upsertして確定`steps`を返す |
| `upsert_fitbit_daily_steps_batch` | 1 | 最大1000入力、履歴権威とsource conflictをlock下で検証し、単調batch upsert |
| `get_user_step_stats` | 5 | 全期間集計read。型と呼び出しだけがあり、SQL定義、owner、security mode、`search_path`、`EXECUTE` ACLは未追跡 |
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
| `app/api/amazon/personalized/route.ts` | 修正前は残高・歩数のerror / null / 不正値をBEGINNER・0歩へ変換 | 残高行なしだけを新規ユーザー0として許可し、DB障害・不正shape・unsafe数値・予期しないrejectはPIIを含まない固定AppErrorと503で判定停止。空歩数・記録済み0歩は平均0、UIは片側障害を警告しつつ取得済みおすすめを維持 |
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
| `POST /api/user/follow`の対象ユーザー確認 | `.maybeSingle()`の`null/errorなし`だけを404とし、DB障害・複数行・不正形状は識別子を含まない固定500として登録前に停止 | 修正済み |
| `GET /api/user/followers`の関係・プロフィール取得 | 各照会error・不正null・重複・exact count不一致・プロフィール欠落を固定500とし、空状態へ変換しない | 修正済み |
| `GET /api/user/following`の関係・プロフィール・当日歩数取得 | 各照会error・不正行・重複・切り捨て・必須プロフィール欠落を固定500とし、合法的な歩数未記録と記録済み0歩だけを200で区別 | 修正済み |
| `GET /api/user/follow/status`の関係取得 | 照会error・不正行を固定500とし、`null/errorなし`だけを未フォローの200として扱う | 修正済み |
| `GET /api/user/following-comparison` | follows/users/steps照会error・不正null・プロフィール欠落を報告し、空比較・`Unknown`・0歩へ変換せず500 | 修正済み |
| group invite anti-abuse | `PGRST116`だけを403とし、その他のDB障害と`null/null`は招待・legacy同期前に報告して500 | 修正済み |

社会データのDB障害は空配列・`Unknown`・0歩へ偽装しない。歩数照会が成功した場合に限り、日付ごとの合法的な未記録は既存API互換として0歩で返し、`dailySteps.hasRecord`で記録済み0歩と区別する。

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
| `npm run pages:build` | Cloudflare Pages ビルド + Worker 2.8 MiB budget検証 |
| `npm run lint` | ESLint 実行 |
| `npm run audit:responsive` | Playwright レスポンシブ/a11y監査 (320 / 375 / 768 / 1024 / 1920px、ja/en) |
| `npm run test:e2e` | Playwright 公開主要導線 + Setup復旧E2E (localhost:3000、320 / 375 / 1280px) |
| `npm run test:e2e:dashboard` | 認証fixtureを使うDashboard主要操作のPlaywright回帰テスト |
| `npm run test:postgres:notification-outbox` | loopback PostgreSQLで通知outbox migration・lease・競合・rollbackを実行検証 |
| `npm run test:postgres:push-cas` | loopback PostgreSQLでPush購読CAS migration・ACL・競合・rollbackを実行検証 |
| `npm run test:postgres:push-generation` | loopback PostgreSQLでPush受信者世代の所有権・競合・CAS相互作用を実行検証 |
| `npm run test:postgres:push-protocol` | loopback PostgreSQLでPush受信者protocol readiness・競合・rollbackを実行検証 |
| `npm test` | Vitest テスト実行 |
| `npm run test:watch` | Vitest ウォッチモード |
| `npm run test:coverage` | `lib/` の全本番モジュールを対象にした V8 カバレッジレポートと global 60% 回帰ゲート |

### 公開LPのCore Web Vitals基準

- 公開LPはServer Componentを正本とし、言語切替・横スクロール案内・認証callback復元など、ブラウザ状態が必要な部分だけをClient islandにする
- モバイルのファーストビューでは、歩数カードに「次は300歩」の再開行動を表示し、ログインCTAの連携説明と44pxのプライバシーポリシー導線を連携判断の位置に常時表示する
- 日本語本文はHiragino Sans / Yu Gothic / Meiryoのシステムフォントを使用する。複数weightの日本語Webフォントをグローバル配信する場合は、生成CSS・転送量とLCPを実測してから採用する
- Lighthouse Mobile（Fast 3G相当・CPU 4倍）でLCP 2.5秒未満、CLS 0.1未満を出荷基準とする
- 2026-07-16のF019基準値: LCP 2,349ms、CLS 0、操作Event Timing最大48ms。LCP要素はヒーロー説明文
- 2026-07-28のproduction lab再計測はLCP 3,555ms、TTFB 2,111ms、render delay 1,444ms、CLS 0.00。サーバー待ちとrender pathのどちらを次に改善すべきか判断するため、未認証LPだけで識別子なしのfield evidenceを収集する

#### 公開LPパフォーマンス計測API

`POST /api/analytics/public-landing`は未認証LandingPage専用のEdge endpoint。Client islandはNext.js 15の`useReportWebVitals`でLCP / INP / CLS / TTFBの最新値だけを保持し、対応ブラウザでは`fetchLater`、非対応ブラウザではpage非表示またはisland終了時のsame-origin `fetch(..., { keepalive: true })`へ1つのsnapshotとしてまとめる。Cookie・credential・referrer・storage・第三者scriptは使用しない。

| 項目 | 契約 |
|---|---|
| Request | `Content-Type: application/json`、same-origin、Cookieなし、最大768 bytes、1〜4件 |
| Body | `surface: "public-landing"`、`viewport: "mobile" \| "desktop"`、`metrics[]` |
| Metric | `name: "LCP" \| "INP" \| "CLS" \| "TTFB"`、指標別に量子化済みの有限値、`rating` |
| Rejected | 余分なkey、metric/session/account/user/device ID、URL/path/query/referrer、UA/IP/locale、Cookie/storage値、健康・歩数データ、重複・範囲外・未量子化値 |
| Response | `{ "accepted": 1..4 }`、`Cache-Control: no-store`。入力値や識別子をechoしない |
| Logging | `PUBLIC_LANDING_VITALS`に許可済みbatchだけを構造化出力し、metric×mobile/desktopのp75算出に使用。DB・第三者analyticsへ保存しない |

### Client bundle budget

- `npm run build` のroute表で、全ページのFirst Load JSを200KB未満に保つ
- `npm run pages:build`でWorker moduleのgzip推定合計を2.8 MiB以下に保ち、Cloudflare無料枠3 MiBへ十分な余裕を残す
- favicon / Apple Touch Iconは`public/`の静的PNGを正本とし、metadata routeは`force-dynamic`の307で参照する。`next/og`のresvg WASMをWorkerへ同梱せず、Pages静的化でredirect statusを失わない
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
- Next.jsはApp Router/Server Actions修正版15.5.21以上、NextAuthは`@auth/core` 0.41.3を含む5.0.0-beta.32以上を使用する
- transitive依存は`sharp` 0.35.3、`postcss` 8.5.18へoverrideし、`npm audit --omit=dev --audit-level=high`を0件に保つ。`npm audit fix --force`やmajor downgradeは使用しない
- `@cloudflare/next-on-pages`のpeer範囲はNext.js 15.5.2までのため警告が出る。15.5.21との互換性は`npm run pages:build`で検証し、adapter移行は別変更として扱う

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
| Next.js Expert | [expert-nextjs-developer.agent.md](.github/agents/expert-nextjs-developer.agent.md) | GPT-4.1 | Next.js 15.5.21 App Router / Server Components / Edge Runtime / next-intl 専門 |
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

# カバレッジ付き（CI と同じ single-worker 実行）
npm run test:coverage -- --maxWorkers=1

# 全主要画面のレスポンシブ監査
RESPONSIVE_AUDIT_STORAGE_STATE_JA=/path/to/ja-state.json RESPONSIVE_AUDIT_USERNAME_JA=ja-user RESPONSIVE_AUDIT_GROUP_ID_JA=ja-group \
RESPONSIVE_AUDIT_STORAGE_STATE_EN=/path/to/en-state.json RESPONSIVE_AUDIT_USERNAME_EN=en-user RESPONSIVE_AUDIT_GROUP_ID_EN=en-group \
npm run audit:responsive

# Dashboardのミッション報酬復旧・愛用ギアfocus・Amazon popup通信隔離
DASHBOARD_E2E_LOCAL_SECRET=local-fixture-secret DASHBOARD_E2E_SUPABASE_FIXTURE_URL=http://127.0.0.1:54321 npm run test:e2e:dashboard

# 未認証の公開主要導線 + 認証fixtureによるSetup復旧E2E
npm run test:e2e

# 同じbranch・commitのlocalhost:3000を意図的に再利用する場合のみ
PLAYWRIGHT_REUSE_SERVER=1 npm run test:e2e

# Push購読CAS（allow_system_table_mods=onの破棄可能なlocalhost PostgreSQLだけで実行）
UCFITNESS_POSTGRES_RUNTIME_TEST=1 PUSH_CAS_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run test:postgres:push-cas

# Push受信者世代（同じ破棄可能なlocalhost PostgreSQLだけで実行）
UCFITNESS_POSTGRES_RUNTIME_TEST=1 PUSH_GENERATION_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run test:postgres:push-generation
# Push受信者protocol readiness（同じ破棄可能なlocalhost PostgreSQLだけで実行）
POSTGRES_TEST_USER=postgres
POSTGRES_TEST_PASSWORD=postgres
UCFITNESS_POSTGRES_RUNTIME_TEST=1 PUSH_PROTOCOL_POSTGRES_URL="postgresql://${POSTGRES_TEST_USER}:${POSTGRES_TEST_PASSWORD}@127.0.0.1:5432/postgres" npm run test:postgres:push-protocol
```

- テストフレームワーク: **Vitest**、公開主要導線とSetup復旧のE2Eは既存の `playwright/test`
- `npm run test:e2e` はlocalhost:3000で、320px日本語と1280px英語の未認証LP・言語切替・focus復帰・法務導線に加え、認証fixtureを使う320/375/1280pxのSetup loading・active・retryable error・recovered・completed、単一`main`、skip focus、44px、横overflow、status/session更新の最終ログ秘匿を検証する。fixtureはブラウザrouteで完結し、OAuth・DB write・本番操作を行わない
- E2Eのweb serverはデフォルトで専用のlocalhost:3000を起動し、別worktreeや古いcommitの既存サーバーを再利用しない。ポート競合時も既存プロセスをkillせず失敗する。同じbranch・commitのサーバーを意図的に管理している場合だけ、`PLAYWRIGHT_REUSE_SERVER=1`で明示的に再利用できる。ローカル専用プレースホルダー環境変数を使い、OAuth・DB write・本番操作は実行しない
- CIではPlaywrightの再試行後に成功したflaky testも失敗扱いにし、回帰を成功として隠さない
- CI はテストスイートをカバレッジ付きで1回だけ実行し、`lib/**/*.{ts,tsx}` の全本番モジュール（テスト、test-utils、型定義を除く）について Statements / Branches / Functions / Lines の global threshold 60% を検証
- historical baseline `e79a412b`は103 files・1273 testsを通常4.38秒、連続再実行4.51 / 4.34 / 4.49秒で完走した。current main `c353a40a`は114 files・1532 tests、cold 7.28秒、warm 6.26 / 6.25秒（mean 6.255秒）で5秒条件を満たさないため、coverage 60% gateはPASSのままF026のstatusを`in-progress`とする
- UCF-NEXT-005AはChallenge進捗auth/log境界とdate-only parseを`scripts/ucfitness-rule-targets.mjs`へ集約し、focused fileをstable predicate ID付き16件（direct 13件、semantic subprocess smoke 3件）へ変更した。quiet-host後の3組交互試行は変更前snapshotのwall mean 4.68秒 / Vitest mean 4.09秒に対し、変更後2.24秒 / 1.71秒で、wall 52.1%・Vitest 58.2%改善した。date semantic scanは4回のまま、明白なliteralだけのsmokeではtype checker生成を省き、型依存式とfull repositoryでは従来のTypeScript Program分類を維持する
- current base `c353a40a`の変更後`npm test` 3回は、1回目がWalkingRoutesの5秒waitForFunction timeoutで114ファイル・1534/1535件PASS、Vitest 12.77秒 / wall 13.44秒、2・3回目が114ファイル・1535件PASSでもVitest 7.06 / 6.36秒、wall 7.65 / 6.71秒だった。single-worker coverageは114ファイル・1535件を37.87秒でPASSし、Statements 70.95%、Branches 68.14%、Functions 81.14%、Lines 72.27%のglobal 60% gateを維持した。5秒条件と既存WalkingRoutes flakeが残るためF026は`in-progress`とし、UCF-NEXT-005Bは005A exact-head cohort再測定後にのみ開始する
- UCF-NEXT-005AはUCF-NEXT-013 `himiyosh-ucf-next-013-vitest-collection`（`08f13807`）を通常mergeで前提化したstackであり、前提がmainへ到達するまでは将来PRのbaseを同branchに固定する
- exact cohort head `f8e5c071`は115 files・1539 tests・skipped 0を維持し、canonical 25/30 PASS（成功run mean 7.298秒、5秒以内0/25）、contention 27/30 PASS、5 focused cohortsは各30/30 PASS、infrastructure failure 0、`aborted=null`だった。8 failureはすべて既存WalkingRoutesの`page.waitForFunction` 5000ms timeoutで、baseline→headのfailure rateはcanonical 1/10→5/30（Fisher p=1.0）、contention 2/10→3/30（p=0.5835）、pooled 3/20→8/60（p=1.0）のため005A起因を支持しない。final docs treeのsingle-worker coverageも115 files・1539 tests・skipped 0を27.54秒でPASSし、Statements 70.95%、Branches 68.14%、Functions 81.14%、Lines 72.27%を維持した。cohort artifactは`/Users/himiyosh/.copilot/session-state/58b22781-f5b0-42ab-b8e4-0a66f35a9905/files/f026-cohorts-f8e5c071-20260730T0349Z.json`、SHA-256 `28bf143cfcdd0857b77007e842c3769155e9daf9a941fe86046ca9e8c11b486d`。この追記はappend-only・test-neutralであり、`f8e5c071`のcohort結果を変更しない
- Feedとgroup rankingのquery-wave回帰はtest-onlyのcontrolled Supabase thenableを使い、query builder生成ではなく`.then()`開始時の固定semantic labelだけを記録する。Feedのfull-source・各partial pageは4 waves、group rankingのpartial pageは2 queries / 2 wavesで、900行full pageは後続pageごとに1 waveを追加し、900行が2回続く場合はterminal empty pageも1 query / 1 waveとして固定する。wave内順序はunordered setで扱い、別々のPostgREST pageを同一snapshotとはみなさない
- レスポンシブ監査は `screenshots/responsive/` に全画面画像、`summary.json`、`report.json` を保存し、320/375pxの44px操作領域、横スクロール、CLS、固定要素の見切れ、言語・タイトル、重要アセット取得を検査
- Dashboard回帰テストはbonus-only報酬失敗→新規browser context復旧、keyboard/pointer別focus・live通知・二重送信防止、商品loaded/empty/re-failure、有限画像fallback、Amazon popup初回通信隔離、320/375/1280pxの44px操作領域と横overflowを検査
- 同じ監査で、操作要素のaccessible name、フォームラベル、見出し順、重複ID、`aria-hidden`内のfocusable要素、スキップリンクの可視focusとmainへの移動、固定ヘッダー下の到達性、公開LPのモバイルメニューのviewport整列・44px・Escape焦点復帰、reduced-motion設定で初期表示中に開始・継続するCSS/ウェブアニメーションも検査
- 公開LPのFitbit連携判断は、モバイルのCTA下端→補足文上端→プライバシーリンク上端、デスクトップのCTA右端→補足領域左端を矩形の辺で比較し、非重なりと順序を固定する。CTA優位性は固定RGBでなく、塗り背景alpha・font weight・面積・shadowが第三導線より強いことをcomputed styleで検証する
- 未認証の公開LP・利用規約・プライバシーポリシーだけを確認する場合は `RESPONSIVE_AUDIT_SCOPE=public npm run audit:responsive` を使用（30ケース）。全150ケースの監査はja/en別の認証state、username、閲覧可能なgroup IDを必須とし、DB保存言語への同期、認証切れ、動的ページ省略を成功扱いにしない
- Supabase等のファイル単位モックを確実に分離するため、`forks` pool + `isolate: true` を使用
- Push購読CAS runtime jobはmigration SHA-256とdigest固定PostgreSQL 16 serviceを正本に、random prefixのfresh databaseごとにcatalog・negative fixture・2接続競合を検証し、全DBと作成roleを削除する。接続先はquery/hashなしの`postgresql://postgres:postgres@{loopback}:5432/postgres`と明示test-only flagに固定し、既存roleがあるcluster、本番Supabase、実購読、Push Serviceを拒否する。rollbackは依存コード停止後に`REVOKE ALL ON FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role; DROP FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz);`を同一transactionで実行し、テーブルは保持する
- Push受信者世代runtime jobはtarget/CAS migration SHA-256と同じPostgreSQL 16 serviceを正本に、canonical key digest、raw 20件、read/release fencing、legacy隔離、user削除、逆順transfer、CAS-first/save-firstを実ロック待機で検証する。接続・DB名・role・ログ・cleanupはCAS runtimeと同じtest-only契約を使い、migration、アプリ配線、production DB、実Pushを変更しない
- Push受信者protocol runtime jobはownership/protocol migration SHA-256と同じPostgreSQL 16 serviceを正本に、smallint protocol 0/1、旧save reset、exact read、release fence、逆順transfer、rollbackを実行検証する。query/hash/SSLなしのloopback `postgres`接続、allowlist済みfresh DB名、既存role拒否、固定非PIIラベル、全DB/role cleanupを必須とし、migration、PR #314/#315のLayer 3、lockfile、production DB、実Pushを変更しない
- テストファイル: リポジトリ内の `*.test.ts`（現行Vitest設定の `**/*.test.ts`）。`npm run test:collection`は通常・watch・coverageの前に必ず実行され、`vitest-include-coverage.test.ts`が`*.test.ts` / `*.test.tsx`を走査して`path.posix.matchesGlob`でinclude glob全体へ一致しないfileを名指しで拒否する。生成物・vendorとPlaywrightの`tests/*.spec.ts`は対象外
- 新しいtest fileの検証証拠はbase SHAを併記し、`full suite <before files>/<before tests> -> <after files>/<after tests> (+files/+tests), skipped 0`を必須とする。focused実行件数は補助証拠であり、full-suite収集の代替にしない
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
