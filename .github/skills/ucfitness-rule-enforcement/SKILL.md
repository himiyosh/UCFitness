---
description: UCFitness プロジェクト固有ルールの自動検出・強制メカニズム。繰り返し違反されるルール（transition-all on leaderboard-row、auth.users FK、window.confirm、framer-motion、dark: クラス、edge runtime 漏れ、supabaseAdmin、select('*') など）を機械的にブロックする。ルール追加・違反調査・強制機構のメンテナンス時に参照する。
---

# UCFitness Rule Enforcement

## 概要

copilot-instructions.md / UCFitnessAgent の Lessons Learned に記録された「繰り返し違反されるルール」を、人間のレビューに頼らず機械的に検出・ブロックする仕組み。

## 構成

| 層 | 仕組み | 対象 |
|---|---|---|
| **① ESLint (dev-time)** | `eslint.config.mjs` の `no-restricted-imports` / `no-restricted-syntax` | `framer-motion` import / `window.confirm\|alert\|prompt` |
| **② rule-check.sh** | `scripts/check-ucfitness-rules.sh` による grep ベース静的検査 | leaderboard-row × transition-all / `auth.users` FK / `dark:` クラス / edge runtime 漏れ / 非 admin supabase / `.select('*')` (count-only 除く) など |
| **③ session-auto-commit hook** | `.github/hooks/session-auto-commit.sh` が rule-check を実行し違反ならコミット中止 | エージェント自動コミット時に違反混入を防止 |
| **④ npm scripts** | `npm run check:rules` / `npm run check:all` | 手動実行・CI 統合用 |

## 使い方

### エージェントが使う場合

完了チェックリストの前に:

```bash
npm run check:rules   # ルール違反のみ検査
npm run check:all     # ルール + tsc + lint 全部
```

**コミット前に必ず `check:rules` を実行する。** session-auto-commit が自動で走るが、手動コミット時にも確実に検査する。

### 新ルールを追加する手順

1. **違反パターンを特定** — 過去の Lessons Learned から「grep で検出できる明確なパターン」を抽出
2. **静的に検出できる場合 → ESLint または check-ucfitness-rules.sh に追加**
   - ESLint: AST ベース（`no-restricted-syntax` / `no-restricted-imports`）で書けるもの
   - shell grep: テキストパターンで十分なもの（クラス名・ファイル配置・SQL 文字列など）
3. **検証** — わざと違反を作って検出されることを確認
4. **対応するルールを copilot-instructions.md の該当セクションに追記**
5. **同一コミットに含める**（コード + プロンプト + 検査ルールの 3 点セット）

### 誤検知が起きたら

- 合法な例外パターンを `grep -v` で除外する（例: `{ count: 'exact', head: true }` の `.select('*')`）
- 除外範囲はコメントで明記し、なぜ合法かを記載

## 現在検出しているルール

| ID | 検出内容 | 出典 |
|---|---|---|
| R1 | `leaderboard-row` クラスに `transition-all` | ランキング統一ルール |
| R2 | `REFERENCES auth.users` | DB スキーマルール (public.users を使用) |
| R3 | `window.confirm/alert/prompt` | 確認ダイアログルール (ESLint + grep 二重検出) |
| R4 | `framer-motion` import | 外部ライブラリ禁止ルール (ESLint + grep) |
| R5 | `dark:` Tailwind クラス | テーマシステムルール (CSS 変数で対応) |
| R6 | `app/**/page.tsx` / `route.ts` の `runtime = 'edge'` 漏れ | Cloudflare Pages 必須 |
| R7 | `app/api` / `lib/services` で非 admin `supabase` import | サーバーサイド supabaseAdmin ルール |
| R8 | `.select('*')` (count-only 除く) | 必要カラムのみ指定ルール |

## 拡張候補 (未実装)

grep で検出困難だが重要なルール:

- **React Hooks 条件付き呼び出し** — ESLint `react-hooks/rules-of-hooks` が既にカバー
- **Server/Client 境界違反** (`'use client'` モジュールから Server Component に関数 import) — AST が必要、現状未実装
- **モバイル `flex` 横並びレスポンシブ漏れ** — Tailwind クラスの組み合わせ解析が必要
- **`transition-all` on リスト全般** — leaderboard-row 以外の広範なリスト要素。grep で見るには false positive が多い

これらは将来 custom ESLint rule として実装する余地あり。

## リファレンス

- `scripts/check-ucfitness-rules.sh` — grep 検査本体
- `eslint.config.mjs` — dev-time ESLint ルール
- `.github/hooks/session-auto-commit.sh` — コミットブロック連携
- `package.json` — `check:rules` / `check:all` スクリプト
- `UCFitnessAgent.agent.md` — Lessons Learned テーブル (ルール追加のソース)
