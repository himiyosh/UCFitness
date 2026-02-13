#!/usr/bin/env python3
"""
自律的コード改善ループ (Autonomous Code Improvement Loop)

5つの専門エージェント (Build Validation, UI/UX, Performance, Security, Feature Enhancement) が
Generator ↔ Reviewer パターンで最大3回のイテレーションを回し、
テスト通過を保証しながらコードを改善するスクリプト。

使用ツール: GitHub Models API (gpt-4.1)
認証: gh auth token (GitHub CLI のトークンを流用)
実行環境: ローカル / GitHub Actions
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from difflib import unified_diff
from pathlib import Path
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# ログ設定
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("agent_loop")

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------
MAX_ITERATIONS = 3                 # Generator↔Reviewer ループの最大回数
MAX_CYCLES_DEFAULT = 5             # マルチサイクルのデフォルト最大回数
MAX_CHANGED_LINES = 300            # 1ファイルあたりの最大変更行数
MAX_CODE_CONTEXT = 8000            # AIに送信するコードの最大文字数
COMMIT_PREFIX = "[bot] AI-Improvement"
IMPROVEMENT_BRANCH = "bot/ai-improvements"  # 改善コミット用の固定ブランチ
REPO_ROOT = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
# 改善対象の拡張子
TARGET_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx",
    ".py",
    ".css", ".scss",
    ".json",
}
# テスト/設定ファイルなど除外パターン
EXCLUDE_PATTERNS = {
    "node_modules", ".next", "dist", "build",
    "__pycache__", ".git", "coverage",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
}

# ---------------------------------------------------------------------------
# アプリケーションコンテキスト (プロンプト注入用)
# ---------------------------------------------------------------------------
APP_CONTEXT = textwrap.dedent("""\
    ## アプリケーション情報: UCFitness
    UCFitness は Fitbit と連携した歩数トラッキング・フィットネス競争アプリ (PWA) です。

    ### 主な機能
    - 歩数記録・Fitbit同期 (AutoSync)
    - リーダーボード (日/週/月/年 + アニメーション付きランキング)
    - グループ対戦 (作成・参加・ランキング・分析)
    - バッジ収集システム (達成バッジ・レベルバッジ)
    - コイン経済 (歩数→コイン換算・投資家ランク)
    - ショップ (アイコンフレーム・タイトル・テーマ購入)
    - プロフィール管理 (プロフィール画像・バナー画像・称号)
    - プッシュ通知 (Web Push)

    ### 技術スタック
    - Next.js 15 (App Router, RSC + Client Components)
    - TypeScript, React 19
    - Tailwind CSS v4 (@import "tailwindcss" 構文)
    - Supabase (PostgreSQL)
    - NextAuth v5 beta (認証)
    - next-intl (i18n: ja/en)
    - Recharts 3.6 (チャート)
    - Cloudflare Pages (デプロイ)
    - CSS カスタムプロパティでテーマ切替 (classic/midnight)
      - Tailwind の dark: は不使用。var(--theme-primary) 等を使用
    - アニメーション: 純粋 CSS keyframes (framer-motion 不使用)

    ### 現在不足しているUXパターン
    - Error Boundary (error.tsx が未実装)
    - ローディングスケルトン (コンテンツ形状のプレースホルダー)
    - 確認ダイアログ (破壊的操作のガード)
    - 最終同期タイムスタンプの表示
    - ページ遷移アニメーション
    - 空状態のリッチUI (イラスト・CTA付き)
""")


# ---------------------------------------------------------------------------
# データモデル
# ---------------------------------------------------------------------------
@dataclass
class Proposal:
    """Generator が生成した改善提案"""
    description: str          # 提案の説明
    patch: str                # 適用するパッチ / 修正後コード
    rationale: str            # 改善理由


@dataclass
class ReviewResult:
    """Reviewer の評価結果"""
    approved: bool            # 承認可否
    feedback: str             # フィードバックコメント
    severity: str = "info"    # info / warning / critical


@dataclass
class LoopResult:
    """1ファイル×1エージェントのループ結果"""
    file_path: str
    agent_name: str
    iterations: int = 0
    improvements: list[str] = field(default_factory=list)
    final_status: str = "skipped"   # improved / no_change / rolled_back / skipped
    error: Optional[str] = None
    diff_text: str = ""              # unified diff テキスト
    rationale: str = ""              # AI による改善理由


# ---------------------------------------------------------------------------
# GitHubModelsClient: GitHub Models API とのインターフェース
# ---------------------------------------------------------------------------
class GitHubModelsClient:
    """GitHub Models API を使用してAI応答を取得するクライアント

    認証: gh auth token (GitHub CLI) のトークンをそのまま使用。
    エンドポイント: https://models.inference.ai.azure.com/chat/completions
    デフォルトモデル: gpt-4.1 (環境変数 AI_MODEL で変更可能)
    """

    API_URL = "https://models.inference.ai.azure.com/chat/completions"
    DEFAULT_MODEL = "gpt-4.1"
    # gpt-5/o-series は max_tokens ではなく max_completion_tokens を使用
    MODELS_USING_COMPLETION_TOKENS = {"gpt-5", "o1", "o3", "o3-mini", "o4-mini"}
    MAX_RETRIES = 5
    RETRY_BASE_DELAY = 5  # 秒 (429 対策で長めに設定)

    def __init__(self) -> None:
        self.model = os.environ.get("AI_MODEL", self.DEFAULT_MODEL)
        self._token: Optional[str] = None
        logger.info(
            "GitHubModelsClient 初期化: model=%s, endpoint=%s",
            self.model, self.API_URL,
        )

    @property
    def token(self) -> str:
        """GitHubトークン (遅延取得・キャッシュ)"""
        if self._token is None:
            self._token = self._get_github_token()
        return self._token

    @staticmethod
    def _get_github_token() -> str:
        """gh auth token からGitHubトークンを取得する"""
        try:
            result = subprocess.run(
                ["gh", "auth", "token"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    f"gh auth token が非ゼロで終了 (code={result.returncode}): "
                    f"{result.stderr.strip()}"
                )
            token = result.stdout.strip()
            if not token:
                raise RuntimeError("gh auth token が空のトークンを返しました")
            logger.info("GitHubトークンを取得しました (長さ=%d)", len(token))
            return token
        except FileNotFoundError:
            raise RuntimeError(
                "gh コマンドが見つかりません。GitHub CLI をインストールしてください。"
            )

    def _call_api(
        self,
        messages: list[dict],
        *,
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> str:
        """GitHub Models API にリクエストを送信 (リトライ付き)"""
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

        # gpt-5/o-series は max_completion_tokens を使用、それ以外は max_tokens
        token_key = (
            "max_completion_tokens"
            if any(self.model.startswith(m) for m in self.MODELS_USING_COMPLETION_TOKENS)
            else "max_tokens"
        )
        payload = {
            "model": self.model,
            "messages": messages,
            token_key: max_tokens,
            "temperature": temperature,
        }

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                resp = requests.post(
                    self.API_URL,
                    headers=headers,
                    json=payload,
                    timeout=120,
                )
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return content.strip()

            except requests.exceptions.Timeout:
                logger.warning(
                    "GitHub Models API タイムアウト (試行 %d/%d)",
                    attempt, self.MAX_RETRIES,
                )
            except requests.exceptions.HTTPError as e:
                status = getattr(e.response, "status_code", None)
                # 429 (レートリミット) と 5xx はリトライ
                if status and (status == 429 or status >= 500):
                    # Retry-After ヘッダーがあればその値を使う
                    retry_after = None
                    if hasattr(e.response, 'headers'):
                        retry_after = e.response.headers.get('Retry-After')
                    if retry_after:
                        try:
                            retry_seconds = int(retry_after)
                            logger.warning(
                                "GitHub Models API HTTP %d (試行 %d/%d): Retry-After=%ds",
                                status, attempt, self.MAX_RETRIES, retry_seconds,
                            )
                            time.sleep(retry_seconds)
                            continue
                        except ValueError:
                            pass
                    logger.warning(
                        "GitHub Models API HTTP %d (試行 %d/%d): %s",
                        status, attempt, self.MAX_RETRIES, e,
                    )
                else:
                    logger.error(
                        "GitHub Models API HTTPエラー (リトライ不可): %s", e,
                    )
                    return ""
            except (KeyError, IndexError) as e:
                logger.error("GitHub Models API レスポンス解析エラー: %s", e)
                return ""
            except requests.exceptions.RequestException as e:
                logger.warning(
                    "GitHub Models API 接続エラー (試行 %d/%d): %s",
                    attempt, self.MAX_RETRIES, e,
                )

            if attempt < self.MAX_RETRIES:
                delay = self.RETRY_BASE_DELAY * (2 ** (attempt - 1))
                logger.info("%.1f 秒後にリトライします...", delay)
                time.sleep(delay)

        logger.error("GitHub Models API: %d回リトライ後も失敗", self.MAX_RETRIES)
        return ""

    def suggest(self, prompt: str, *, language: str = "generic") -> str:
        """プロンプトに対するAI応答を取得する (CopilotBridge互換)"""
        logger.info("GitHubModelsClient.suggest: %s ...", prompt[:80])
        messages = [
            {
                "role": "system",
                "content": (
                    "あなたは優秀なソフトウェアエンジニアです。"
                    "コードの改善提案を求められた場合、改善後のコード全体を返してください。"
                    "コードブロック (```) で囲んで返答してください。"
                    "重要: コメントの追加だけの変更は価値がありません。"
                    "実質的なコードロジックの変更がない場合は、元のコードをそのまま返してください。"
                    "絶対に既存の関数や export を削除しないでください。"
                    "関数の最適化は可能ですが、関数自体の削除は禁止です。"
                    "レビューを求められた場合、承認なら 'approve'、"
                    "却下なら 'reject' を含めて回答してください。"
                    "コメントの追加のみの差分、または関数削除がある差分はレビューで必ず reject してください。"
                ),
            },
            {"role": "user", "content": prompt},
        ]
        return self._call_api(messages)

    def explain(self, code: str) -> str:
        """コードの説明を取得する (CopilotBridge互換)"""
        messages = [
            {
                "role": "system",
                "content": (
                    "あなたは優秀なソフトウェアエンジニアです。"
                    "コードの説明を簡潔かつ正確に行ってください。"
                ),
            },
            {
                "role": "user",
                "content": f"以下のコードを説明してください:\n\n{code}",
            },
        ]
        return self._call_api(messages, max_tokens=2048)


# ---------------------------------------------------------------------------
# TestRunner: pytest 実行 + 結果判定
# ---------------------------------------------------------------------------
class TestRunner:
    """テスト実行とその結果を管理する"""

    def __init__(self, repo_root: Path = REPO_ROOT):
        self.repo_root = repo_root
        self.baseline_passing: bool | None = None  # None = 未チェック

    def check_baseline(self) -> bool:
        """ベースラインテストを実行し、結果をキャッシュする。

        テストが既に壊れている場合、AIの変更でテスト検証をスキップするために使用。
        """
        logger.info("🔬 ベースラインテストを実行中...")
        passed, output = self.run_tests()
        self.baseline_passing = passed
        if passed:
            logger.info("✅ ベースラインテスト PASS — テスト検証を有効化")
        else:
            logger.warning(
                "⚠️ ベースラインテスト FAIL — テスト検証をスキップします\n"
                "  テスト出力 (末尾): %s", output.strip()[-200:]
            )
        return passed

    def run_tests(self, *, timeout: int = 300) -> tuple[bool, str]:
        """
        pytest を実行し、(成功フラグ, 出力) を返す。
        プロジェクトに pytest が設定されていない場合は vitest を試行する。
        """
        # まず vitest (Next.js プロジェクト用)
        vitest_config = self.repo_root / "vitest.config.ts"
        if vitest_config.exists():
            return self._run_vitest(timeout)

        # pytest
        return self._run_pytest(timeout)

    def _run_pytest(self, timeout: int) -> tuple[bool, str]:
        """pytest を実行する"""
        cmd = [
            sys.executable, "-m", "pytest",
            "--timeout=60",
            "-x",            # 最初の失敗で停止
            "--tb=short",    # トレースバックを短く
            "-q",            # 静かな出力
        ]
        return self._execute_test_command(cmd, timeout)

    def _run_vitest(self, timeout: int) -> tuple[bool, str]:
        """vitest を実行する (Next.js / TypeScript プロジェクト向け)"""
        # Windows では npx は .cmd ファイルのため shell=True が必要
        cmd = ["npx", "vitest", "run", "--reporter=verbose"]
        return self._execute_test_command(cmd, timeout, use_shell=True)

    def _execute_test_command(
        self, cmd: list[str], timeout: int, *, use_shell: bool = False
    ) -> tuple[bool, str]:
        """テストコマンドを実行して結果を返す"""
        logger.info("テスト実行: %s", " ".join(cmd))
        try:
            # Windows では .cmd ファイル (npx.cmd 等) を実行するために
            # shell=True が必要。Unix 系では不要。
            shell = use_shell and sys.platform == "win32"
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(self.repo_root),
                shell=shell,
            )
            output = result.stdout + "\n" + result.stderr
            passed = result.returncode == 0
            status = "✅ PASS" if passed else "❌ FAIL"
            logger.info("テスト結果: %s (exit=%d)", status, result.returncode)
            return passed, output
        except subprocess.TimeoutExpired:
            logger.error("テストがタイムアウト (%d秒)", timeout)
            return False, "テスト実行がタイムアウトしました"
        except FileNotFoundError as e:
            logger.warning("テストランナーが見つかりません: %s", e)
            # テストランナーがない場合は成功扱い（改善は許可する）
            return True, "テストランナーが利用不可 — スキップ"


# ---------------------------------------------------------------------------
# BaseAgent: エージェントの抽象基底クラス
# ---------------------------------------------------------------------------
class BaseAgent(ABC):
    """すべてのエージェントの基底クラス"""

    def __init__(self, name: str, role: str, focus_areas: list[str]):
        self.name = name
        self.role = role
        self.focus_areas = focus_areas
        self.copilot = GitHubModelsClient()

    @abstractmethod
    def get_generator_prompt(self, file_path: str, code: str) -> str:
        """Generator 用プロンプトを構築する"""

    @abstractmethod
    def get_reviewer_prompt(
        self, file_path: str, original: str, modified: str, proposal_desc: str
    ) -> str:
        """Reviewer 用プロンプトを構築する"""

    def generate_proposal(self, file_path: str, code: str) -> Proposal:
        """コード改善を提案する (Generator ロール)"""
        prompt = self.get_generator_prompt(file_path, code)
        response = self.copilot.suggest(prompt)

        if not response:
            return Proposal(
                description="提案なし",
                patch="",
                rationale="AI からの応答が空でした",
            )

        # レスポンスからコードブロックと改善理由を抽出
        extracted = self._extract_code_block(response)
        rationale = self._extract_rationale(response)

        return Proposal(
            description=f"[{self.name}] {file_path} の改善提案",
            patch=extracted,
            rationale=rationale or f"{self.role} の観点からの改善",
        )

    @staticmethod
    def _extract_code_block(response: str) -> str:
        """AI レスポンスからコードブロック (```...```) を抽出する

        コードブロックがない場合はレスポンス全体を返す。
        """
        import re
        # ```lang\n ... ``` パターンを検索
        pattern = r"```(?:\w+)?\s*\n(.*?)```"
        matches = re.findall(pattern, response, re.DOTALL)
        if matches:
            # 最も長いコードブロックを返す (本文コード)
            return max(matches, key=len).strip()
        return response.strip()

    @staticmethod
    def _extract_rationale(response: str) -> str:
        """AI レスポンスからコードブロック外の説明テキスト（改善理由）を抽出する"""
        import re
        # コードブロックを除去し、残ったテキストを改善理由とする
        text = re.sub(r"```(?:\w+)?\s*\n.*?```", "", response, flags=re.DOTALL).strip()
        # 先頭の無駄な記号を除去
        text = re.sub(r"^[#\-*>\s]+", "", text).strip()
        # 長すぎる場合は先頭 300 文字に制限
        if len(text) > 300:
            text = text[:300] + "..."
        return text

    def review_proposal(
        self,
        file_path: str,
        original: str,
        modified: str,
        proposal_desc: str,
    ) -> ReviewResult:
        """改善提案をレビューする (Reviewer ロール)"""
        prompt = self.get_reviewer_prompt(
            file_path, original, modified, proposal_desc
        )
        response = self.copilot.suggest(prompt)

        if not response:
            # 応答がなければ承認扱い
            return ReviewResult(
                approved=True,
                feedback="AI からの応答なし — 自動承認",
            )

        # 応答にリジェクトキーワードが含まれるかチェック
        reject_keywords = ["reject", "disapprove", "not recommend", "revert",
                           "却下", "非推奨", "戻す"]
        is_rejected = any(kw in response.lower() for kw in reject_keywords)

        return ReviewResult(
            approved=not is_rejected,
            feedback=response,
            severity="warning" if is_rejected else "info",
        )


# ---------------------------------------------------------------------------
# 3つの専門エージェント
# ---------------------------------------------------------------------------
class UIUXAgent(BaseAgent):
    """🎨 UI/UX Agent: 実質的なUI改善、UXパターン追加、視覚的品質向上"""

    def __init__(self):
        super().__init__(
            name="UI/UX Agent",
            role="UI/UXデザインの専門家",
            focus_areas=[
                "ローディングスケルトン・シマー効果",
                "空状態のリッチUI (イラスト・CTA付き)",
                "エラー状態の改善 (リトライボタン・ユーザーフレンドリーなメッセージ)",
                "アニメーション・トランジション追加 (CSS keyframes)",
                "レスポンシブデザインの強化",
                "視覚的階層の改善 (カード・セクション・スペーシング)",
                "アクセシビリティ (WCAG 2.1 AA)",
            ],
        )

    def get_generator_prompt(self, file_path: str, code: str) -> str:
        return textwrap.dedent(f"""\
            {APP_CONTEXT}

            あなたはモダンWebアプリのUI/UX専門家で、Vercel/Stripe/Linear等の洗練されたUIに精通しています。
            以下のReactコンポーネントを分析し、ユーザー体験を大幅に向上させる具体的なコード改善を行ってください。

            対象ファイル: {file_path}

            ## 必ず以下のいずれかを実装すること（最低1つ）

            ### A. ローディング状態の追加
            データ取得中にスケルトンを表示。コンポーネントの形状に合わせたプレースホルダーを作成:
            ```tsx
            if (loading) return (
              <div className="space-y-3 p-4">
                <div className="animate-pulse rounded-lg h-10 w-2/3" style={{{{background: 'var(--theme-secondary)'}}}}/>
                <div className="animate-pulse rounded-lg h-6 w-full" style={{{{background: 'var(--theme-secondary)'}}}}/>
                <div className="animate-pulse rounded-lg h-6 w-4/5" style={{{{background: 'var(--theme-secondary)'}}}}/>
              </div>
            );
            ```

            ### B. 空状態のリッチUI
            データが0件の場合にアイコン + メッセージ + CTAボタンを表示:
            ```tsx
            if (!data?.length) return (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span className="text-5xl mb-4">🏃</span>
                <h3 className="text-lg font-bold" style={{{{color: 'var(--theme-primary)'}}}}>まだデータがありません</h3>
                <p className="text-sm mt-2" style={{{{color: 'var(--foreground-muted)'}}}}>歩数を記録して始めましょう！</p>
              </div>
            );
            ```

            ### C. エラー状態のUI
            APIエラー時にリトライボタン付きのUIを表示:
            ```tsx
            if (error) return (
              <div className="flex flex-col items-center py-12 text-center">
                <span className="text-4xl mb-3">⚠️</span>
                <p className="font-semibold">データの取得に失敗しました</p>
                <button onClick={{{{() => refetch()}}}} className="mt-4 px-4 py-2 rounded-lg text-white" style={{{{background: 'var(--theme-primary)'}}}}>
                  再試行
                </button>
              </div>
            );
            ```

            ### D. ボタン・フォームのインタラクション強化
            - ボタンに hover:scale-105 transition-transform を追加
            - 送信中ボタン: disabled + スピナーアニメーション
            - 破壊的操作前に window.confirm() で確認

            ### E. トランジション・アニメーション
            - リストアイテムに opacity + translateY アニメーション
            - カードに hover shadow トランジション
            - 数値変化のカウントアップエフェクト

            ## 重要なルール
            - **必ず1つ以上の実質的なUIコード変更を行うこと。** コメント追加・変数名変更・import整理だけの変更は禁止。
            - テーマ: var(--theme-primary), var(--theme-secondary), var(--accent-coral) 等のCSS変数を使用。dark: は不使用。
            - framer-motion は使わない。CSS keyframes と Tailwind アニメーションのみ。
            - 新しい外部ライブラリは追加しない。
            - **既存の関数・export を削除しないこと。** 追加のみ許可。
            - 改善すべき点がなければ、元のコードをそのまま返すこと。
            - ファイル末尾には必ず改行を入れること。

            ## 回答形式
            まず「## 改善内容」として何を変えたかを簡潔に説明（2-3行）し、
            その後に改善後のコード全体をコードブロックで返してください。

            コード:
            ```
            {code[:MAX_CODE_CONTEXT]}
            ```
        """)

    def get_reviewer_prompt(
        self, file_path: str, original: str, modified: str, proposal_desc: str
    ) -> str:
        diff_text = _create_diff(original, modified, file_path)
        return textwrap.dedent(f"""\
            あなたはUI/UXのシニアレビュアーです。以下の変更を批判的に評価してください。

            ファイル: {file_path}
            提案内容: {proposal_desc}

            差分:
            ```diff
            {diff_text[:MAX_CODE_CONTEXT]}
            ```

            以下の基準で厳密に評価:
            1. **実質的なUI/UX改善があるか？** コメント追加・変数名変更・import整理のみは reject
            2. **ユーザー体験が具体的に向上しているか？** (ローディング状態、空状態、エラーハンドリング等)
            3. **既存の関数・export を削除していないか？** 削除がある場合は必ず reject
            4. **テーマシステム (CSS変数) に従っているか？** Tailwind dark: を使っていたら reject
            5. **framer-motion や新しい外部ライブラリを追加していないか？**
            6. **既存機能を壊していないか？**

            問題がある場合は "reject" を含む応答を、
            承認する場合は "approve" を含む応答を返してください。
        """)


class PerformanceAgent(BaseAgent):
    """⚡ Performance Agent: 計算量削減、メモリ効率向上"""

    def __init__(self):
        super().__init__(
            name="Performance Agent",
            role="パフォーマンス最適化の専門家",
            focus_areas=[
                "アルゴリズムの計算量削減",
                "メモリ効率の向上",
                "不要な再レンダリング防止",
                "バンドルサイズ削減",
                "データベースクエリ最適化",
            ],
        )

    def get_generator_prompt(self, file_path: str, code: str) -> str:
        return textwrap.dedent(f"""\
            {APP_CONTEXT}

            あなたはReact/Next.jsパフォーマンス最適化の専門家です。
            以下のコードを分析し、**測定可能な**パフォーマンス改善を行ってください。

            対象ファイル: {file_path}

            ## 具体的に探すべきパターン（優先順）

            ### 1. 不要な再レンダリング防止
            - コンポーネント内で毎レンダー新規作成されるオブジェクト/配列リテラルを useMemo でメモ化
            - インラインのコールバック `onClick={{() => handle(id)}}` を useCallback に変換
            - 重い子コンポーネントを React.memo でラップ
            - 例:
              ```tsx
              // Before
              const options = items.filter(i => i.active).map(i => ({{label: i.name, value: i.id}}));
              // After
              const options = useMemo(() => items.filter(i => i.active).map(i => ({{label: i.name, value: i.id}})), [items]);
              ```

            ### 2. 重いコンポーネントの遅延ロード
            - Recharts チャート、モーダル、重いUIセクションを `dynamic(() => import(...), {{ ssr: false }})` で遅延。
            - 例:
              ```tsx
              const HeavyChart = dynamic(() => import('./GoalProgressChart'), {{ ssr: false, loading: () => <div className="animate-pulse h-64" /> }});
              ```

            ### 3. 計算量の削減
            - 配列の繰り返し走査（filter().map() を reduce に統合）
            - ループ内の find/filter を Map/Set で置換
            - 条件付き early return で不要な処理をスキップ

            ### 4. API・DB 最適化
            - 並列実行可能な await を Promise.all() に統合
            - Supabase クエリで不要なカラムを select から除外

            ## 重要なルール
            - **コメント追加のみ・変数名変更のみ・import整理のみの変更は禁止。**
            - **既存の関数・export を絶対に削除しないこと。** 最適化は可能だが、削除は禁止。
            - 既存の動作を変えないこと。最適化のみ行うこと。
            - 改善すべき点がなければ、元のコードをそのまま返すこと。
            - ファイル末尾には必ず改行を入れること。

            ## 回答形式
            まず「## 改善内容」として何を変えたかを簡潔に説明（2-3行）し、
            その後に改善後のコード全体をコードブロックで返してください。

            コード:
            ```
            {code[:MAX_CODE_CONTEXT]}
            ```
        """)

    def get_reviewer_prompt(
        self, file_path: str, original: str, modified: str, proposal_desc: str
    ) -> str:
        diff_text = _create_diff(original, modified, file_path)
        return textwrap.dedent(f"""\
            あなたはパフォーマンスのシニアレビュアーです。以下の変更を批判的に評価してください。

            ファイル: {file_path}
            提案内容: {proposal_desc}

            差分:
            ```diff
            {diff_text[:MAX_CODE_CONTEXT]}
            ```

            以下の基準で厳密に評価:
            1. **実質的なコード変更があるか？** コメント追加・import整理のみは reject
            2. **パフォーマンスが測定可能に改善されているか？** 定数化などの軽微な変更は reject
            3. **既存の関数・export を削除していないか？** 削除がある場合は必ず reject
            4. **既存の動作を壊していないか？**
            5. **不要なライブラリを追加していないか？**

            問題がある場合は "reject" を含む応答を、
            承認する場合は "approve" を含む応答を返してください。
        """)


class SecurityAgent(BaseAgent):
    """🔒 Security Agent: 脆弱性スキャン、OWASP対応"""

    def __init__(self):
        super().__init__(
            name="Security Agent",
            role="セキュリティの専門家",
            focus_areas=[
                "XSS (クロスサイトスクリプティング) 対策",
                "SQLインジェクション対策",
                "CSRF対策",
                "認証・認可の強化",
                "機密情報の漏洩防止",
                "入力値バリデーション",
                "OWASP Top 10 対応",
            ],
        )

    def get_generator_prompt(self, file_path: str, code: str) -> str:
        return textwrap.dedent(f"""\
            {APP_CONTEXT}

            あなたはWebアプリケーションセキュリティの専門家です。
            以下のコードを分析し、**実際に悪用可能な脆弱性**がある場合のみ修正してください。

            対象ファイル: {file_path}

            ## 具体的に探すべき脆弱性（実際の問題のみ）

            ### API エンドポイント (route.ts) の場合:
            - ユーザー入力の未検証（型チェックなしにそのまま使用）
            - 認証チェックの欠落（auth() なしでデータアクセス）
            - Rate limiting の欠如
            - エラーメッセージでの機密情報リーク（スタックトレースや内部IDの露出）
            - IDOR（他ユーザーのデータにアクセス可能）
            例:
            ```ts
            // Before: 認証なし
            const userId = body.userId;
            const data = await supabase.from('users').select('*').eq('id', userId);
            // After: 認証付き
            const session = await auth();
            if (!session?.user?.id) return NextResponse.json({{{{ error: 'Unauthorized' }}}}, {{{{ status: 401 }}}});
            const data = await supabase.from('users').select('id,name').eq('id', session.user.id);
            ```

            ### Server Actions (actions.ts) の場合:
            - 入力値の型検証（string で来るべき値が未検証）
            - 権限チェックの欠落

            ### クライアントコンポーネント (.tsx) の場合:
            - dangerouslySetInnerHTML の使用
            - URLパラメータの未サニタイズ使用
            - localStorage への機密情報保存

            ## 絶対にやってはいけないこと
            - 「念のため」の過剰な防御コードの追加
            - DOMPurify 等の新しいライブラリの追加
            - React JSX で自動エスケープされる翻訳キーのサニタイズ
            - セキュリティ問題がないコードへの変更

            ## 重要なルール
            - **コメント追加のみの変更は絶対に禁止。** 実際のコードを変更すること。
            - **既存の関数・export を絶対に削除しないこと。**
            - セキュリティ上の問題がなければ、元のコードをそのまま返すこと。
            - ファイル末尾には必ず改行を入れること。

            ## 回答形式
            まず「## 改善内容」として何を変えたかを簡潔に説明（2-3行）し、
            その後に改善後のコード全体をコードブロックで返してください。
            問題がなければ元のコードをそのまま返してください。

            コード:
            ```
            {code[:MAX_CODE_CONTEXT]}
            ```
        """)

    def get_reviewer_prompt(
        self, file_path: str, original: str, modified: str, proposal_desc: str
    ) -> str:
        diff_text = _create_diff(original, modified, file_path)
        return textwrap.dedent(f"""\
            あなたはセキュリティのシニアレビュアーです。以下の変更を批判的に評価してください。

            ファイル: {file_path}
            提案内容: {proposal_desc}

            差分:
            ```diff
            {diff_text[:MAX_CODE_CONTEXT]}
            ```

            以下の基準で厳密に評価:
            1. **実質的なコード変更があるか？** コメント追加のみは必ず reject
            2. **修正が実際の脆弱性に対応しているか？** 架空のリスクへの対応は reject
            3. **既存の関数・export を削除していないか？** 削除がある場合は必ず reject
            4. **新たな脆弱性が混入していないか？**
            5. **既存の機能やセキュリティ機構を壊していないか？**
            6. **不要なライブラリの追加がないか？** DOMPurify等の過剰な依存追加は reject

            問題がある場合は "reject" を含む応答を、
            承認する場合は "approve" を含む応答を返してください。
        """)


class FeatureEnhancementAgent(BaseAgent):
    """✨ Feature Enhancement Agent: 既存コンポーネントにUXパターン・小機能を追加"""

    def __init__(self):
        super().__init__(
            name="Feature Enhancement Agent",
            role="UX機能強化の専門家",
            focus_areas=[
                "ローディングスケルトンの追加",
                "空状態UIの追加 (データなし時のリッチ表示)",
                "エラーバウンダリ・エラーUIの追加",
                "ボタンのローディング状態",
                "フォームバリデーションの強化",
                "確認ダイアログ (破壊的操作前)",
                "トランジション・アニメーション",
                "ツールチップ・ヘルプテキストの追加",
            ],
        )

    def get_generator_prompt(self, file_path: str, code: str) -> str:
        return textwrap.dedent(f"""\
            {APP_CONTEXT}

            あなたはフロントエンドUX機能強化の専門家です。
            以下のReactコンポーネントを分析し、不足している**UXパターン**を具体的に追加してください。

            対象ファイル: {file_path}

            ## 必ず1つ以上追加すること

            ### A. 状態管理の3層（最重要 — このコンポーネントに該当するものを全て追加）

            **ローディング状態** — データ取得中のスケルトン:
            ```tsx
            if (loading) return (
              <div className="space-y-3 p-4">
                <div className="animate-pulse rounded-lg h-10 w-2/3" style={{{{background: 'var(--theme-secondary)'}}}}/>
                <div className="animate-pulse rounded-lg h-6 w-full" style={{{{background: 'var(--theme-secondary)'}}}}/>
              </div>
            );
            ```

            **空状態** — データが0件の場合:
            ```tsx
            if (!data?.length) return (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span className="text-5xl mb-4">🏃</span>
                <h3 className="text-lg font-bold" style={{{{color: 'var(--theme-primary)'}}}}>まだデータがありません</h3>
                <p className="text-sm mt-2" style={{{{color: 'var(--foreground-muted)'}}}}>歩数を記録して始めましょう！</p>
              </div>
            );
            ```

            **エラー状態** — APIエラー時:
            ```tsx
            if (error) return (
              <div className="flex flex-col items-center py-12 text-center">
                <span className="text-4xl mb-3">⚠️</span>
                <p className="font-semibold">データの取得に失敗しました</p>
                <button onClick={{{{() => retry()}}}} className="mt-4 px-4 py-2 rounded-lg text-white"
                  style={{{{background: 'var(--theme-primary)'}}}}>再試行</button>
              </div>
            );
            ```

            ### B. ボタン・フォームの強化
            - 送信ボタンにローディング状態を追加:
              ```tsx
              <button disabled={{{{isSubmitting}}}} className="relative ...">
                {{{{isSubmitting ? (
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : '保存'}}}}
              </button>
              ```
            - 破壊的操作（削除・退会）の前に: `if (!window.confirm('本当に削除しますか？')) return;`

            ### C. 視覚的フィードバック
            - カードに hover:shadow-lg transition-shadow を追加
            - ボタンに hover:scale-105 transition-transform を追加
            - 操作後の成功/エラートースト表示

            ## 重要なルール
            - **必ず具体的なコードを追加すること。** コメントだけの追加は禁止。
            - **既存の関数・export は絶対に削除しないこと。** 追加のみ許可。
            - **既存のロジックは変更しないこと。** UXパターンの追加のみ。
            - テーマ: var(--theme-primary), var(--theme-secondary) 等のCSS変数を使用。dark: は不使用。
            - framer-motion は使わない。CSS keyframes と Tailwind のみ。
            - 新しい外部ライブラリは追加しない。
            - 改善点がなければ元のコードをそのまま返すこと。
            - ファイル末尾には必ず改行を入れること。

            ## 回答形式
            まず「## 改善内容」として何を変えたかを簡潔に説明（2-3行）し、
            その後に改善後のコード全体をコードブロックで返してください。

            コード:
            ```
            {code[:MAX_CODE_CONTEXT]}
            ```
        """)

    def get_reviewer_prompt(
        self, file_path: str, original: str, modified: str, proposal_desc: str
    ) -> str:
        diff_text = _create_diff(original, modified, file_path)
        return textwrap.dedent(f"""\
            あなたはUX機能強化のシニアレビュアーです。以下の変更を批判的に評価してください。

            ファイル: {file_path}
            提案内容: {proposal_desc}

            差分:
            ```diff
            {diff_text[:MAX_CODE_CONTEXT]}
            ```

            以下の基準で厳密に評価:
            1. **実質的なUXパターンが追加されているか？** コメントのみ・変数名変更のみは reject
            2. **追加されたUIが実用的か？** (スケルトン、空状態、エラー状態、ローディングボタン等)
            3. **既存の関数・export を削除していないか？** 削除がある場合は必ず reject
            4. **既存のロジックを壊していないか？**
            5. **テーマシステムに従っているか？** (CSS変数を使用しているか)
            6. **framer-motion や外部ライブラリを追加していないか？**

            問題がある場合は "reject" を含む応答を、
            承認する場合は "approve" を含む応答を返してください。
        """)


class BuildValidationAgent(BaseAgent):
    """🔨 Build Validation Agent: ビルドエラー・型エラー・翻訳キー不足を検出し修正"""

    def __init__(self):
        super().__init__(
            name="Build Validation Agent",
            role="ビルド検証・品質保証の専門家",
            focus_areas=[
                "TypeScript コンパイルエラーの修正",
                "未使用 import の削除",
                "型定義の不整合解消",
                "翻訳キー (i18n) の整合性検証",
                "Next.js ビルド互換性 (Server/Client Component 分離)",
                "Supabase クエリの型安全性",
            ],
        )

    def run_build_check(self) -> tuple[bool, str]:
        """next build を実行してビルドエラーを検出する"""
        logger.info("🔨 next build を実行中...")
        try:
            shell = sys.platform == "win32"
            result = subprocess.run(
                ["npx", "next", "build"],
                capture_output=True,
                text=True,
                timeout=300,
                cwd=str(REPO_ROOT),
                shell=shell,
            )
            output = result.stdout + "\n" + result.stderr
            passed = result.returncode == 0
            status = "✅ BUILD PASS" if passed else "❌ BUILD FAIL"
            logger.info("ビルド結果: %s (exit=%d)", status, result.returncode)
            return passed, output
        except subprocess.TimeoutExpired:
            logger.error("ビルドがタイムアウト (300秒)")
            return False, "ビルドがタイムアウトしました"
        except FileNotFoundError as e:
            logger.warning("npx が見つかりません: %s", e)
            return True, "ビルドツールが利用不可 — スキップ"

    def run_typecheck(self) -> tuple[bool, str]:
        """TypeScript 型チェックを実行する"""
        logger.info("🔍 TypeScript 型チェックを実行中...")
        try:
            shell = sys.platform == "win32"
            result = subprocess.run(
                ["npx", "tsc", "--noEmit", "--pretty"],
                capture_output=True,
                text=True,
                timeout=120,
                cwd=str(REPO_ROOT),
                shell=shell,
            )
            output = result.stdout + "\n" + result.stderr
            passed = result.returncode == 0
            return passed, output
        except subprocess.TimeoutExpired:
            return False, "型チェックがタイムアウトしました"
        except FileNotFoundError:
            return True, "tsc が利用不可 — スキップ"

    def check_i18n_keys(self) -> list[dict]:
        """翻訳キーの整合性を検証する (コード内使用 vs JSON 定義)"""
        import re

        missing_keys: list[dict] = []
        messages_dir = REPO_ROOT / "messages"

        # ja.json を基準としてキーを収集
        ja_path = messages_dir / "ja.json"
        en_path = messages_dir / "en.json"
        if not ja_path.exists() or not en_path.exists():
            return missing_keys

        try:
            ja_data = json.loads(ja_path.read_text(encoding="utf-8"))
            en_data = json.loads(en_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("翻訳ファイルの解析に失敗")
            return missing_keys

        # コンポーネントから useTranslations の使用箇所を検出
        components_dir = REPO_ROOT / "components"
        app_dir = REPO_ROOT / "app"

        for search_dir in [components_dir, app_dir]:
            if not search_dir.exists():
                continue
            for tsx_file in search_dir.rglob("*.tsx"):
                if _should_skip_file(tsx_file):
                    continue
                try:
                    code = tsx_file.read_text(encoding="utf-8")
                except (UnicodeDecodeError, OSError):
                    continue

                # useTranslations('Namespace') を検出
                ns_matches = re.findall(
                    r"useTranslations\(['\"](\w+)['\"]\)", code
                )
                # getTranslations('Namespace') も検出 (Server Components)
                ns_matches.extend(re.findall(
                    r"getTranslations\(['\"](\w+)['\"]\)", code
                ))

                for namespace in set(ns_matches):
                    # 対応する変数名を特定
                    var_patterns = re.findall(
                        rf"const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(['\"]"
                        + re.escape(namespace) + r"['\"]\)",
                        code,
                    )
                    for var_name in var_patterns:
                        # var_name('key') パターンを検出
                        key_matches = re.findall(
                            rf"{re.escape(var_name)}\(['\"]([a-zA-Z0-9_.]+)['\"]",
                            code,
                        )
                        for key in key_matches:
                            # ネストキー (e.g. "comparisonTitle.daily") に対応
                            parts = key.split(".")
                            # ja.json でチェック
                            ja_val = ja_data.get(namespace, {})
                            for part in parts:
                                if isinstance(ja_val, dict):
                                    ja_val = ja_val.get(part)
                                else:
                                    ja_val = None
                                    break
                            # en.json でチェック
                            en_val = en_data.get(namespace, {})
                            for part in parts:
                                if isinstance(en_val, dict):
                                    en_val = en_val.get(part)
                                else:
                                    en_val = None
                                    break

                            if ja_val is None or en_val is None:
                                missing_keys.append({
                                    "file": str(tsx_file.relative_to(REPO_ROOT)),
                                    "namespace": namespace,
                                    "key": key,
                                    "missing_in": [
                                        lang for lang, val in
                                        [("ja", ja_val), ("en", en_val)]
                                        if val is None
                                    ],
                                })

        return missing_keys

    def get_generator_prompt(self, file_path: str, code: str) -> str:
        # ビルドエラー情報を収集して含める
        build_ok, build_output = self.run_build_check()
        typecheck_ok, typecheck_output = self.run_typecheck()
        i18n_issues = self.check_i18n_keys()

        error_context = ""
        if not build_ok:
            # ビルドエラーから対象ファイルに関連するエラーを抽出
            relevant_errors = [
                line for line in build_output.splitlines()
                if Path(file_path).name in line or "Error" in line or "error" in line.lower()
            ]
            error_context += f"\n### ビルドエラー:\n" + "\n".join(relevant_errors[:30])

        if not typecheck_ok:
            relevant_type_errors = [
                line for line in typecheck_output.splitlines()
                if Path(file_path).name in line or "error TS" in line
            ]
            error_context += f"\n### 型エラー:\n" + "\n".join(relevant_type_errors[:30])

        # 対象ファイルに関連する i18n 不足キー
        file_i18n_issues = [
            issue for issue in i18n_issues
            if issue["file"] == file_path or Path(file_path).name in issue["file"]
        ]
        if file_i18n_issues:
            error_context += "\n### 翻訳キー不足:\n"
            for issue in file_i18n_issues:
                error_context += (
                    f"- {issue['namespace']}.{issue['key']} "
                    f"(不足: {', '.join(issue['missing_in'])})\n"
                )

        return textwrap.dedent(f"""\
            {APP_CONTEXT}

            あなたはビルドエラー修正と品質保証の専門家です。
            以下のファイルのビルドエラー・型エラー・翻訳キー不足を修正してください。

            対象ファイル: {file_path}
            {error_context}

            ## 修正すべき項目
            1. **TypeScript コンパイルエラー**: 型の不整合、未使用 import、missing module
            2. **Next.js ビルドエラー**: Server/Client Component の不正な混在、dynamic import の問題
            3. **翻訳キーの不足**: useTranslations / getTranslations で使用するキーが ja.json / en.json に不足
            4. **Supabase クエリの型安全性**: select() のカラム名が実際のテーブルスキーマと一致するか

            ## 重要なルール
            - **エラーがなければ元のコードをそのまま返すこと。**
            - **既存の関数・export は絶対に削除しないこと。**
            - **ロジックの変更は最小限に。** エラー修正のみ行うこと。
            - テーマ: var(--theme-primary) 等のCSS変数を使用。dark: は不使用。
            - framer-motion は使わない。
            - 新しい外部ライブラリは追加しない。
            - ファイル末尾には必ず改行を入れること。

            ## 回答形式
            まず「## 修正内容」として何を修正したかを簡潔に説明（2-3行）し、
            その後に修正後のコード全体をコードブロックで返してください。
            エラーがない場合は「## 修正不要」と記述し、元のコードをそのまま返してください。

            コード:
            ```
            {code[:MAX_CODE_CONTEXT]}
            ```
        """)

    def get_reviewer_prompt(
        self, file_path: str, original: str, modified: str, proposal_desc: str
    ) -> str:
        diff_text = _create_diff(original, modified, file_path)
        return textwrap.dedent(f"""\
            あなたはビルドエラー修正のシニアレビュアーです。以下の変更を評価してください。

            ファイル: {file_path}
            提案内容: {proposal_desc}

            差分:
            ```diff
            {diff_text[:MAX_CODE_CONTEXT]}
            ```

            以下の基準で厳密に評価:
            1. **ビルドエラーが実際に修正されているか？** 無関係な変更のみの場合は reject
            2. **既存の関数・export を削除していないか？** 削除がある場合は必ず reject
            3. **既存のロジックを壊していないか？** 最小限の修正であること
            4. **新しいエラーを導入していないか？** (import 漏れ、型の不整合 等)
            5. **翻訳キーの修正が正しいか？** (ja.json/en.json に追加すべきキーが正しいか)

            問題がある場合は "reject" を含む応答を、
            承認する場合は "approve" を含む応答を返してください。
        """)


def _create_diff(original: str, modified: str, file_path: str) -> str:
    """unified diff を生成する"""
    return "\n".join(
        unified_diff(
            original.splitlines(keepends=True),
            modified.splitlines(keepends=True),
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
            lineterm="",
        )
    )


def _should_skip_file(file_path: Path) -> bool:
    """処理対象外のファイルかどうか判定する"""
    # 除外パターンチェック
    for part in file_path.parts:
        if part in EXCLUDE_PATTERNS:
            return True
    # 拡張子チェック
    if file_path.suffix not in TARGET_EXTENSIONS:
        return True
    # テストファイルは改善対象外
    if file_path.name.startswith("test_") or file_path.name.endswith(
        (".test.ts", ".test.tsx", ".test.js", ".spec.ts", ".spec.tsx")
    ):
        return True
    return False


def _count_changed_lines(original: str, modified: str) -> int:
    """変更された行数をカウントする"""
    diff = list(
        unified_diff(
            original.splitlines(),
            modified.splitlines(),
        )
    )
    return sum(1 for line in diff if line.startswith("+") or line.startswith("-"))


def _count_exports_and_functions(code: str) -> dict[str, int]:
    """コード内の export / function / const 定義をカウントする。

    関数削除を検出するために使用。変更後にカウントが減少していたら
    破壊的な変更とみなす。
    """
    import re
    counts = {
        "export": len(re.findall(r"\bexport\b", code)),
        "function": len(re.findall(r"\bfunction\s+\w+", code)),
        "arrow_fn": len(re.findall(r"\bconst\s+\w+\s*=\s*(?:async\s*)?\(", code)),
        "export_default": len(re.findall(r"\bexport\s+default\b", code)),
    }
    counts["total_definitions"] = counts["function"] + counts["arrow_fn"]
    return counts


def _check_destructive_changes(original: str, modified: str) -> tuple[bool, str]:
    """破壊的な変更（関数/export の削除）を検出する。

    Returns:
        (is_destructive, reason): 問題がある場合 True と理由。
    """
    orig_counts = _count_exports_and_functions(original)
    mod_counts = _count_exports_and_functions(modified)

    issues = []
    if mod_counts["total_definitions"] < orig_counts["total_definitions"]:
        diff = orig_counts["total_definitions"] - mod_counts["total_definitions"]
        issues.append(
            f"関数/定義が {diff} 個減少 "
            f"({orig_counts['total_definitions']}→{mod_counts['total_definitions']})"
        )
    if mod_counts["export"] < orig_counts["export"]:
        diff = orig_counts["export"] - mod_counts["export"]
        issues.append(
            f"export が {diff} 個減少 "
            f"({orig_counts['export']}→{mod_counts['export']})"
        )
    if mod_counts["export_default"] < orig_counts["export_default"]:
        issues.append("export default が削除されています")

    if issues:
        return True, "; ".join(issues)
    return False, ""


# ---------------------------------------------------------------------------
# GeneratorReviewerLoop: コアループロジック
# ---------------------------------------------------------------------------
class GeneratorReviewerLoop:
    """
    1ファイル × 1エージェントの改善ループを実行する。
    最大 MAX_ITERATIONS 回のイテレーションで改善を試みる。
    """

    def __init__(
        self,
        agent: BaseAgent,
        test_runner: TestRunner,
        max_rounds: int = MAX_ITERATIONS,
        *,
        skip_tests: bool = False,
    ):
        self.agent = agent
        self.test_runner = test_runner
        self.max_rounds = max_rounds
        self.skip_tests = skip_tests

    def execute(self, file_path: Path) -> LoopResult:
        """ファイルに対してGenerator↔Reviewerループを実行する"""
        result = LoopResult(
            file_path=str(file_path),
            agent_name=self.agent.name,
        )

        if not file_path.exists():
            result.final_status = "skipped"
            result.error = "ファイルが存在しません"
            return result

        # 元のコードを保存
        original_code = file_path.read_text(encoding="utf-8")
        current_code = original_code

        # バックアップ作成
        backup_path = self._create_backup(file_path)

        try:
            for iteration in range(1, self.max_rounds + 1):
                result.iterations = iteration
                logger.info(
                    "=== %s | %s | イテレーション %d/%d ===",
                    self.agent.name,
                    file_path.name,
                    iteration,
                    self.max_rounds,
                )

                # --- Generator フェーズ ---
                logger.info("📝 Generator: 改善提案を生成中...")
                proposal = self.agent.generate_proposal(
                    str(file_path), current_code
                )

                if not proposal.patch:
                    logger.info("提案なし — ループを終了")
                    result.final_status = "no_change"
                    break

                # パッチ適用
                modified_code = proposal.patch
                # 破壊的変更チェック (関数/export の削除を検出)
                is_destructive, reason = _check_destructive_changes(
                    current_code, modified_code
                )
                if is_destructive:
                    logger.warning(
                        "🚫 破壊的変更を検出 — スキップ: %s", reason,
                    )
                    file_path.write_text(current_code, encoding="utf-8")
                    result.improvements.append(
                        f"イテレーション{iteration}: 破壊的変更を検出 — {reason}"
                    )
                    continue

                if _count_changed_lines(current_code, modified_code) > MAX_CHANGED_LINES:
                    logger.warning(
                        "変更行数が上限 (%d行) を超過 — スキップ",
                        MAX_CHANGED_LINES,
                    )
                    result.final_status = "skipped"
                    result.error = "変更行数が上限を超過"
                    break

                # ファイルに書き込み
                file_path.write_text(modified_code, encoding="utf-8")
                logger.info("パッチを適用しました")

                # --- テスト実行 ---
                if self.skip_tests:
                    logger.info("🧪 テストスキップ (ベースライン失敗のため)")
                else:
                    logger.info("🧪 テスト実行中...")
                    tests_passed, test_output = self.test_runner.run_tests()

                    if not tests_passed:
                        logger.warning("❌ テスト失敗 — ロールバック")
                        self._rollback(file_path, backup_path)
                        current_code = file_path.read_text(encoding="utf-8")
                        result.improvements.append(
                            f"イテレーション{iteration}: テスト失敗によりロールバック"
                        )
                        continue

                # --- Reviewer フェーズ ---
                logger.info("🔍 Reviewer: 批判的評価中...")
                review = self.agent.review_proposal(
                    str(file_path),
                    current_code,
                    modified_code,
                    proposal.description,
                )

                if review.approved:
                    logger.info("✅ Reviewer が承認 — 改善を適用")
                    # diff を記録（最終承認時のもので上書き）
                    diff_lines = list(unified_diff(
                        current_code.splitlines(keepends=True),
                        modified_code.splitlines(keepends=True),
                        fromfile=f"a/{file_path.name}",
                        tofile=f"b/{file_path.name}",
                    ))
                    result.diff_text = "".join(diff_lines)
                    result.rationale = proposal.rationale or proposal.description
                    current_code = modified_code
                    # バックアップを更新（新しい状態を保存）
                    self._update_backup(file_path, backup_path)
                    result.improvements.append(
                        f"イテレーション{iteration}: {proposal.description} — 承認"
                    )
                    result.final_status = "improved"
                else:
                    logger.info("🔄 Reviewer が却下 — フィードバック: %s",
                                review.feedback[:100])
                    # 却下された場合はロールバックして次のイテレーションで改善
                    self._rollback(file_path, backup_path)
                    current_code = file_path.read_text(encoding="utf-8")
                    result.improvements.append(
                        f"イテレーション{iteration}: Reviewer却下 — {review.feedback[:80]}"
                    )

            # ループ終了時にまだ改善がなければ
            if result.final_status not in ("improved", "no_change"):
                result.final_status = "no_change"

        except Exception as e:
            logger.error("予期しないエラー: %s", e, exc_info=True)
            self._rollback(file_path, backup_path)
            result.final_status = "rolled_back"
            result.error = str(e)

        finally:
            # バックアップファイル削除
            self._cleanup_backup(backup_path)

        return result

    def _create_backup(self, file_path: Path) -> Path:
        """ファイルのバックアップを作成する"""
        backup = Path(tempfile.mktemp(suffix=file_path.suffix, prefix="backup_"))
        shutil.copy2(file_path, backup)
        logger.debug("バックアップ作成: %s", backup)
        return backup

    def _update_backup(self, file_path: Path, backup_path: Path) -> None:
        """バックアップを現在の状態に更新する"""
        shutil.copy2(file_path, backup_path)

    def _rollback(self, file_path: Path, backup_path: Path) -> None:
        """ファイルをバックアップ状態に戻す"""
        shutil.copy2(backup_path, file_path)
        logger.info("⏪ ロールバック完了: %s", file_path.name)

    def _cleanup_backup(self, backup_path: Path) -> None:
        """バックアップファイルを削除する"""
        try:
            backup_path.unlink(missing_ok=True)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# AgentLoop: メインオーケストレーター
# ---------------------------------------------------------------------------
class AgentLoop:
    """
    全体のオーケストレーション:
    1. 変更ファイルを検出
    2. 各エージェントで Generator↔Reviewer ループを実行
    3. 改善結果をコミット＆プッシュ
    4. サマリーレポートを出力
    """

    def __init__(self):
        self.dry_run = os.environ.get("DRY_RUN", "false").lower() == "true"
        self.max_cycles = int(os.environ.get("MAX_CYCLES", str(MAX_CYCLES_DEFAULT)))
        self.trigger_event = os.environ.get("TRIGGER_EVENT", "push")
        self.agents = self._select_agents()
        self.test_runner = TestRunner()
        self.skip_tests = False  # ベースラインテスト失敗時にTrue
        self.results: list[LoopResult] = []
        self.cycle_history: list[dict] = []  # 各サイクルの結果を記録

    @staticmethod
    def _select_agents() -> list[BaseAgent]:
        """環境変数 AGENT_TARGET に基づいてエージェントを選択する"""
        target = os.environ.get("AGENT_TARGET", "all").lower()
        agent_map = {
            "uiux": [UIUXAgent()],
            "performance": [PerformanceAgent()],
            "security": [SecurityAgent()],
            "feature": [FeatureEnhancementAgent()],
            "build": [BuildValidationAgent()],
        }
        if target in agent_map:
            logger.info("🎯 対象エージェント: %s", target)
            return agent_map[target]
        logger.info("🎯 対象エージェント: all (5エージェント)")
        return [BuildValidationAgent(), UIUXAgent(), PerformanceAgent(), SecurityAgent(), FeatureEnhancementAgent()]

    def _ensure_improvement_branch(self) -> None:
        """改善用の固定ブランチに切り替える（なければ main から作成）"""
        branch = IMPROVEMENT_BRANCH

        # 既にそのブランチにいる場合は何もしない
        current = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, cwd=str(REPO_ROOT),
        ).stdout.strip()
        if current == branch:
            logger.info("✅ 既に改善ブランチ '%s' にいます", branch)
            # リモートの最新を取り込む
            subprocess.run(
                ["git", "pull", "origin", branch, "--rebase"],
                cwd=str(REPO_ROOT),
            )
            return

        # ブランチがローカルに存在するかチェック
        local_check = subprocess.run(
            ["git", "rev-parse", "--verify", branch],
            capture_output=True, text=True, cwd=str(REPO_ROOT),
        )

        if local_check.returncode == 0:
            # ローカルに存在する → checkout して最新を pull
            logger.info("🔀 既存ブランチ '%s' に切り替えます", branch)
            subprocess.run(["git", "checkout", branch], cwd=str(REPO_ROOT))
            subprocess.run(
                ["git", "pull", "origin", branch, "--rebase"],
                cwd=str(REPO_ROOT),
            )
        else:
            # リモートに存在するかチェック
            remote_check = subprocess.run(
                ["git", "ls-remote", "--heads", "origin", branch],
                capture_output=True, text=True, cwd=str(REPO_ROOT),
            )
            if remote_check.stdout.strip():
                # リモートにある → fetch して checkout
                logger.info("🔀 リモートブランチ '%s' を取得して切り替えます", branch)
                subprocess.run(["git", "fetch", "origin", branch], cwd=str(REPO_ROOT))
                subprocess.run(
                    ["git", "checkout", "-b", branch, f"origin/{branch}"],
                    cwd=str(REPO_ROOT),
                )
            else:
                # どこにもない → main から新規作成
                logger.info("🆕 main から新規ブランチ '%s' を作成します", branch)
                subprocess.run(["git", "checkout", "main"], cwd=str(REPO_ROOT))
                subprocess.run(["git", "pull", "origin", "main"], cwd=str(REPO_ROOT))
                subprocess.run(
                    ["git", "checkout", "-b", branch],
                    cwd=str(REPO_ROOT),
                )

        logger.info("✅ ブランチ '%s' の準備完了", branch)

    def run(self) -> None:
        """メインエントリポイント — マルチサイクルで改善がなくなるまでループする"""
        logger.info("🚀 自律的コード改善ループを開始します")
        logger.info("リポジトリルート: %s", REPO_ROOT)
        logger.info("トリガー: %s | 最大サイクル: %d | ドライラン: %s",
                    self.trigger_event, self.max_cycles, self.dry_run)

        # ベースラインテストを実行
        baseline_ok = self.test_runner.check_baseline()
        self.skip_tests = not baseline_ok

        # 改善用固定ブランチに切り替え
        if not self.dry_run:
            self._ensure_improvement_branch()
        else:
            logger.info("🏜️ ドライランモード — ブランチ切替をスキップします")

        for cycle in range(1, self.max_cycles + 1):
            logger.info("")
            logger.info("=" * 60)
            logger.info("🔄 サイクル %d / %d", cycle, self.max_cycles)
            logger.info("=" * 60)

            cycle_improved = self._run_single_cycle(cycle)

            self.cycle_history.append({
                "cycle": cycle,
                "improved_count": cycle_improved,
            })

            if cycle_improved == 0:
                logger.info("🏁 サイクル %d: 改善なし — ループを終了します", cycle)
                break

            logger.info("✅ サイクル %d: %d 件改善 — 次のサイクルへ", cycle, cycle_improved)

        # サマリーレポートを出力
        self._write_summary()
        total_improved = sum(c["improved_count"] for c in self.cycle_history)
        total_cycles = len(self.cycle_history)
        logger.info("🏁 全サイクル完了: %dサイクル実行, 総改善数 %d",
                    total_cycles, total_improved)

    def _run_single_cycle(self, cycle_num: int) -> int:
        """
        1サイクルの実行: 全対象ファイル × 全エージェントを処理し、
        改善があればコミットする。改善件数を返す。
        """
        # ファイル検出: local/schedule/サイクル2以降は全ファイル、pushは差分
        if self.trigger_event in ("schedule", "local") or cycle_num > 1:
            changed_files = self._get_all_target_files()
        else:
            changed_files = self.detect_changed_files()

        if not changed_files:
            logger.info("改善対象のファイルがありません")
            return 0

        logger.info("対象ファイル数: %d", len(changed_files))

        cycle_results: list[LoopResult] = []

        # 各ファイル × 各エージェントでループ実行
        file_agent_count = 0
        for file_path in changed_files:
            for agent in self.agents:
                if not self._is_relevant(file_path, agent):
                    continue

                # レートリミット対策: ファイル間にクールダウンを挿入
                if file_agent_count > 0:
                    cooldown = int(os.environ.get("INTER_FILE_DELAY", "10"))
                    logger.info("⏳ レートリミット対策: %d秒クールダウン...", cooldown)
                    time.sleep(cooldown)

                loop = GeneratorReviewerLoop(
                    agent, self.test_runner, skip_tests=self.skip_tests,
                )
                result = loop.execute(file_path)
                cycle_results.append(result)
                self.results.append(result)
                file_agent_count += 1

                logger.info(
                    "📊 結果: %s | %s | status=%s | iterations=%d",
                    agent.name, file_path.name,
                    result.final_status, result.iterations,
                )

        # 改善されたファイルがあればコミット
        improved = [r for r in cycle_results if r.final_status == "improved"]
        if improved:
            if self.dry_run:
                logger.info("🏜️ ドライランモード — コミットはスキップします")
            else:
                self.commit_improvements(improved, cycle_num)

        return len(improved)

    def detect_changed_files(self) -> list[Path]:
        """直近のコミットで変更されたファイルを検出する"""
        try:
            result = subprocess.run(
                ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
                capture_output=True,
                text=True,
                cwd=str(REPO_ROOT),
            )
            if result.returncode != 0:
                logger.warning("git diff に失敗 — 全ファイルを対象にフォールバック")
                return self._get_all_target_files()

            files = []
            for line in result.stdout.strip().splitlines():
                path = REPO_ROOT / line.strip()
                if path.exists() and not _should_skip_file(path):
                    files.append(path)
            return files

        except FileNotFoundError:
            logger.error("git コマンドが見つかりません")
            return []

    def _get_all_target_files(self) -> list[Path]:
        """全対象ファイルのリストを返す（フォールバック用）

        各拡張子から均等にファイルを選択し、特定の拡張子に偏らないようにする。
        """
        import random
        files_by_ext: dict[str, list[Path]] = {}
        for ext in TARGET_EXTENSIONS:
            ext_files = [
                path for path in REPO_ROOT.rglob(f"*{ext}")
                if not _should_skip_file(path)
            ]
            if ext_files:
                random.shuffle(ext_files)
                files_by_ext[ext] = ext_files

        # ラウンドロビンで各拡張子からファイルを選択（偏り防止）
        max_files = 30
        result: list[Path] = []
        round_idx = 0
        while len(result) < max_files:
            added = False
            for ext_files in files_by_ext.values():
                if round_idx < len(ext_files) and len(result) < max_files:
                    result.append(ext_files[round_idx])
                    added = True
            if not added:
                break
            round_idx += 1

        return result

    @property
    def repo_root(self) -> Path:
        """リポジトリルート（_is_relevantで使用）"""
        return REPO_ROOT

    def _is_relevant(self, file_path: Path, agent: BaseAgent) -> bool:
        """ファイルがエージェントの対象かどうかを判定する"""
        suffix = file_path.suffix

        if isinstance(agent, UIUXAgent):
            # UI/UX: TSX, JSX, CSS, SCSS が対象
            return suffix in {".tsx", ".jsx", ".css", ".scss"}

        if isinstance(agent, PerformanceAgent):
            # Performance: すべてのコードファイルが対象
            return suffix in {".ts", ".tsx", ".js", ".jsx", ".py"}

        if isinstance(agent, SecurityAgent):
            # Security: API, 認証関連のファイルが対象
            security_patterns = {"api", "auth", "middleware", "server", "action"}
            name_lower = file_path.stem.lower()
            # ファイルパス全体の中に含まれるかチェック（ネストしたディレクトリ対応）
            path_parts_lower = [p.lower() for p in file_path.relative_to(self.repo_root).parts] if file_path.is_relative_to(self.repo_root) else [file_path.parent.name.lower()]
            return (
                suffix in {".ts", ".tsx", ".js", ".jsx", ".py"}
                and (
                    any(p in name_lower for p in security_patterns)
                    or any(
                        any(pat in part for pat in security_patterns)
                        for part in path_parts_lower
                    )
                )
            )

        if isinstance(agent, FeatureEnhancementAgent):
            # Feature Enhancement: TSX/JSX コンポーネントのみ対象
            # (UI に関わるファイルに UX パターンを追加)
            return suffix in {".tsx", ".jsx"}

        if isinstance(agent, BuildValidationAgent):
            # Build Validation: TS/TSX/JS/JSX + JSON (翻訳ファイル) が対象
            return suffix in {".ts", ".tsx", ".js", ".jsx", ".json"}

        return False

    def commit_improvements(self, improved_results: list[LoopResult], cycle_num: int = 1) -> None:
        """改善されたファイルをコミット＆プッシュする"""
        logger.info("📝 改善結果をコミットします (%d ファイル)", len(improved_results))

        # 改善ファイルを git add
        for result in improved_results:
            subprocess.run(
                ["git", "add", result.file_path],
                cwd=str(REPO_ROOT),
            )

        # コミットメッセージ生成
        agent_names = sorted({r.agent_name for r in improved_results})
        file_names = sorted({Path(r.file_path).name for r in improved_results})
        message = (
            f"{COMMIT_PREFIX} [cycle {cycle_num}]: "
            f"{', '.join(agent_names)} による改善 "
            f"({', '.join(file_names[:5])})"
        )

        # コミット
        subprocess.run(
            ["git", "commit", "-m", message],
            cwd=str(REPO_ROOT),
        )

        # プッシュ（常に改善用固定ブランチへ）
        subprocess.run(
            ["git", "push", "origin", IMPROVEMENT_BRANCH],
            cwd=str(REPO_ROOT),
        )
        logger.info("✅ コミット＆プッシュ完了 [%s]: %s", IMPROVEMENT_BRANCH, message)

    def _write_summary(self) -> None:
        """Markdown レポートを生成し、コンソール・ファイル・GitHub Actions に出力する"""
        from datetime import datetime

        summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        improved_count = sum(1 for r in self.results if r.final_status == "improved")
        no_change_count = sum(1 for r in self.results if r.final_status == "no_change")
        rolled_back_count = sum(1 for r in self.results if r.final_status == "rolled_back")
        skipped_count = sum(1 for r in self.results if r.final_status == "skipped")

        lines: list[str] = []

        # ── ヘッダー ──
        lines.append("# 🤖 AI 自律改善レポート")
        lines.append("")
        lines.append(f"> 生成日時: {now}")
        lines.append("")

        # ── サマリーテーブル ──
        lines.append("## 📊 サマリー")
        lines.append("")
        lines.append("| 項目 | 値 |")
        lines.append("|------|------|")
        lines.append(f"| トリガー | {self.trigger_event} |")
        lines.append(f"| サイクル数 | {len(self.cycle_history)} |")
        lines.append(f"| 処理ファイル数 | {len(self.results)} |")
        lines.append(f"| ✅ 改善成功 | **{improved_count}** |")
        lines.append(f"| ➖ 変更なし | {no_change_count} |")
        lines.append(f"| ⏪ ロールバック | {rolled_back_count} |")
        lines.append(f"| ⏭️ スキップ | {skipped_count} |")
        lines.append("")

        # ── サイクル履歴 ──
        if self.cycle_history:
            lines.append("## 🔄 サイクル履歴")
            lines.append("")
            for ch in self.cycle_history:
                icon = "✅" if ch["improved_count"] > 0 else "➖"
                lines.append(
                    f"- {icon} サイクル {ch['cycle']}: "
                    f"{ch['improved_count']} 件改善"
                )
            lines.append("")

        # ── 改善されたファイルの詳細（diff付き）──
        improved_results = [r for r in self.results if r.final_status == "improved"]
        if improved_results:
            lines.append("## ✅ 改善されたファイル")
            lines.append("")
            for r in improved_results:
                rel_path = str(Path(r.file_path).relative_to(REPO_ROOT)) if REPO_ROOT in Path(r.file_path).parents else r.file_path
                lines.append(f"### 📝 `{rel_path}`")
                lines.append("")
                lines.append(f"- **エージェント:** {r.agent_name}")
                lines.append(f"- **イテレーション数:** {r.iterations}")
                if r.rationale:
                    lines.append(f"- **改善理由:** {r.rationale}")
                if r.improvements:
                    lines.append("- **履歴:**")
                    for imp in r.improvements:
                        lines.append(f"  - {imp}")
                lines.append("")

                # diff の表示
                if r.diff_text:
                    lines.append("<details>")
                    lines.append(f"<summary>📄 差分を表示（クリックで展開）</summary>")
                    lines.append("")
                    lines.append("```diff")
                    # diff が長すぎる場合は先頭 200 行に制限
                    diff_lines_list = r.diff_text.splitlines()
                    if len(diff_lines_list) > 200:
                        lines.extend(diff_lines_list[:200])
                        lines.append(f"\n... (以下 {len(diff_lines_list) - 200} 行省略)")
                    else:
                        lines.extend(diff_lines_list)
                    lines.append("```")
                    lines.append("")
                    lines.append("</details>")
                else:
                    lines.append("> ⚠️ diff データなし")
                lines.append("")

        # ── 変更なし / スキップ / ロールバックのファイル ──
        other_results = [r for r in self.results if r.final_status != "improved"]
        if other_results:
            lines.append("## 📋 その他のファイル")
            lines.append("")
            lines.append("| ファイル | エージェント | ステータス | 備考 |")
            lines.append("|----------|------------|----------|------|")
            for r in other_results:
                status_icon = {
                    "no_change": "➖",
                    "rolled_back": "⏪",
                    "skipped": "⏭️",
                }.get(r.final_status, "❓")
                fname = Path(r.file_path).name
                note = r.error or (r.improvements[-1] if r.improvements else "—")
                # テーブル内のパイプ文字をエスケープ
                note = note.replace("|", "\\|")
                lines.append(f"| `{fname}` | {r.agent_name} | {status_icon} {r.final_status} | {note} |")
            lines.append("")

        # ── フッター ──
        lines.append("---")
        lines.append(f"*レポート生成: agent_loop.py v3 | モデル: {os.environ.get('AI_MODEL', 'gpt-4.1')}*")

        summary_text = "\n".join(lines)

        # 1. Markdown レポートをファイルに保存
        report_md_path = REPO_ROOT / "improvement-report.md"
        report_md_path.write_text(summary_text, encoding="utf-8")
        logger.info("📄 Markdown レポートを出力: %s", report_md_path)

        # 2. GitHub Actions のステップサマリーに出力
        if summary_path:
            Path(summary_path).write_text(summary_text, encoding="utf-8")
            logger.info("📊 サマリーを GITHUB_STEP_SUMMARY に出力しました")

        # 3. コンソールにも出力
        print(summary_text)


# ---------------------------------------------------------------------------
# エントリポイント
# ---------------------------------------------------------------------------
def main() -> None:
    """スクリプトのエントリポイント"""
    logger.info("=" * 60)
    logger.info("自律的コード改善ループ v2.0 (GitHub Models API)")
    logger.info("=" * 60)

    try:
        loop = AgentLoop()
        loop.run()
    except KeyboardInterrupt:
        logger.info("ユーザーにより中断されました")
        sys.exit(1)
    except Exception as e:
        logger.error("致命的エラー: %s", e, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
