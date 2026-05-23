#!/bin/bash
# セッション開始時のロギング
#
# セッション情報をログファイルに記録する

LOG_DIR=".github/hooks/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/sessions.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
DIRTY_FILES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

echo "--- SESSION START ---" >> "$LOG_FILE"
echo "  時刻: $TIMESTAMP" >> "$LOG_FILE"
echo "  ブランチ: $BRANCH" >> "$LOG_FILE"
echo "  未コミット変更数: $DIRTY_FILES" >> "$LOG_FILE"

echo "OK: セッション開始をログに記録: $TIMESTAMP"
