# UCFitnessAgent ハーネスエンジニアリング設計書

> **目的**: UCFitnessAgent を「短時間の単発タスク実行型」から「**長時間自走 + 複数エージェント協調**で品質を逓増させる**ハーネス型エージェントシステム**」に進化させるための設計書。
>
> **対象読者**: UCFitness を保守する開発者 / Copilot エージェント自身。
>
> **更新トリガー**: Anthropic Engineering Blog の更新、everything-claude-code パターンの新発見、本プロジェクトでの運用知見の蓄積。

---

## 🌐 English Command

> **Translation:**
> "Please research the basics of harness engineering for UCFitnessAgent and create a design document for implementation improvements that enable long-running autonomous trial-and-error and multi-agent collaboration."
>
> **文法ポイント**:
> - "harness engineering" は Anthropic が確立した固有名詞。LLM エージェント運用の足場 (scaffold) を指す
> - "long-running autonomous trial-and-error" = 長時間自走による試行錯誤
> - "multi-agent collaboration" = 複数エージェント間協調

---

## ℹ️ Executive Summary

Anthropic の "Effective Harnesses for Long-Running Agents" (2025-11) と "How we built our multi-agent research system" (2025-06) を起点にハーネスエンジニアリングをリサーチし、UCFitnessAgent への適用設計をまとめた。UCFitnessAgent 本体は **Session Bootstrap / ロール選択 / 検証・完了契約** に集中するbyte-safeなオーケストレーターとし、詳細手順は instructions、skills、prompts、Progress Fileへ分離する。**Orchestrator-Worker パターンによる並列探索**、**Verifier エージェントの分離**、**End-State Evaluation**、**Checkpoint/Resume 機構**、**Instinct 自動昇格**、**Token Budget 管理**は、このprofile budgetを維持したまま段階的に強化する。

---

## 1. ハーネスエンジニアリングのイロハ (リサーチサマリ)

### 1.1 ハーネスとは何か

**ハーネス (Harness)** = LLM エージェントを「単発呼び出し」ではなく「長時間自走するシステム」として動かすための**足場 (scaffold)**。具体的には以下の構成要素を含む。

| 構成要素 | 役割 |
|---|---|
| **System Prompt** | エージェントの恒常的な振る舞い・制約を定義 |
| **Tools** | エージェントが環境を観測・変更する手段 (file I/O, shell, browser, MCP) |
| **Context Management** | コンテキストウィンドウの圧縮 (compaction) ・要約・外部メモリへの退避 |
| **Persistent Artifacts** | セッション間で生き残るファイル (progress file, feature list, git history) |
| **Verification Loop** | 「完了」を主張する前に客観的な検証 (test, browser check, lint) を要求するゲート |
| **Multi-Agent Orchestration** | 専門化された複数エージェントの分業・並列実行 |

### 1.2 長時間エージェントの 2 大失敗モード (Anthropic)

> 出典: [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (2025-11-26)

1. **One-shot 試行による途中破綻**: コンテキストが尽きて機能が半実装のまま次セッションへ。次のエージェントは状況把握に時間を浪費し、基本動作の修復に追われる
2. **早すぎる完了宣言**: 後続セッションが「進捗あり」を見て独自判断で完了宣言。実際は半数の機能が未実装

### 1.3 Anthropic の解決策 (2-Part Solution)

| パート | 役割 | 実装 |
|---|---|---|
| **Initializer Agent** | 最初の 1 セッションのみ実行。環境を完全構築する専用プロンプト | `init.sh` (dev サーバー起動)、`feature_list.json` (200+ 機能、全て failing 初期化)、`claude-progress.txt` (作業ログ)、初回 git commit |
| **Coding Agent** | 2 回目以降のセッション。**1 機能ずつインクリメンタルに**前進し、終了時にクリーン状態を残す | `pwd` → progress file 読込 → git log → init.sh 実行 → 基本動作確認 → 1 機能実装 → コミット → progress 更新 |

### 1.4 4 つの Failure Mode と対策 (Anthropic)

| 問題 | Initializer の責務 | Coding Agent の責務 |
|---|---|---|
| 早すぎる完了宣言 | feature list (JSON) 作成 | セッション開始時に読み込み、1 機能のみ着手 |
| 環境がバグ・未文書化状態で残る | git repo + progress note 作成 | 開始時に progress 読込 + dev サーバーで基本動作確認、終了時にコミット + progress 更新 |
| 早すぎる feature 完了マーク | feature list 作成 | 全機能を **end-to-end でセルフ検証** してから passing マーク |
| 起動方法の調査時間浪費 | `init.sh` 作成 | セッション開始時に `init.sh` を読む |

### 1.5 マルチエージェントシステムの本質 (Anthropic Research)

> 出典: [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13)

#### Orchestrator-Worker パターン

```
User Query
   ↓
Lead Agent (Opus) — 戦略立案・タスク分解・最終合成
   ↓
分解されたサブタスク
   ↓
Subagents (Sonnet) ×N — 並列で独立コンテキスト・独立ツール群
   ↓
凝縮された結果
   ↓
Lead Agent — 統合・必要なら追加 subagent 起動
   ↓
Citation/Verifier Agent — 検証・出典付与
   ↓
最終出力
```

#### マルチエージェントの効果と代償

| 観点 | 数値 |
|---|---|
| 性能向上 (BrowseComp eval) | 単独エージェント比 **+90.2%** |
| 性能の説明変数 | トークン使用量 **80%** + ツール呼び出し数 + モデル選択 (合計 95%) |
| トークン消費 | チャットの **15 倍** (単独エージェントは 4 倍) |
| 適合タスク | 並列化可能・単独コンテキストを超える情報量・複雑な複数ツール |
| **不適合タスク** | **多くのコーディングタスク** (依存関係が多く並列化しにくい)・全エージェントが同じコンテキストを共有する必要がある場合 |

> **重要**: コーディング全般にマルチエージェントを適用すると過剰になりやすい。**並列化可能な探索フェーズ** (例: 改善ループの観点別レビュー) や **独立検証** (例: Self-Critique) に絞って適用すべき。

#### Lead Agent への 8 つのプロンプト原則

1. **Think like your agents** — 実際にエージェントを動かして観察し、メンタルモデルを構築する
2. **Teach the orchestrator how to delegate** — subagent には「目的・出力フォーマット・使用ツール・タスク境界」を明示
3. **Scale effort to query complexity** — 簡易: 1 agent + 3-10 tool calls / 比較: 2-4 agents + 10-15 tool calls / 複雑: 10+ agents
4. **Tool design and selection are critical** — 各ツールに明確な目的と説明。MCP サーバーの説明品質が成否を分ける
5. **Let agents improve themselves** — 失敗例を渡してプロンプトを自己改善させる (UCFitness 既実装の Lessons Learned に近い)
6. **Start wide, then narrow down** — 最初は短く広いクエリ、徐々に絞る
7. **Guide the thinking process** — Extended thinking を計画立案・サブタスク設計に活用
8. **Parallel tool calling** — Lead が 3-5 subagent を並列起動 + 各 subagent が 3+ tool を並列呼出 → 90% 時短

### 1.6 検証 (Evaluation) の本質

| 戦略 | 内容 |
|---|---|
| **Start with small samples** | 20 件程度の代表クエリから開始。プロンプト 1 行で 30%→80% に跳ねる時期がある |
| **LLM-as-judge** | 単一プロンプトで 0.0-1.0 + pass/fail を出力。複数 judge より単一 judge が一貫 |
| **Human evaluation** | 自動評価が見逃すエッジケース (SEO コンテンツ偏重等) を捕捉 |
| **End-state evaluation** | Multi-turn でステートを変更するエージェントは「途中経路」ではなく「最終状態」を評価 |
| **Checkpoint evaluation** | 複雑なワークフローは「特定の状態変化が起きるべき discrete checkpoint」で部分評価 |

### 1.7 本番運用の課題と対策

| 課題 | 対策 |
|---|---|
| エージェントはステートフル、エラーが累積する | 中断点から再開できる仕組み + retry logic + 定期 checkpoint |
| 非決定的でデバッグが困難 | 完全なトレース (どのツール・どのクエリ・どの結果) を記録 |
| デプロイ時に動作中エージェントが壊れる | Rainbow deployment (新旧バージョンを並走) |
| Synchronous 実行のボトルネック | 将来的に async 実行 + 結果調整機構 |

### 1.8 補足: Subagent の Filesystem 出力パターン

Subagent が大きな成果物 (コード・レポート・データ) を生成する場合、Lead Agent を経由してテキストで返すと「**伝言ゲーム**」で情報が劣化する。代わりに subagent が **artifact (ファイル)** を直接書き出し、Lead には **lightweight reference (ファイルパス)** だけ返す。これにより:

- トークンオーバーヘッドの削減
- フィルタリングによる情報損失の防止
- 構造化出力 (コード・レポート) の品質維持

---

## 2. UCFitnessAgent 現状分析 (As-Is)

### 2.1 既に実装済みの Harness 要素

| 要素 | 実装場所 | 状態 |
|---|---|---|
| **Session Bootstrap** | `UCFitnessAgent.agent.md`「Session Bootstrap」 | ✅ 実装済み |
| **Clean State / Self-Critique** | `UCFitnessAgent.agent.md` + `self-critique-gate` skill | ✅ 実装済み |
| **Progress File** (`ucfitness-progress.json`) | `.github/ucfitness-progress.json` | ✅ 実装済み (3 件のバックログのみ — 不足) |
| **Initial State Check** | `UCFitnessAgent.agent.md`「Session Bootstrap」 | ✅ 実装済み |
| **Specialized Sub-Agents** | `agents/*.agent.md` (13 ロール) | ✅ UCFitnessAgent配下へ統合済み |
| **Verification Loop** | `npx tsc --noEmit` + Playwright + Self-Critique | 🟡 部分的 (LLM judge なし) |
| **Lessons Learned** | `.github/copilot-instructions.md` | ✅ 実装済み |
| **Memory Persistence** | `/memories/session/`, `/memories/repo/` | ✅ 実装済み (使用頻度低) |
| **Initializer Script** (`init.sh`) | `.github/ucfitness-init.sh` | ✅ 実装済み |
| **Feature List (JSON, 全機能)** | `featureBacklog` (3 件のみ) | ❌ 不十分 (Anthropic は 200+ を推奨) |
| **End-state Evaluation** | なし | ❌ 未実装 |
| **Token Budget 管理** | なし | ❌ 未実装 |
| **Checkpoint/Resume 機構** | なし | ❌ 未実装 |
| **トレース・観測性** | hooks/ session-logger | 🟡 部分的 |
| **LLM-as-Judge** | Self-Critique エージェント | 🟡 単一観点のみ |
| **Instinct → Rule 自動昇格** | progress.json の `instincts` フィールド (空) | ❌ プレースホルダのみ |

### 2.2 現状の制約

1. **runSubagent は同期・直列実行が基本** — Anthropic Research の Lead-Worker 並列パターンを完全には再現できない
2. **コンテキスト共有は手動** — Subagent からの大きな出力は会話ヒストリ経由で戻る (filesystem artifact パターン未活用)
3. **Initializer と Coding Agent の役割分離が弱い** — Step 0 はあるが「初回専用プロンプト」が独立していない
4. **Feature List が薄い** — 3 件しかなく、改善ループでバックログ駆動できていない

---

## 3. 設計目標 (To-Be)

UCFitnessAgent に以下の能力を付与する:

| # | 目標 | 達成基準 |
|---|---|---|
| G1 | **長時間自走**: 1 セッション内で複数機能を試行錯誤しながら完了させる | 1 セッションで 3 機能以上を Clean State で完了させた実績 |
| G2 | **マルチエージェント協調**: 観点別 subagent を並列起動し、Lead が統合する | 改善ループ 1 サイクルで 3+ subagent が並列稼働 (Build + UI + Performance) |
| G3 | **構造化バックログ駆動**: 100+ 機能の構造化バックログから自動選択 | `featureBacklog` が 50+ 件、優先度・依存関係付き |
| G4 | **End-state Evaluation**: 機能が「動くこと」を Playwright + LLM-judge で検証してから passing | 各 feature に `verificationSteps` + `judgeRubric` |
| G5 | **Resume 可能**: 中断点から正確に再開 | `/memories/session/checkpoint.json` で state を復元できる |
| G6 | **Token-aware**: コンテキスト残量に応じて行動変更 | 残量 30% で要約 → checkpoint → 終了の自動フロー |
| G7 | **Instinct 自動昇格**: セッション内の学びが confidence 蓄積で自動的にルール化 | `instincts.items` から copilot-instructions への昇格パイプラインが稼働 |

---

## 4. アーキテクチャ設計

### 4.1 全体構成図

```
┌──────────────────────────────────────────────────────────────────┐
│                        User (VS Code Chat)                        │
└────────────────────────────┬─────────────────────────────────────┘
                              │
                ┌─────────────▼─────────────┐
                │   UCFitnessAgent (Lead)   │
                │   - リクエスト分析         │
                │   - ロール選択             │
                │   - タスク分解             │
                │   - subagent 起動戦略決定  │
                └──────┬──────────────┬─────┘
                       │              │
           ┌───────────▼───┐    ┌─────▼──────────┐
           │ Initializer   │    │  Coding Agent  │
           │ (初回のみ)     │    │  (2 回目以降)  │
           └───────────────┘    └────────┬───────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
       ┌──────▼──────┐            ┌───────▼──────┐           ┌────────▼───────┐
       │  Explorer   │            │  Implementer │           │   Verifier     │
       │ Subagents   │            │  Subagents   │           │  Subagents     │
       │ (並列・読取) │            │  (順次・書込)│           │  (並列・検証)  │
       └──────┬──────┘            └───────┬──────┘           └────────┬───────┘
              │                           │                           │
              └─────────┬─────────────────┴────────────┬──────────────┘
                        │                              │
                ┌───────▼──────────┐          ┌────────▼────────┐
                │ Filesystem       │          │ Persistent      │
                │ Artifacts        │          │ State           │
                │ (lib/, app/, .md)│          │ (progress.json, │
                │                  │          │  features.json, │
                │                  │          │  checkpoint.json│
                │                  │          │  instincts.json)│
                └──────────────────┘          └─────────────────┘
```

### 4.2 エージェント階層 (3 層)

#### Layer 1: Lead (UCFitnessAgent)

- ユーザーリクエスト受信 → 戦略立案 → 完了報告
- **Extended thinking** で計画
- Subagent への委任プロンプトを生成 (目的・出力フォーマット・ツール・境界を明示)
- 結果統合・矛盾解消
- Token budget 監視

#### Layer 2: Specialized Agents (3 系統)

| 系統 | 目的 | 並列度 | 既存ロールマッピング |
|---|---|---|---|
| **Explorer** | 読み取り専用の調査・分析 | 高 (3-5 並列) | Plan Mode / NewFeatureDiscovery / Explore subagent |
| **Implementer** | コード変更を伴う実装 | 低 (1-2 直列) | Next.js / React / Security / Monetization |
| **Verifier** | 完了状態の検証 | 中 (2-3 並列) | QA / Playwright Tester / Self-Critique / Build Validation |

#### Layer 3: Skills (再利用可能な手順)

- `next-intl-add-language` / `postgresql-optimization` / `web-design-reviewer` (既存)
- 新規候補: `feature-spec-writer` / `e2e-verification` / `checkpoint-snapshot`

### 4.3 永続化アーティファクト (Persistent State)

| ファイル | 形式 | 役割 | 更新頻度 |
|---|---|---|---|
| `.github/ucfitness-progress.json` | JSON | セッション間ハンドオフ (lastAgent, summary, sessionLog) | 各タスク完了時 |
| `.github/ucfitness-features.json` ✨**新規** | JSON | 全機能リスト (200+ entries, status, verificationSteps, judgeRubric) | 機能完了時のみ status 変更 |
| `.github/ucfitness-init.sh` ✨**新規** | Shell | dev サーバー起動・基本動作確認スクリプト | 環境変更時 |
| `/memories/session/checkpoint.json` ✨**新規** | JSON | コンテキスト圧縮前のスナップショット (作業中ファイル・残タスク・直前の検証結果) | 残コンテキスト 30% 時点で自動 |
| `/memories/repo/instincts.json` ✨**新規** | JSON | confidence 付き暫定パターン (0.8 超で copilot-instructions に昇格) | 学習発生時 |
| `docs/improvement-report.md` | Markdown | 改善ループのサイクル別レポート | 各 Cycle 完了時 |
| `screenshots/` | PNG | Playwright 検証エビデンス | 検証時 |

### 4.4 Feature List のスキーマ (新規)

`anthropic/claude-quickstarts/autonomous-coding` の構造を踏襲しつつ UCFitness 向けに拡張:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "1.0.0",
  "lastUpdated": "2026-04-18T00:00:00Z",
  "features": [
    {
      "id": "F001",
      "category": "gamification",
      "priority": "P1",
      "description": "期間限定チャレンジイベントが作成できる",
      "rationale": "エンゲージメント向上 — 既存ユーザーリテンション +15% 期待",
      "dependsOn": [],
      "estimatedComplexity": "medium",
      "filesAffected": ["app/[locale]/challenges/", "app/api/challenge/", "lib/services/challenge-*.ts"],
      "verificationSteps": [
        "管理者として /challenges/create で期間限定 toggle ON にして作成できる",
        "一覧で「期間限定」バッジが表示される",
        "終了日後はリストから自動非表示になる",
        "Playwright モバイル (375) + デスクトップ (1280) で表示崩れがない"
      ],
      "judgeRubric": {
        "functional_correctness": "期間限定 toggle が DB に永続化され、終了日後に非表示になるか",
        "ui_consistency": "他のチャレンジカードと同じスタイル (rounded-xl, theme color) か",
        "i18n_completeness": "ja.json + en.json 両方に翻訳キーが追加されているか",
        "edge_runtime_compat": "新規 page.tsx / route.ts に export const runtime = 'edge' があるか"
      },
      "status": "not-started",
      "lastAttempt": null,
      "lastError": null
    }
  ]
}
```

> **Anthropic 流の保護ルール**: Coding Agent は `status` フィールドのみ変更可。`description` / `verificationSteps` / `judgeRubric` の改変は原則禁止 (仕様変更時は Lead 経由でユーザー確認)。

### 4.5 Initializer Script (`init.sh`) の最小構成

```bash
#!/usr/bin/env bash
# UCFitness Initializer Script — 環境を「すぐに作業できる状態」にする
set -euo pipefail

# 1. ポート 3000 を強制解放 (NextAuth コールバック URL 固定)
lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true

# 2. .next キャッシュ破損対策
rm -rf .next

# 3. 依存関係確認
if [ ! -d node_modules ]; then
  npm ci
fi

# 4. 型チェック (素早いヘルスチェック)
npx tsc --noEmit

# 5. dev サーバーをバックグラウンド起動
npm run dev > /tmp/ucfitness-dev.log 2>&1 &
DEV_PID=$!

# 6. 起動待機 (最大 30 秒)
for i in {1..30}; do
  if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo "OK: dev server up (PID=$DEV_PID)"
    exit 0
  fi
  sleep 1
done

echo "ERR: dev server failed to start within 30s"
cat /tmp/ucfitness-dev.log
exit 1
```

### 4.6 Checkpoint/Resume 機構

#### 起動条件

- 残コンテキスト 30% 以下
- ユーザーが明示的に「中断」を要求
- 重要マイルストーン到達 (1 機能完了時)

#### Checkpoint スキーマ

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "createdAt": "2026-04-18T12:34:56Z",
  "agentRole": "Next.js Expert",
  "currentFeatureId": "F042",
  "phase": "implementation", 
  "completedSteps": ["read existing files", "draft new component", "add i18n keys"],
  "remainingSteps": ["wire up API", "add Playwright verification"],
  "filesInProgress": [
    {"path": "components/challenge/EventBadge.tsx", "lastModified": "2026-04-18T12:30:00Z", "uncommitted": true}
  ],
  "lastVerification": {
    "tscErrors": 0,
    "lintErrors": 0,
    "playwrightStatus": "pending"
  },
  "notesForResume": "EventBadge コンポーネントは骨格まで完成。次は ChallengeCard.tsx に統合し、ja/en の eventLabel キーを追加する"
}
```

### 4.7 Token Budget 管理

| ゲート | 閾値 | 動作 |
|---|---|---|
| Green | コンテキスト 0-60% | 通常稼働。新規 subagent 起動可 |
| Yellow | 60-80% | 並列度を 1 に下げる。長文ファイル読込を避ける |
| Orange | 80-90% | 現在の機能を Clean State に持っていくことを最優先。新規探索禁止 |
| Red | 90%+ | **強制 Checkpoint** → progress.json 更新 → コミット → 「次セッションで継続」を報告 |

---

## 5. 実装ロードマップ (5 フェーズ)

### Phase 0: 基礎整備 (即実施可能・1 セッション)

| # | タスク | 成果物 |
|---|---|---|
| P0-1 | `init.sh` 作成 | `.github/ucfitness-init.sh` |
| P0-2 | `ucfitness-features.json` を作成し、現状の主要機能を 30+ 件登録 | `.github/ucfitness-features.json` |
| P0-3 | `progress.json` の `featureBacklog` を `features.json` 参照に統合 | `progress.json` 修正 |
| P0-4 | `Session Bootstrap` から `features.json` を正本参照する | compact agentの参照契約を維持 |

### Phase 1: マルチエージェント並列化 (1-2 セッション)

| # | タスク | 成果物 |
|---|---|---|
| P1-1 | Lead Agent の「委任プロンプト生成」テンプレートを定義 (目的・出力・ツール・境界の 4 要素) | `.github/prompts/` にテンプレート追加 |
| P1-2 | Improvement Loop を「3 並列 subagent」に変更 (Build + UI + Performance を同時起動) | skill / promptへ実行手順を追加 |
| P1-3 | Subagent の Filesystem Artifact パターンを導入 (大きな結果はファイルに書き出し、Lead にはパスを返す) | `improvement-report.md` セクション分割 |

### Phase 2: 検証強化 (1 セッション)

| # | タスク | 成果物 |
|---|---|---|
| P2-1 | 各 feature に `verificationSteps` + `judgeRubric` を必須化 | `features.json` スキーマ確定 |
| P2-2 | LLM-as-Judge ロールを Self-Critique に追加 (rubric 採点 0.0-1.0 + pass/fail) | `self-critique.agent.md` 拡張 |
| P2-3 | 完了マーキング前のゲート: 全 verificationSteps が PASS + judge が pass を返す | `self-critique-gate` skill修正 |

### Phase 3: Checkpoint/Resume (1-2 セッション)

| # | タスク | 成果物 |
|---|---|---|
| P3-1 | `/memories/session/checkpoint.json` のスキーマ定義 + Lead Agent の Token Budget Gate 実装 | checkpoint skill / schema追加 |
| P3-2 | Session Bootstrapでcheckpointを優先復元する | compact agentは参照契約のみ維持 |
| P3-3 | 強制 Checkpoint 発動シナリオの dry-run テスト | `/memories/session/checkpoint-test.md` |

### Phase 4: Instinct 自動昇格 (継続改善)

| # | タスク | 成果物 |
|---|---|---|
| P4-1 | `instincts.json` のスキーマ定義 (`pattern`, `confidence`, `evidence`, `firstSeen`, `lastSeen`) | `/memories/repo/instincts.json` |
| P4-2 | Lessons Learned 発見時に instincts に追記するルールを Lead Agent に組込 | skill / instructions修正 |
| P4-3 | confidence 0.8 超を検出したら copilot-instructions.md に昇格する半自動フロー | 昇格チェックリストをskillへ追加 |

---

## 6. 委任プロンプトテンプレート (Lead → Subagent)

> Anthropic Research の "Teach the orchestrator how to delegate" 原則に基づく。

```markdown
# Subagent 委任プロンプト

## 1. Objective (目的・1 文)
{何を達成するか。曖昧な「調査して」ではなく「X を Y して Z を返す」と具体化}

## 2. Scope (境界)
- **対象範囲**: {ファイル / ディレクトリ / 機能 ID}
- **対象外**: {触れてはいけないファイル・機能}
- **依存タスク**: {このタスクに先行する完了済みタスク}

## 3. Tools (使用ツール)
- 必須: {tool_search_tool_regex でロードする MCP / 使うべき内蔵ツール}
- 禁止: {使ってはいけないツール (例: write 系 — Explorer の場合)}

## 4. Output Format (出力形式)
- **ファイル**: {書き出すファイルパスとフォーマット — Filesystem Artifact パターン}
- **Lead への返答**: {3-5 行のサマリ + ファイルパス。詳細はファイル参照}

## 5. Effort Budget (工数上限)
- ツール呼び出し: 最大 {N} 回
- 推論時間: {軽量 / 標準 / Extended thinking 必須}
- 中断条件: {N 回失敗したら諦めて Lead に報告}

## 6. Quality Gates (検証ゲート)
- [ ] {このタスク固有の合格基準 1}
- [ ] {合格基準 2}
- [ ] (UI 変更時) Playwright モバイル + デスクトップ表示確認
```

---

## 7. リスク・既知の制約

| # | リスク | 軽減策 |
|---|---|---|
| R1 | マルチエージェントでトークンが 15× 膨張 | Phase 1 の並列化は「探索系」「検証系」に限定。実装系は依然として直列 |
| R2 | runSubagent は同期実行のため真の並列ではない | 段階的に subagent 並列起動を試行し、効率測定。効果が薄ければ直列に戻す |
| R3 | Feature List 200+ の管理コストが高い | Phase 0 では 30 件から開始し、ループの中で漸増 |
| R4 | Checkpoint ファイルの肥大化 | スナップショットは「再開に必要な最小情報」に限定。古い checkpoint は次セッション開始時に削除 |
| R5 | Instinct 自動昇格の誤昇格 | confidence 0.8 + 最低 3 件の evidence を要求。昇格時に必ず Lead が要約してユーザー確認 |
| R6 | デプロイ中のエージェントが旧プロンプトで動作 | プロンプト変更時は `progress.json` に `promptVersion` を記録し、Bootstrap で互換性チェック |

---

## 8. 成功指標 (KPI)

| 指標 | 現状 | 目標 (Phase 4 完了時) |
|---|---|---|
| 1 セッションで完了する機能数 | 1 (典型) | 3+ |
| Improvement Loop 1 サイクルの subagent 並列度 | 1 (直列) | 3 (並列) |
| Feature Backlog 件数 | 3 | 50+ |
| Clean State Protocol 違反率 (テスト fail のままコミット) | 不明 (計測なし) | 5% 以下 |
| Checkpoint からの正確な再開成功率 | 0% (機構なし) | 90%+ |
| Lessons Learned → ルール昇格までの平均サイクル数 | 不定 (手動) | 3 以下 |
| 同一バグの再発率 (Lessons Learned 追記後) | 不明 | 10% 以下 |

---

## 9. 次のアクション (本設計書の運用)

1. **本設計書をユーザーレビュー** → 5 フェーズの優先順位 / スコープを確定
2. ユーザー承認後、Phase 0 を即実装 (`init.sh` + `features.json` 雛形作成)
3. Phase 1 着手前に、現行 `runSubagent` の並列実行可否を実機検証
4. 各 Phase 完了時に `improvement-report.md` に成果と学びを記録
5. 全 Phase 完了後、本設計書を「v1.0 確定版」として `docs/harness-engineering-design.md` に保管し、以降は Lessons Learned に基づき差分更新

---

## 📚 参考文献

- Anthropic, ["Effective Harnesses for Long-Running Agents"](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (2025-11-26)
- Anthropic, ["How we built our multi-agent research system"](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13)
- Anthropic, ["Claude 4 Best Practices: Multi-Context Window Workflows"](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices#multi-context-window-workflows)
- [anthropics/claude-quickstarts (autonomous-coding)](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)
- 既存実装: `.github/agents/UCFitnessAgent.agent.md` (Session Bootstrap, ロール選択, 検証・完了契約)
- 既存実装: `.github/ucfitness-progress.json` (Progress File)

---

**サマリ**: 全件 ✅ 設計書ドラフト完成
