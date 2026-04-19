#!/bin/bash
# セッション終了時の自動コミット（未コミットの変更がある場合）
#
# 注意: このスクリプトは copilot セッション終了時に自動実行される
# main/master への直接コミットは行わない

BRANCH=$(git branch --show-current 2>/dev/null)

# main/master ブランチではスキップ
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "⚠️ main/master ブランチのためスキップ"
  exit 0
fi

# 変更がなければスキップ
if git diff --quiet && git diff --staged --quiet; then
  echo "✅ コミットする変更なし"
  exit 0
fi

# UCFitness プロジェクト固有ルールの検査 (違反があればコミットをブロック)
if [ -f "scripts/check-ucfitness-rules.sh" ]; then
  if ! bash scripts/check-ucfitness-rules.sh; then
    echo "❌ UCFitness rule-check 失敗 — コミットを中止します"
    echo "   違反を修正してから再度コミットしてください"
    exit 1
  fi
fi

# ステージングされていない変更をステージング
git add -A

# タイムスタンプ付きのWIPコミット
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "wip: セッション自動保存 ($TIMESTAMP)" --no-verify

echo "💾 セッション自動コミット完了: $TIMESTAMP"
