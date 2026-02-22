#!/bin/bash
# セッション終了時のロギング
#
# セッション終了情報をログファイルに記録する

LOG_DIR=".github/hooks/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/sessions.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "no commits")
DIRTY_FILES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

echo "--- SESSION END ---" >> "$LOG_FILE"
echo "  時刻: $TIMESTAMP" >> "$LOG_FILE"
echo "  ブランチ: $BRANCH" >> "$LOG_FILE"
echo "  最終コミット: $LAST_COMMIT" >> "$LOG_FILE"
echo "  未コミット変更数: $DIRTY_FILES" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

echo "📝 セッション終了をログに記録: $TIMESTAMP"
