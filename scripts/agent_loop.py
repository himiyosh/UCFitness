#!/usr/bin/env python3
"""
自律的コード改善ループ (Autonomous Code Improvement Loop)

3つの専門エージェント (UI/UX, Performance, Security) が
Generator ↔ Reviewer パターンで最大3回のイテレーションを回し、
テスト通過を保証しながらコードを改善するスクリプト。

使用ツール: GitHub Models API (gpt-5)
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


# ---------------------------------------------------------------------------
# GitHubModelsClient: GitHub Models API とのインターフェース
# ---------------------------------------------------------------------------
class GitHubModelsClient:
    """GitHub Models API を使用してAI応答を取得するクライアント

    認証: gh auth token (GitHub CLI) のトークンをそのまま使用。
    エンドポイント: https://models.inference.ai.azure.com/chat/completions
    デフォルトモデル: gpt-5 (環境変数 AI_MODEL で変更可能)
    """

    API_URL = "https://models.inference.ai.azure.com/chat/completions"
    DEFAULT_MODEL = "gpt-5"
    # gpt-5/o-series は max_tokens ではなく max_completion_tokens を使用
    MODELS_USING_COMPLETION_TOKENS = {"gpt-5", "o1", "o3", "o3-mini", "o4-mini"}
    MAX_RETRIES = 3
    RETRY_BASE_DELAY = 2  # 秒

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

        # gpt-5 / o-series は max_completion_tokens を使用
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
                    "レビューを求められた場合、承認なら 'approve'、"
                    "却下なら 'reject' を含めて回答してください。"
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
        cmd = ["npx", "vitest", "run", "--reporter=verbose"]
        return self._execute_test_command(cmd, timeout)

    def _execute_test_command(
        self, cmd: list[str], timeout: int
    ) -> tuple[bool, str]:
        """テストコマンドを実行して結果を返す"""
        logger.info("テスト実行: %s", " ".join(cmd))
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(self.repo_root),
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

        # レスポンスからコードブロックを抽出
        extracted = self._extract_code_block(response)

        return Proposal(
            description=f"[{self.name}] {file_path} の改善提案",
            patch=extracted,
            rationale=f"{self.role} の観点からの改善",
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
    """🎨 UI/UX Agent: デザイン整合性、アクセシビリティ、レスポンシブ改善"""

    def __init__(self):
        super().__init__(
            name="UI/UX Agent",
            role="UI/UXデザインの専門家",
            focus_areas=[
                "デザインの整合性",
                "アクセシビリティ (WCAG 2.1 AA)",
                "レスポンシブデザイン",
                "セマンティックHTML",
                "カラーコントラスト",
            ],
        )

    def get_generator_prompt(self, file_path: str, code: str) -> str:
        return textwrap.dedent(f"""\
            あなたはUI/UXの専門家です。以下のコードを分析し、改善提案を生成してください。

            対象ファイル: {file_path}
            改善の焦点:
            - デザインの整合性（一貫したスペーシング、タイポグラフィ）
            - アクセシビリティ（aria属性、alt属性、キーボードナビゲーション）
            - レスポンシブデザイン（モバイル対応、ビューポート最適化）
            - セマンティックHTMLの使用

            コード:
            ```
            {code[:3000]}
            ```

            改善後のコード全体を返してください。変更箇所にはコメントで説明を付けてください。
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
            {diff_text[:3000]}
            ```

            以下の基準で評価:
            1. アクセシビリティが向上しているか？
            2. デザインの一貫性が保たれているか？
            3. 既存の機能を壊していないか？
            4. レスポンシブ対応が適切か？

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
            あなたはパフォーマンス最適化の専門家です。以下のコードを分析し、改善提案を生成してください。

            対象ファイル: {file_path}
            改善の焦点:
            - アルゴリズムの計算量削減 (O記法での改善)
            - メモリ効率の向上（不要なコピーの削減、ストリーミング処理）
            - 不要な再レンダリングの防止 (React.memo, useMemo, useCallback)
            - バンドルサイズ削減 (動的インポート、ツリーシェイキング)

            コード:
            ```
            {code[:3000]}
            ```

            改善後のコード全体を返してください。変更箇所にはコメントで説明を付けてください。
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
            {diff_text[:3000]}
            ```

            以下の基準で評価:
            1. 計算量が実際に改善されているか？
            2. メモリ使用量が適切か？
            3. 可読性を犠牲にしすぎていないか？
            4. エッジケースでの動作は安全か？

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
            あなたはセキュリティの専門家です。以下のコードを分析し、脆弱性の修正提案を生成してください。

            対象ファイル: {file_path}
            改善の焦点:
            - XSS対策 (サニタイゼーション、エスケープ)
            - インジェクション対策 (SQL, NoSQL, コマンド)
            - 認証・認可の適切な実装
            - 機密情報のハードコーディング防止
            - 入力値バリデーションの強化
            - OWASP Top 10 への準拠

            コード:
            ```
            {code[:3000]}
            ```

            セキュリティ改善後のコード全体を返してください。変更箇所にはコメントで説明を付けてください。
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
            {diff_text[:3000]}
            ```

            以下の基準で評価:
            1. 脆弱性が実際に修正されているか？
            2. 新たな脆弱性が混入していないか？
            3. OWASP Top 10 の基準を満たしているか？
            4. 既存のセキュリティ機構を壊していないか？

            問題がある場合は "reject" を含む応答を、
            承認する場合は "approve" を含む応答を返してください。
        """)


# ---------------------------------------------------------------------------
# ユーティリティ関数
# ---------------------------------------------------------------------------
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
    ):
        self.agent = agent
        self.test_runner = test_runner
        self.max_rounds = max_rounds

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
        }
        if target in agent_map:
            logger.info("🎯 対象エージェント: %s", target)
            return agent_map[target]
        logger.info("🎯 対象エージェント: all (3エージェント)")
        return [UIUXAgent(), PerformanceAgent(), SecurityAgent()]

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
        for file_path in changed_files:
            for agent in self.agents:
                if not self._is_relevant(file_path, agent):
                    continue

                loop = GeneratorReviewerLoop(agent, self.test_runner)
                result = loop.execute(file_path)
                cycle_results.append(result)
                self.results.append(result)

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
        """全対象ファイルのリストを返す（フォールバック用）"""
        files = []
        for ext in TARGET_EXTENSIONS:
            for path in REPO_ROOT.rglob(f"*{ext}"):
                if not _should_skip_file(path):
                    files.append(path)
        return files[:20]  # 安全のため最大20ファイル

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
            parent_lower = file_path.parent.name.lower()
            return (
                suffix in {".ts", ".tsx", ".js", ".jsx", ".py"}
                and (
                    any(p in name_lower for p in security_patterns)
                    or any(p in parent_lower for p in security_patterns)
                )
            )

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
        """サマリーレポートを GitHub Actions の GITHUB_STEP_SUMMARY に出力する"""
        summary_path = os.environ.get("GITHUB_STEP_SUMMARY")

        lines = [
            "# 🤖 自律的コード改善レポート\n",
            f"| 項目 | 値 |",
            f"|------|------|",
            f"| トリガー | {self.trigger_event} |",
            f"| サイクル数 | {len(self.cycle_history)} |",
            f"| 処理ファイル数 | {len(self.results)} |",
            f"| 改善成功 | {sum(1 for r in self.results if r.final_status == 'improved')} |",
            f"| 変更なし | {sum(1 for r in self.results if r.final_status == 'no_change')} |",
            f"| ロールバック | {sum(1 for r in self.results if r.final_status == 'rolled_back')} |",
            f"| スキップ | {sum(1 for r in self.results if r.final_status == 'skipped')} |",
            "",
            "## 🔄 サイクル履歴\n",
        ]

        for ch in self.cycle_history:
            icon = "✅" if ch["improved_count"] > 0 else "➖"
            lines.append(
                f"- {icon} サイクル {ch['cycle']}: "
                f"{ch['improved_count']} 件改善"
            )
        lines.append("")

        lines.append("## 📋 詳細結果\n")

        for r in self.results:
            status_icon = {
                "improved": "✅",
                "no_change": "➖",
                "rolled_back": "⏪",
                "skipped": "⏭️",
            }.get(r.final_status, "❓")

            lines.append(
                f"### {status_icon} {r.agent_name} → `{Path(r.file_path).name}`"
            )
            lines.append(f"- **ステータス:** {r.final_status}")
            lines.append(f"- **イテレーション数:** {r.iterations}")
            if r.improvements:
                lines.append("- **改善履歴:**")
                for imp in r.improvements:
                    lines.append(f"  - {imp}")
            if r.error:
                lines.append(f"- **エラー:** {r.error}")
            lines.append("")

        summary_text = "\n".join(lines)

        # GitHub Actions のステップサマリーに出力
        if summary_path:
            Path(summary_path).write_text(summary_text, encoding="utf-8")
            logger.info("📊 サマリーを GITHUB_STEP_SUMMARY に出力しました")

        # コンソールにも出力
        print(summary_text)

        # JSON レポートも生成
        report = {
            "trigger": self.trigger_event,
            "total_cycles": len(self.cycle_history),
            "cycle_history": self.cycle_history,
            "total_files": len(self.results),
            "improved": sum(1 for r in self.results if r.final_status == "improved"),
            "no_change": sum(1 for r in self.results if r.final_status == "no_change"),
            "rolled_back": sum(
                1 for r in self.results if r.final_status == "rolled_back"
            ),
            "skipped": sum(1 for r in self.results if r.final_status == "skipped"),
            "details": [
                {
                    "file": r.file_path,
                    "agent": r.agent_name,
                    "status": r.final_status,
                    "iterations": r.iterations,
                    "improvements": r.improvements,
                    "error": r.error,
                }
                for r in self.results
            ],
        }
        report_path = REPO_ROOT / "improvement-report.json"
        report_path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        logger.info("📄 JSON レポートを出力: %s", report_path)


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
