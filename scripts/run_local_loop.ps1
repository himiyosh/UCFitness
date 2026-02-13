<#
.SYNOPSIS
    ローカル実行用: 自律的コード改善ループ

.DESCRIPTION
    手動で実行すると、改善がなくなるまで自動的にループします。
    git pull → エージェント改善 → テスト → git commit & push を繰り返します。

.PARAMETER Agent
    実行するエージェント: all / uiux / performance / security (デフォルト: all)

.PARAMETER MaxCycles
    マルチサイクル最大回数 (デフォルト: 10)

.PARAMETER DryRun
    コミットせずにレポートのみ出力

.EXAMPLE
    # 全エージェントで最大10サイクル
    .\scripts\run_local_loop.ps1

    # セキュリティエージェントのみ
    .\scripts\run_local_loop.ps1 -Agent security

    # ドライラン (コミットなし)
    .\scripts\run_local_loop.ps1 -DryRun

    # 最大サイクル数を指定
    .\scripts\run_local_loop.ps1 -MaxCycles 20
#>

param(
    [ValidateSet("all", "uiux", "performance", "security", "feature")]
    [string]$Agent = "all",

    [int]$MaxCycles = 10,

    [switch]$DryRun
)

# --- 設定 ---
$ErrorActionPreference = "Stop"
$RepoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
Set-Location $RepoRoot

# --- 色付きログ ---
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $color = switch ($Level) {
        "INFO"    { "Cyan" }
        "SUCCESS" { "Green" }
        "WARN"    { "Yellow" }
        "ERROR"   { "Red" }
        default   { "White" }
    }
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] " -NoNewline -ForegroundColor DarkGray
    Write-Host "[$Level] " -NoNewline -ForegroundColor $color
    Write-Host $Message
}

# --- 前提条件チェック ---
function Test-Prerequisites {
    Write-Log "前提条件を確認中..." "INFO"

    # Git
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Log "git が見つかりません" "ERROR"; return $false
    }

    # Python
    $python = $null
    if (Get-Command "pyenv" -ErrorAction SilentlyContinue) {
        $python = "pyenv exec python"
    } elseif (Get-Command "python" -ErrorAction SilentlyContinue) {
        $python = "python"
    }
    if (-not $python) {
        Write-Log "Python が見つかりません" "ERROR"; return $false
    }
    $script:PythonCmd = $python

    # gh copilot
    $ghCheck = gh copilot --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "gh copilot が利用不可 ($ghCheck) — gh extension install github/gh-copilot を実行してください" "ERROR"
        return $false
    }

    Write-Log "前提条件 OK (Python: $python)" "SUCCESS"
    return $true
}

# --- メイン処理 ---
function Start-ImprovementLoop {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "  🤖 自律的コード改善ループ (ローカル実行)                " -ForegroundColor Magenta
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host ""

    Write-Log "エージェント: $Agent" "INFO"
    Write-Log "最大サイクル: $MaxCycles" "INFO"
    Write-Log "ドライラン: $DryRun" "INFO"
    Write-Log "リポジトリ: $RepoRoot" "INFO"
    Write-Host ""

    # 前提条件チェック
    if (-not (Test-Prerequisites)) {
        Write-Log "前提条件を満たしていません — 中断します" "ERROR"
        exit 1
    }

    # ブランチ切り替えは agent_loop.py 内で自動的に行われます
    # (固定ブランチ: bot/ai-improvements)
    $currentBranch = git branch --show-current
    Write-Log "現在のブランチ: $currentBranch (実行時に bot/ai-improvements へ自動切替)" "INFO"

    # 環境変数を設定
    $env:AGENT_TARGET = $Agent
    $env:MAX_CYCLES = $MaxCycles.ToString()
    $env:DRY_RUN = if ($DryRun) { "true" } else { "false" }
    $env:TRIGGER_EVENT = "local"
    $env:GITHUB_WORKSPACE = $RepoRoot

    # Python スクリプト実行
    Write-Host ""
    Write-Log "🚀 改善ループを開始します..." "SUCCESS"
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray

    $startTime = Get-Date

    if ($script:PythonCmd -eq "pyenv exec python") {
        pyenv exec python "$RepoRoot\scripts\agent_loop.py"
    } else {
        python "$RepoRoot\scripts\agent_loop.py"
    }

    $exitCode = $LASTEXITCODE
    $elapsed = (Get-Date) - $startTime

    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""

    if ($exitCode -eq 0) {
        Write-Log "改善ループが正常終了しました (所要時間: $($elapsed.ToString('hh\:mm\:ss')))" "SUCCESS"
    } else {
        Write-Log "改善ループがエラーで終了しました (exit=$exitCode)" "ERROR"
    }

    # レポート表示
    $reportPath = Join-Path $RepoRoot "improvement-report.json"
    if (Test-Path $reportPath) {
        Write-Host ""
        Write-Log "📊 レポート: $reportPath" "INFO"
        $report = Get-Content $reportPath -Raw | ConvertFrom-Json
        Write-Log "  サイクル数: $($report.total_cycles)" "INFO"
        Write-Log "  改善成功: $($report.improved) 件" "SUCCESS"
        Write-Log "  変更なし: $($report.no_change) 件" "INFO"
        Write-Log "  ロールバック: $($report.rolled_back) 件" "WARN"
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "  🏁 完了                                                  " -ForegroundColor Magenta
    Write-Host "============================================================" -ForegroundColor Magenta

    return $exitCode
}

# --- 実行 ---
$result = Start-ImprovementLoop
exit $result
