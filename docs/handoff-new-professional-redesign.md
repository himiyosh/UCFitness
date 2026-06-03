# UCFitness サービス再設計・プロ品質デザイン刷新 引き継ぎプロンプト

このプロンプトは、新しいセッションで **UCFitness を現在の機能・事業コンセプトを維持したまま、一から再検討し、プロが構築したようなサービス体験へ再設計するための計画**を作るためのものです。

最初のゴールは **実装ではなく実装計画** です。計画をユーザーへ提示し、承認を得てから実装に進んでください。

---

## 0. 最初に必ず読むファイル

作業開始直後に、以下を必ず読んでください。

1. `docs/common-agentic-project-rules.md`
   - 全プロジェクト共通の Agentic Engineering ルール。
   - MUST / SHOULD / MAY、整理整頓、`.gitignore`、AIスクラム、UI品質、Playwright、CI、プロンプトインジェクション、ADR、運用、依存関係、法務・プライバシー等を含む。
2. `.github/prompts/common-agentic-rules-maintainer.prompt.md`
   - 共通ルール文書を継続改善するためのプロンプト。
   - 作業中に汎用的な教訓が出た場合は、このプロンプトの方針で `docs/common-agentic-project-rules.md` を更新する。
3. `.github/copilot-instructions.md`
   - UCFitness 固有ルール。
4. `README.md`
   - 現在の構成・技術スタック・ドキュメント一覧。
5. `docs/professional-ui-redesign-spec.md`
   - 既存のプロ品質UI再設計資料があれば参考にする。ただし盲従せず、今回の方針と照合する。
6. `docs/DESIGN_TOKENS.md`
   - 既存デザイントークンの確認。

---

## 1. 現在のリポジトリ状態

- ローカル作業ブランチは削除済み。
- 現在の通常ブランチは `main`。
- 新しいコード変更・ドキュメント変更を行う場合は、**main で直接作業せず、必ず作業用ブランチを切る**。
- 推奨ブランチ名:
  - 計画のみ: `docs/professional-service-redesign-plan`
  - 実装まで進む場合: `ui/professional-service-redesign`
- リモートブランチは open PR の head が多いため、削除していない。
- 直前のデザイン復元試行は採用しない。ただし経緯確認が必要な場合のみ、セッション成果物の退避パッチを参照できる。

---

## 2. 今回の目的

UCFitness の現在の機能やコンセプトを維持しつつ、**単なる過去デザインの復元ではなく、サービス体験を一から検討しなおしたプロ品質のデザイン・情報設計・実装計画**を作る。

目指すのは以下です。

- フィットネスゲームとして「歩く / 競う / 報われる」が直感的に伝わる。
- 管理画面のような白いカードの羅列ではなく、プロダクトとしての世界観がある。
- ただし素人っぽく派手なだけではなく、信頼感・一貫性・操作性・密度・アクセシビリティを両立する。
- LP、認証済みホーム、ランキング、グループ、チャレンジ、ショップ、ウォレット、プロフィールが同じサービスに見える。
- 既存機能・DB・API・認証・i18n・PWA を壊さない。

---

## 3. 絶対に維持する機能

- Fitbit 歩数同期
- ダッシュボード
- ランキング / グループランキング
- グループ / グループ詳細 / グループリアクション
- チャレンジ
- UC コイン / ウォレット / ショップ / ギア
- プロフィール / バッジ / 称号 / フレーム
- プッシュ通知
- ja/en i18n
- PWA
- NextAuth v5 + Supabase の既存認証・DB構成

---

## 4. ユーザー承認済みのデザイン制約

以下は必ず守ってください。

- 認証済みホームは **左サイドバーなし** が正状態。
- `DashboardSidebar` をホームや共通 App Shell に戻さない。
- デスクトップは **上部ヘッダー + 中央寄せ `max-w-7xl` コンテンツ**を基本にする。
- モバイルはボトムナビを維持してよい。
- デフォルトブランドカラーは indigo → purple 系:
  - `--theme-primary: #4F46E5`
  - `--theme-gradient-from: #4F46E5`
  - `--theme-gradient-to: #9333EA`
- root 全体の `zoom` / `transform: scale()` で密度を作らない。
- `dark:`、`framer-motion`、`window.confirm()` / `window.alert()` は使わない。
- 新しい外部ライブラリは追加しない。

---

## 5. AIスクラム体制で計画する

今回の計画は大きいため、`docs/common-agentic-project-rules.md` の AI スクラム方針に従い、最低限以下の観点を分担したつもりで検討してください。

| 役割 | 見ること |
|---|---|
| Product Owner | UCFitness の価値、ユーザー体験、優先順位 |
| Orchestrator | 全体計画、依存関係、フェーズ分割、完了条件 |
| Architect | App Router、Server/Client境界、データ取得、Edge Runtime |
| UX/UI | 情報設計、視覚階層、デザイントークン、主要画面 |
| Accessibility | WCAG 2.2 AA、キーボード、ラベル、コントラスト |
| QA | Playwright、viewport、正常系/異常系/空状態 |
| Security | 認証境界、PII、secrets、依存関係、prompt injection |
| Performance | LCP / CLS / INP、bundle、画像、重いClient処理 |
| Self-Critique | 要件漏れ、過去の戻りすぎ、検証不足の検出 |

---

## 6. 計画対象ページ

必ず以下を対象に含めてください。

1. 未ログイン LP
2. 認証済みホーム / ダッシュボード
3. ランキング
4. グループ一覧
5. グループ詳細
6. チャレンジ
7. ショップ
8. ウォレット
9. プロフィール
10. 設定 / 初回セットアップ

---

## 7. 計画に必ず含める内容

### 7.1 現状診断

- 現在の UI / UX の問題点
- 画面ごとの情報過多・不足・導線の問題
- デザインの不統一
- 余白 / 密度 / 視覚階層 / 色の問題
- モバイル、タブレット、PC、ワイド画面での問題

### 7.2 新しいサービスコンセプト

- 一言で表すデザインコンセプト
- ユーザーに感じさせたい印象
- 「歩く / 競う / 報われる」をどう見せるか
- ゲーミフィケーションと信頼感のバランス

### 7.3 デザインシステム

- カラートークン
- typography
- spacing / density
- elevation / shadow
- card / panel / button / chip / tab / modal
- motion 方針
- icon / emoji / illustration 方針
- responsive breakpoint 方針

### 7.4 App Shell 方針

- 左サイドバーなしのヘッダー構成
- モバイルボトムナビ
- 認証済み・未ログインでの違い
- 主要導線配置
- 通知 / 同期 / ユーザーメニューの扱い

### 7.5 ページ別設計

各ページについて以下を出してください。

| ページ | 目的 | ファーストビュー | 主要CTA | 使用コンポーネント | リスク |
|---|---|---|---|---|---|

### 7.6 実装フェーズ

実装は小さく分けてください。

例:

1. デザイントークン / 共通 UI primitives
2. App Shell / navigation
3. LP
4. 認証済みホーム
5. ランキング / グループ
6. チャレンジ / ショップ / ウォレット
7. プロフィール / 設定
8. 全体 QA / Playwright / self-critique

### 7.7 検証計画

最低限:

- `npm run check:rules`
- `npm run check:i18n`
- `npx tsc --noEmit`
- `npm run lint`
- 必要に応じて関連テスト

UI:

- Playwright で 375px / 768px / 1280px / 必要に応じて 1920px
- screenshot
- DOM snapshot
- console error
- network 4xx/5xx
- viewport metrics
- 横スクロール
- ファーストビュー情報量
- 認証済みホームに左サイドバーが復活していないこと

### 7.8 リスクと回避策

必ず以下を含めてください。

- 既存機能破壊
- Server/Client 境界違反
- i18nキー不足
- UIだけ戻って機能が古くなるリスク
- 過去デザインへ戻しすぎるリスク
- モバイル崩れ
- パフォーマンス悪化
- アクセシビリティ低下
- secret / PII / dependency risk

---

## 8. 実装に入る前の停止条件

次の条件を満たすまでは、コード変更に進まないでください。

- `docs/common-agentic-project-rules.md` を読んだ。
- `common-agentic-rules-maintainer` の方針を理解した。
- UCFitness固有ルールを読んだ。
- 現状画面の問題を整理した。
- 実装計画をユーザーに提示した。
- ユーザーから実装フェーズ開始の承認を得た。

---

## 9. 注意

- これは単なる「デザインを戻す」作業ではない。
- これは単なる「派手にする」作業でもない。
- 現在の機能・コンセプトを守りながら、サービス体験・情報設計・視覚品質を再構築する作業である。
- 左サイドバーを戻す案は出してもよいが、**推奨案にしてはいけない**。採用する場合はユーザー確認が必須。
- ドキュメントや計画ファイルを量産しない。必要なら既存文書へ統合する。
