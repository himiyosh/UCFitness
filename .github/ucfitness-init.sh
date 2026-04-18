#!/usr/bin/env bash
# ============================================================================
# UCFitness Initializer Script
# ============================================================================
# 目的: セッション開始時に環境を「すぐに作業できる状態」に整える。
# 参考: Anthropic "Effective Harnesses for Long-Running Agents" の init.sh パターン。
#
# 実行する処理:
#   1. ポート 3000 の強制解放 (NextAuth callback URL 固定のため必須)
#   2. .next キャッシュ破損対策
#   3. 依存関係確認 (node_modules 欠落時のみ npm ci)
#   4. 型チェック (素早いヘルスチェック)
#   5. dev サーバーのバックグラウンド起動 + 起動待機
#
# 終了コード:
#   0: 成功 (dev サーバーが http://localhost:3000 で応答)
#   1: 失敗 (dev サーバー起動失敗 / 型チェック失敗など)
#
# 使い方:
#   ./github/ucfitness-init.sh            # 通常起動
#   SKIP_DEV=1 ./github/ucfitness-init.sh # dev サーバー起動をスキップ (型チェックのみ)
# ============================================================================
set -euo pipefail

PORT="${DEV_PORT:-3000}"
LOG_FILE="${DEV_LOG:-/tmp/ucfitness-dev.log}"
SKIP_DEV="${SKIP_DEV:-0}"

log() { printf '[init] %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. ポート解放
# ---------------------------------------------------------------------------
log "STEP 1/5: release port ${PORT}"
if command -v lsof >/dev/null 2>&1; then
  # macOS / Linux
  PIDS=$(lsof -ti:"${PORT}" 2>/dev/null || true)
  if [ -n "${PIDS}" ]; then
    log "  killing stale processes on port ${PORT}: ${PIDS}"
    echo "${PIDS}" | xargs -r kill -9 2>/dev/null || true
  fi
else
  log "  WARN: lsof not found — skipping port release"
fi

# ---------------------------------------------------------------------------
# 2. .next キャッシュ破損対策
# ---------------------------------------------------------------------------
log "STEP 2/5: clean .next cache"
rm -rf .next

# ---------------------------------------------------------------------------
# 3. 依存関係確認
# ---------------------------------------------------------------------------
log "STEP 3/5: verify dependencies"
if [ ! -d node_modules ]; then
  log "  node_modules missing — running npm ci"
  npm ci
else
  log "  OK: node_modules present"
fi

# ---------------------------------------------------------------------------
# 4. 型チェック
# ---------------------------------------------------------------------------
log "STEP 4/5: type check (tsc --noEmit)"
if ! npx tsc --noEmit; then
  log "  ERR: type check failed — fix errors before starting dev server"
  exit 1
fi
log "  OK: type check passed"

# ---------------------------------------------------------------------------
# 5. dev サーバー起動
# ---------------------------------------------------------------------------
if [ "${SKIP_DEV}" = "1" ]; then
  log "STEP 5/5: SKIP dev server (SKIP_DEV=1)"
  log "DONE: environment ready (dev server not started)"
  exit 0
fi

log "STEP 5/5: start dev server on port ${PORT}"
npm run dev > "${LOG_FILE}" 2>&1 &
DEV_PID=$!
log "  spawned dev server (PID=${DEV_PID}), waiting up to 30s for readiness"

for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}" >/dev/null 2>&1; then
    log "DONE: dev server ready (PID=${DEV_PID}, port=${PORT})"
    exit 0
  fi
  sleep 1
done

log "ERR: dev server failed to start within 30s. Last 50 lines of log:"
tail -n 50 "${LOG_FILE}" || true
exit 1
