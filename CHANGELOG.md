# 変更履歴

UCFitness の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) を参考にし、変更日と統合単位が追跡できる見出しを使用します。

## 2026-07-16 - 認証後体験と品質基盤の正本統合

### 追加

- Fitbit Web API 終了に備えた Google Health の段階移行基盤
  - OAuth state の開始ユーザー拘束、外部IDの継続照合、AES-256-GCMによる資格情報保護
  - ユーザー単位の同期リース、初回履歴の原子的置換、当日歩数の単調増加保存
- 認証後ホームの Quest 体験
  - 今日の進捗、次ライバル差、UC報酬、次の行動を一続きで表示
  - 週間歩数、UC残高、固定5行ランキング、Friend Pulseを追加
- 初回セットアップの3ステップフロー
  - プロフィールと歩数ソース、日次目標、コミュニティ導線を段階表示
  - 後回し、進捗表示、焦点管理、最初の500歩へのActivation導線を追加
- 通知の言語別配信、バッジ横断集約、購読重複制御、論理通知単位の未読管理
- グループ、ランキング、チャレンジへ到達可能な競争差と部分障害表示を追加
- Walletへ獲得・支出・純増減、次の歩数UC、日次純増減チャートを追加
- Profileへ0歩・未記録・取得失敗を区別する集計とセクション単位の障害表示を追加

### 変更

- 認証済み全ページを共通App Shell、`AuthenticatedPageHeader`、`PageIntro`へ統一
- ホーム、Groups、Settings、Profile、Wallet、Challenges、Shopなど主要画面をモバイルファーストで再設計
- Sidebar出現後の実コンテンツ幅を基準に、多列化を `xl` / `2xl` へ調整
- Settingsの情報順を歩数ソース、日次目標、プロフィール、表示設定の順へ変更
- Challengesで参加中・未達成の次の最大500歩を優先表示
- Groupsの人数表示を実メンバー数とランキング参加人数に分離
- ログイン失敗を安全なja/en文言へ分類し、callback先を言語切替・再ログイン・setup完了後まで保持
- 明示的な `any` を具体型または `unknown` と型ガードへ置換し、`no-explicit-any` をESLintエラーへ強化

### 修正

- DB取得失敗を0歩、未設定、空ランキング、未所属などの正常状態へ変換していた問題を修正
- 通知嗜好カラム未適用時にFeed全体と未読数が停止する問題を修正
- Profileの平均値、比較系列、欠測日、記録済み0歩の集計を修正
- Walletの購入支出が「今日の入金」を減額する表示を修正
- 正歩数のないユーザーやグループが順位・メダル・参加人数へ含まれる問題を修正
- 固定ヘッダー、BottomNav、safe-area、Footer、スキップリンク、モーダル焦点管理の見切れを修正
- Safariのlocalhost CSSをHTTPSへ変換していた開発CSPを修正
- Serverとブラウザの日付差、不正なDOM入れ子、全画面ローダーによる水和・表示問題を修正
- Vitestの`vmForks`でテストファイル間のSupabaseモックが漏れる問題を、`forks` + 明示的なファイル分離へ変更して修正

### セキュリティ

- OAuthアカウント照合を `provider + provider_account_id` の完全一致へ限定
- Google Health OAuth stateを開始ユーザー、nonce、有効期限のHMAC署名へ拘束
- 接続保存、解除、履歴移行、同期由来書き込みをDBトランザクションと所有者リースで保護
- 更新トークン欠落、一時障害、恒久的な資格情報失効を分離
- Fitbit履歴保存時にGoogle Health選択状態をDB内で再検証

### パフォーマンス

- 公開ランディングページをServer Componentと最小Client islandsへ分割
- 日本語Webフォント依存とLCP要素の初期transformを除去
- Lighthouse MobileのFast 3G相当・CPU 4倍条件でLCPを約18.4秒から2,349msへ改善
- 同条件でCLS 0、操作Event Timing最大48msを確認

### 品質

- TypeScript、ESLint、UCFitnessルール、ja/en翻訳整合性を `npm run check:all` で検証
- Vitest 46ファイル・296件を通過
- 375 / 768 / 1280 / 1920px、Classic / Midnightテーマの回帰監査を実施
- ペルソナ回遊、独立レビュー、自己批判ゲートを完了

### 既知の制約

- Google Health / Fitbitの実OAuth E2Eは外部資格情報と接続状態を変更するため未実施
- Google Health関連DBマイグレーションの本番適用はユーザー承認待ち
- Web Pushの実端末表示は購読・既読状態を変更するため未実施
- 認証済み画面の一部は実ユーザーPIIを使わず、純粋テスト、ソース監査、ペルソナ監査で代替
- デイリーミッション報酬の原子的DB RPCと既存取引制約の変更は承認待ち

### 関連情報

- Pull Request: [#227](https://github.com/himiyosh/UCFitness/pull/227)
- 主要実装コミット範囲: `8430026..5258b6c`
- CHANGELOG・CI修正を含む完全な履歴はPull Request #227のコミット一覧を参照

## v0.1.0 - 初期リリース

### 追加

- Fitbit連携歩数トラッキング
- グループ対抗ランキング
- バッジ・コイン経済システム
- PWA対応
- 日本語・英語i18n
