# AGENTS.md — UCFitness

このファイルは、AI コーディングエージェント（GitHub Copilot, Claude, Cursor, Codex 等）が UCFitness プロジェクトで作業する際の **プラットフォーム共通設定** を宣言する。
プロジェクト固有の詳細ルールは [`.github/copilot-instructions.md`](.github/copilot-instructions.md) を参照すること。

## Baseline ターゲット

This project's Baseline target is **Baseline 2024**.

UCFitness は Cloudflare Pages (Edge Runtime) + Next.js 15 + React 19 のモダンスタックで動作するため、
[Baseline 2024](https://web.dev/baseline) でサポートされる Web プラットフォーム機能を積極的に活用してよい。

具体的には以下のような API をポリフィル不要で使用できる:

- CSS Container Queries (`@container`, `cqw`, `cqh`)
- `:has()` セレクター / `:user-valid` / `:user-invalid`
- `<dialog>` 要素・Popover API (`popover` 属性)
- View Transitions API
- CSS Anchor Positioning
- `field-sizing: content`
- `scheduler.yield()` (INP 最適化)
- Web Animations API
- `Array.prototype.toSorted()` 等の non-mutating 配列メソッド

## 実行環境の制約

- **Cloudflare Pages (Edge Runtime)** にデプロイする。Node.js 専用 API（`fs`, `path`, `child_process`, `Buffer`）は使用禁止。代わりに Web Platform API（`crypto.subtle`, `btoa`/`atob`, `fetch`, `ReadableStream`）を使用する。
- すべての `app/**/page.tsx` および `app/api/**/route.ts` の先頭に `export const runtime = "edge";` を宣言する。
- DB は Supabase (PostgreSQL)。サーバーサイドからは `supabaseAdmin` を使用する。

## 利用可能なエージェントスキル

| スキル | パス | 用途 |
|---|---|---|
| modern-web-guidance | `.agents/skills/modern-web-guidance/SKILL.md` | モダン Web プラットフォーム API のベストプラクティス検索 (Google Chrome 公式) |
| web-design-reviewer | `.github/skills/web-design-reviewer/SKILL.md` | UI/UX デザインレビュー・ビジュアルチェック |
| postgresql-optimization | `.github/skills/postgresql-optimization/SKILL.md` | PostgreSQL クエリ最適化 |
| next-intl-add-language | `.github/skills/next-intl-add-language/SKILL.md` | next-intl 翻訳キー追加ワークフロー |
| ucfitness-rule-enforcement | `.github/skills/ucfitness-rule-enforcement/SKILL.md` | UCFitness 固有ルールの強制機構 |

### Modern Web Guidance の利用

HTML/CSS/クライアント JS の実装タスクでは、コーディング前に Modern Web Guidance を検索すること:

```sh
npx -y modern-web-guidance@latest search "<action-oriented query>"
npx -y modern-web-guidance@latest retrieve <id1>,<id2>
```

旧来のワークアラウンド（ライブラリの追加、独自実装）よりも、モダン Web API による解決を優先する。

## 詳細ルール

プロジェクト固有のコーディング規約・絶対遵守ルール（テーマシステム、Hooks 配置、モバイルファースト、リーダーボード統一仕様 等）は以下を参照:

- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — 共通コーディング規約・絶対遵守ルール
- [`.github/instructions/`](.github/instructions/) — 領域別の詳細指示 (a11y, hooks, security, mobile-first 等)
- [`.github/agents/UCFitnessAgent.agent.md`](.github/agents/UCFitnessAgent.agent.md) — マスターオーケストレーターエージェント
