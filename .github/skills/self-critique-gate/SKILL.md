---
name: self-critique-gate
description: "Use when: finishing any UCFitness task, applying fixes, changing UI, editing agent instructions/skills, responding to quality feedback, or before reporting completion. Enforces strict self-critique, anti-regression checks, Lessons Learned updates, evidence-based verification, and repeat fix-review loops until PASS."
---

# Self-Critique Gate

このスキルは、UCFitness の作業完了前に必ず実行する品質ゲートです。
目的は「修正したつもり」「一度直した問題の再発」「検証不足」「ユーザー指摘へのルール化漏れ」を防ぐことです。

## 必須起動タイミング

以下のいずれかに該当する場合、ユーザーへ完了報告する前に必ず実行する。

| タイミング | 必須理由 |
|---|---|
| コード・CSS・翻訳・設定・ドキュメントを変更した後 | 差分と要件の対応漏れを防ぐ |
| UI / UX / レイアウトを変更した後 | 表示崩れ・余白過多・横スクロール・見切れの再発を防ぐ |
| バグ修正後 | 元の症状が消えた証拠と回帰確認が必要 |
| カスタムエージェント / instructions / skills / prompts を変更した後 | README 同期・frontmatter・発見性を確認する |
| ユーザーから品質不満・「甘い」「戻った」「嘘」「殺風景」等のフィードバックを受けた後 | 反省点・根本原因・再発防止策を必ずルール化する |
| PR 作成・コミット・完了報告の直前 | 取りこぼしの最終検出 |

## 絶対ルール

- **日本語のみ**で自己批判・最終報告を書く。英語本文の併記は禁止。
- **証拠なしに PASS しない**。実行したコマンド、ブラウザ計測、差分確認などの根拠を持つ。
- **修正前提を再確認する**。ユーザーの元要望、指摘、完了条件と実装差分を 1 対 1 で照合する。
- **再発防止策を先送りしない**。ユーザーから品質フィードバックを受けた場合は、実装修正だけでなく `.github/copilot-instructions.md` 等に Lessons Learned を追加する。
- **一度直した箇所が戻っていないか確認する**。関連する Lessons Learned、過去修正パターン、該当ファイルの diff を確認する。
- **「起動中」「確認済み」などの状態報告は実測値だけで行う**。推測で報告しない。
- **NG / 要改善が 1 つでもあれば完了報告しない**。修正して再批判する。

## 実行手順

### 1. 要件と差分の照合

1. ユーザーの直近要望を 1 文で要約する。
2. 完了条件を箇条書きにする。
3. `git status --short --untracked-files=all` で、未追跡・ステージ済み・未ステージ変更をすべて把握する。
4. `git diff --name-only` / `git diff --stat` で未ステージ差分を確認する。
5. `git diff --cached --name-only` / `git diff --cached --stat` でステージ済み差分を確認する。
6. `git ls-files --others --exclude-standard` で新規ファイルがコミット対象から漏れていないか確認する。
7. 変更ファイルごとに「どの要件を満たすための変更か」を説明できるか確認する。
8. 無関係な変更・巻き戻し・不要な削除がないか確認する。

### 2. 再発防止・Lessons Learned 照合

以下に該当する場合は、必ず Lessons Learned を追加または更新する。

- ユーザーが品質不満を表明した
- 以前直した問題が再発した
- 実装者の確認不足・誤報告・見落としが原因だった
- instructions / skill / rule-check に落とし込める再発防止策がある

最低限確認する項目:

- `.github/copilot-instructions.md` に該当 LL があるか
- 既存ルールと矛盾していないか
- grep や lint で機械検出できる場合、`scripts/check-ucfitness-rules.sh` 等への追加を検討したか
- `.github/skills/` / `.github/agents/` / `.github/instructions/` を変更した場合、README の組織図と一覧を同期したか

### 3. 技術検証

変更内容に応じて必要な検証を実行する。

| 変更種別 | 必須検証 |
|---|---|
| TypeScript / React / API | `npx tsc --noEmit`, `npm run lint`, 関連テスト |
| UCFitness ルールに関わる変更 | `npm run check:rules` |
| 翻訳変更 | `npm run check:i18n` |
| UI 変更 | 375px / 1280px の実ブラウザ確認、必要に応じて 1920px |
| 100% 表示の密度変更 | 375px / 1280px / 1920px で `body.scrollHeight`、ヒーロー高さ、横スクロール、ファーストビュー内の情報量を測定 |
| App Shell / ナビ / スクロール変更 | root scroll、横スクロール、ヘッダー幅、Footer下端、header/avatar/badgeのbounding rect、主要ページ表示を確認。白文字付き通知badgeは塗り面専用danger tokenを使い、Classic/Midnightとも4.5:1以上 |
| mobile app / PWA変更 | `viewport-fit=cover`、top/bottom safe-area、44px、hover非依存、standalone相当の最初/最後の操作到達性 |
| 狭幅・ブレイクポイント変更 | 320/375/639/640/767/768/1023/1024/1279/1280でcontainer/card幅、h1行数、`body.scrollHeight`を比較。Sidebar出現後に多列化で狭くなっていないこと |
| 操作領域変更 | 各幅で全可視`button, a[href], input, select, summary`を列挙し、編集・エラー・空・disabled状態を含め幅・高さ44px未満が0件であること。画面外カルーセルリンクはfocus時に表示範囲へ移動する |
| a11y代替表変更 | `sr-only` wrapperがabsolute 1×1pxで、不可視tableが文書高やFooter後の残余高へ寄与しないこと |
| Home delight変更 | Questの進捗→競争→歩いた価値→次行動が3秒で理解でき、Mission→Weekly→Reward→Challengeの後を任意探索（Utility→Friend→Ranking）として判別できること。QuickActionsは独立補助Dockで、Following/週間Rankingより優先するstackへ戻っていないこと。Followingと週間Rankingはxlで直接同一行・下端差1px以内、実ユーザー＋発見行5行、個別目標progress、正歩数の活動人数/合計/達成人数、次ライバル名/必要歩数を持つこと。0歩を活動人数へ含めない。詳細Rankingは固定5行・72px・padding・reactionを維持したまま、外側多列化が2xl、1024/1280は単列で、Competition Missionへ現在順位・正歩数参加者数・次ライバル名・必要歩数・トップ差・期間を集約する。非トップの実進捗は99%以下で最低視覚幅とaria値を分離し、scope障害をallSettled等で分離する。1280pxで4列過圧縮がなく、複合カラムは少数データ時の1行を巨大化せず末尾空白帯8px以内、長名・長数値・focus ringがパネル内に収まること。Home/Profileグラフがパネル幅に応じて十分な高さを持ち、値/端ラベルclip、代替表との二重読み上げ、`aria-hidden`内Tab停止、Forced Colors境界を再監査する。固定行コピーは未記録・記録済み0歩・参加済みに一致し、非loading motionは650ms以下、reduced motionは0秒。Mission GET再試行中に準備POSTを露出せず、報酬失敗は非成功、成功はfocus/live/永続表示、補助ストリーク障害を0、Challenge進捗失敗を0%へ変換しないこと |
| Challenge優先度変更 | 参加中・active・開始済み・未終了・未達成・進捗取得済みだけが優先帯候補で、残り歩数→期限→報酬の順になっていること。主表示は残り総量でなく最大500歩、🔥報酬は残り3日以内だけ、作成CTAは一覧後の補助導線であること。進捗null/undefined/非数値を0へ変換せず、一覧・カード・参加APIの期限をJSTで統一する。タブ連打と参加/離脱完了のraceをAbortController、request generation、mounted ref、最新tab refで隔離し、開始前/終了/達成/無効チャレンジを優先表示しないこと。未達progressは99%以下、progressbar名/値、44px、320px、低減motionを確認する |
| 健康データ / ranking表示 | 0件・0歩・未集計とDB/API取得失敗が別状態で、失敗を成功形の既定値へ変換していないこと |
| Web Push / 通知ベル変更 | ユーザーの`language`で生成したtitle/body/locale/tagをRFC 8291 payloadの復号テストで確認し、header込み4096 bytes以内（JSON 3993成功・3994拒否）を境界検証する。payloadなしtickle、英語固定fallback、カテゴリ別バッジ送信を残さない。同一UA/legacy購読は最新1件、異なるUAは維持、404/410は削除し、並行再購読が相互削除できない一方向winnerを確認する。全ユーザー送信は固定バッチ、Push `Topic`とNotification `tag`は同種で揃え`renotify:false`にする。通知Feedは専用イベント時刻のない歩数/ストリーク派生通知を除外し、7日snapshot内の全sourceを最大10,000件までページ取得、超過は5xx、timestamp+IDで安定順序化して集約後にopaque offset cursorで分割する。ClientはAPI cursorを保持し、未読も同じ範囲・集約関数・実数を使う。通知ベルはja/enバッジ名、未読件数を含むaccessible name/live status、focusout/Escape/閉じる、可視既読ラベル+失敗表示、GET/POST世代隔離、56px名前付き行リンクを確認する |
| 主要導線 / ナビ / ホーム / ランキング / ショップ変更 | UCFitnessAgent の Persona Journey Review を使い、最低 2 ペルソナで Playwright 回遊監査 |
| 全ページ監査 | `app/[locale]/**/page.tsx`のルート台帳を作り、共通Shell / 競争 / アカウント / 商取引の各群で正常・空・障害・権限・320px・キーボード状態を確認。ホームだけのPASSで代替しない |
| 認証ページタイトル | 標準ページが`AuthenticatedPageHeader` + `PageIntro`を共有し、ブランド名がheadingではなく、ページ名だけが唯一の`h1`か確認。パンくず・説明・意味色アクセント・左右基準を375/1280pxで比較する |
| redirect / loading | 通常ナビがcanonical URLへ直接遷移し、全画面グローバルoverlayを使わずroute `loading.tsx`が完了・error・URL不変時に本文を覆い続けないことを確認する |
| 日付水和 | Server確定の`YYYY-MM-DD`をClientへ渡し、UTC固定演算で同一初期DOMを生成しているか確認。consoleのhydration警告と不正HTMLネストを0件にする |
| Dialog / Portal変更 | `useDialogFocus`によるTab循環、Escape、背景inert、scroll lock、焦点復帰、多重Dialog、保存中の退出可否と二重送信防止を確認 |
| チャート変更 | 視覚要約だけでなく、表示期間・系列・値へ到達できる`caption` / `th`付き表または同等リストがあり、画像生成専用DOMが`aria-hidden`であること |
| Server/Client共通入力 | URL allowlist等が共有モジュールにあり、サーバー側でも再検証され、UI判定と最終処理が一致すること |
| カスタマイズファイル変更 | YAML frontmatter、description の発見性、README 同期 |

既存 warning がある場合は、今回の変更で新規発生していないかを区別する。

### 4. UI / UX 6 軸批判

UI に触れた場合、`self-critique.agent.md` の 6 軸で必ず批判する。

| 軸 | 見ること |
|---|---|
| デザイン一貫性 | 他ページと同じアプリに見えるか、app logoが多色brand mark + solid wordmarkか、標準認証ページのheader / PageIntro / 唯一のh1 / 意味色・CTAが揃い、ホームだけはQuest storyでゲームらしい手応えを持つか |
| 余白・密度 | 間延び、巨大な空白、Footer中央浮き、進捗/競争/報酬/次行動に加え、時系列・蓄積・固定5行のranking preview・friend activityの実データがあり装飾だけで埋めていないか。詳細な社会比較は次行動より後で、friend activityが他者最大値基準の重複ランキングになっていないか |
| レスポンシブ | 320/375pxで見切れ・横スクロール・潰れがなく、1024pxのSidebar差引後もカードが過圧縮されず、header visual/badgeがheader rect内に収まるか |
| テキスト・翻訳 | ja/en キー、長文、数値・日付が破綻しないか。行リンクの`aria-label`が可視の名前・順位・歩数を上書きしていないか。曜日・歩数単位・Dialog名・操作名に英語固定が残っていないか |
| インタラクション | ローディング、disabled、エラー、空状態、フォーカスに加え、link panelがchevron/動詞とhover/focus/activeを持ち静的panelと区別できるか。API失敗・未記録・実際の0が別状態か。Dialogが保存中に永久トラップを作らず、同じ書き込みを再送しないか |
| コード品質 | Hooks 順序、Server/Client 境界、型安全、未使用 import、デバッグコード |

### 4.5. ペルソナ回遊監査

UI / UX / ナビゲーション / App Shell / 主要ユーザージャーニーを変更した場合は、UCFitnessAgent を統括役として Persona Journey Review を実行する。

最低実行条件:

- 軽微な UI 変更: 変更画面に関係するペルソナを最低 2 つ選ぶ
- ホーム / ナビ / App Shell / 主要導線変更: 5 ペルソナ全員を起動候補にする
- 375px と 1280px を最低確認する
- 状態変更を伴う操作は実行せず、押す前に理解できる情報を評価する
- ペルソナ別の「目的達成可否」「迷った箇所」「離脱理由」「改善案」をレポートする

ペルソナ:

- Persona Mobile Beginner
- Persona Competitive Athlete
- Persona Returning Low Activity
- Persona Reward Shop Explorer
- Persona Accessibility Keyboard

### 5. 失敗時のループ

1. NG / 要改善を具体的に列挙する。
2. 影響範囲を特定する。
3. 修正する。
4. 同じ観点で再検証する。
5. 最大 3 回繰り返しても PASS しない場合は、未解決理由と次の判断材料を報告する。

## 出力フォーマット

完了前の内部レビューまたはユーザー報告には、以下の形式を使う。

```markdown
## 自己批判ゲート

| 観点 | 判定 | 根拠 |
|---|---|---|
| 要件充足 | PASS / FAIL | {ユーザー要望と差分の対応} |
| 回帰防止 | PASS / FAIL | {過去修正・LL・巻き戻り確認} |
| 技術検証 | PASS / FAIL | {実行コマンド・結果} |
| UI/UX | PASS / FAIL / 対象外 | {viewport・スクリーンショット・DOM確認} |
| ペルソナ回遊 | PASS / FAIL / 対象外 | {実行ペルソナ・行動目的・発見事項} |
| ルール化 | PASS / FAIL / 対象外 | {Lessons Learned / README同期} |

### 総合判定: PASS / FAIL

### FAIL の場合の修正指示
1. `{file}`: {具体的な修正}
```

## 完了判定

次のすべてを満たす場合のみ PASS とする。

- ユーザー要望に対する実装・設定・文書化が完了している
- 関連する回帰確認が実施されている
- 必要な検証が通っている
- 品質フィードバックに対する Lessons Learned が記録されている
- README 同期対象のカスタマイズ変更が同期されている
- 未解決事項がある場合は、完了ではなく明確に未完了・ブロックとして報告している
