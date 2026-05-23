#!/bin/bash
# セッション終了時の自動コミット（明示的に有効化された場合のみ）
#
# 注意: このスクリプトは copilot セッション終了時に自動実行される
# main/master への直接コミットは行わない

BRANCH=$(git branch --show-current 2>/dev/null)

if [ "${UCFITNESS_AUTO_COMMIT:-0}" != "1" ]; then
  echo "SKIP: UCFITNESS_AUTO_COMMIT=1 が未設定のため自動コミットしません"
  exit 0
fi

# main/master ブランチではスキップ
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "SKIP: main/master ブランチのため自動コミットしません"
  exit 0
fi

# 変更がなければスキップ
if git diff --quiet && git diff --staged --quiet; then
  echo "OK: コミットする変更なし"
  exit 0
fi

# UCFitness プロジェクト固有ルールの検査 (違反があればコミットをブロック)
if [ -f "scripts/check-ucfitness-rules.sh" ]; then
  if ! bash scripts/check-ucfitness-rules.sh; then
    echo "ERR: UCFitness rule-check 失敗 — コミットを中止します"
    echo "   違反を修正してから再度コミットしてください"
    exit 1
  fi
fi

if [ "${UCFITNESS_AUTO_COMMIT_STRICT:-0}" = "1" ]; then
  npm run check:all
fi

if git status --porcelain | grep -E '(^.. \.env|^.. .*\.pem$|^.. .*\.key$)' >/dev/null; then
  echo "ERR: シークレット候補ファイルが含まれるため自動コミットを中止します"
  exit 1
fi

# ステージングされていない変更を安全な範囲でステージング
git add -u
git add . ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.gif' ':!*.webp' ':!*.pem' ':!*.key' ':!.env*'

# タイムスタンプ付きのWIPコミット
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "wip: セッション自動保存 ($TIMESTAMP)"

echo "OK: セッション自動コミット完了: $TIMESTAMP"
