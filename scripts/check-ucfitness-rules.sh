#!/usr/bin/env bash
# UCFitness プロジェクト固有ルールの自動検査
# 違反があれば非ゼロ終了する。CI / pre-commit / session-auto-commit から呼び出される想定。

set -u

VIOLATIONS=0
REPORT=""

record() {
  local label="$1"
  local body="$2"
  VIOLATIONS=$((VIOLATIONS + 1))
  REPORT+="\n❌ [${label}]\n${body}\n"
}

# ---------- 1. leaderboard-row に transition-all を使っていないか ----------
# copilot-instructions: ランキング系は transition-colors のみ許可
HITS=$(grep -rEn "leaderboard-row[^\"']*transition-all|transition-all[^\"']*leaderboard-row" \
  --include="*.tsx" --include="*.ts" components app 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "leaderboard-row に transition-all (rule: ランキング行は transition-colors のみ)" "$HITS"
fi

# ---------- 2. auth.users への FK 参照 ----------
# UCFitness は NextAuth + public.users を使用。auth.users 参照は FK 違反の原因
HITS=$(grep -rEn "REFERENCES[[:space:]]+auth\.users" \
  --include="*.sql" --include="*.ts" migrations lib app scripts 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "REFERENCES auth.users (rule: public.users を使用)" "$HITS"
fi

# ---------- 3. window.confirm / alert / prompt の使用 ----------
HITS=$(grep -rEn "window\.(confirm|alert|prompt)\s*\(" \
  --include="*.tsx" --include="*.ts" components app 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "window.confirm/alert/prompt 使用 (rule: カスタムダイアログを実装)" "$HITS"
fi

# ---------- 4. framer-motion import ----------
HITS=$(grep -rEn "from ['\"]framer-motion['\"]" \
  --include="*.tsx" --include="*.ts" components app hooks lib 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "framer-motion import (rule: CSS アニメーションのみ使用)" "$HITS"
fi

# ---------- 5. dark: Tailwind クラス ----------
# テーマは CSS カスタムプロパティで対応済み
HITS=$(grep -rEn "className=[\"'][^\"']*\bdark:" \
  --include="*.tsx" components app 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "dark: Tailwind クラス (rule: var(--theme-*) を使用)" "$HITS"
fi

# ---------- 6. app/ ページ・ルートの edge runtime 漏れ ----------
MISSING_RUNTIME=""
while IFS= read -r file; do
  # layout.tsx は不要。not-found/loading/template も不要
  case "$(basename "$file")" in
    layout.tsx|loading.tsx|not-found.tsx|template.tsx|error.tsx) continue ;;
  esac
  if ! grep -q "export const runtime\s*=\s*['\"]edge['\"]" "$file"; then
    MISSING_RUNTIME+="$file\n"
  fi
done < <(find app -type f \( -name "page.tsx" -o -name "route.ts" \) 2>/dev/null)
if [ -n "$MISSING_RUNTIME" ]; then
  record "Edge runtime 宣言漏れ (rule: export const runtime = 'edge')" "$(printf "%b" "$MISSING_RUNTIME")"
fi

# ---------- 7. サーバーサイドで supabase (admin ではない) 使用 ----------
# app/api と lib/services は supabaseAdmin を使うべき
HITS=$(grep -rEn "from ['\"]@/lib/supabase['\"].*\{[^}]*\bsupabase\b[^A]" \
  --include="*.ts" app/api lib/services 2>/dev/null | grep -v supabaseAdmin || true)
if [ -n "$HITS" ]; then
  record "サーバーサイドで supabase (非 admin) を import (rule: supabaseAdmin を使用)" "$HITS"
fi

# ---------- 8. .select('*') の使用 (app/api, lib) ----------
# { count: 'exact', head: true } は合法 (データを取得しない count-only クエリ) のため除外
HITS=$(grep -rEn "\.select\(\s*['\"]\*['\"]" \
  --include="*.ts" app/api lib 2>/dev/null \
  | grep -v "head:\s*true" || true)
if [ -n "$HITS" ]; then
  record ".select('*') 使用 (rule: 必要カラムのみ明示指定 / count-only は head:true 必須)" "$HITS"
fi

# ---------- 9. OAuthログインのメール一致による暗黙リンク ----------
HITS=$(grep -nE "\.eq\(\s*['\"]email['\"]" lib/auth.ts 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "OAuthログインのメール一致リンク (rule: provider + provider_account_id のみで照合)" "$HITS"
fi

# ---------- 10. ヘッダー用アバターvisualの過大サイズ ----------
# 44-48pxヘッダー内ではvisualを32px基準にし、44pxはタップ領域として確保する
HITS=$(perl -0777 -ne 'print "$ARGV\n" if /<UserAvatar\b[^>]*\bsize=["'\'']md-lg["'\'']/s' \
  components/layout/UserMenu.tsx 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "UserMenuでmd-lg avatar使用 (rule: header visualはsm=32px)" "$HITS"
fi

# ---------- 11. 通知バッジの負座標配置 ----------
HITS=$(grep -nE "className=['\"][^'\"]*absolute[^'\"]*(-top-|-right-)" components/layout/NotificationBell.tsx 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "NotificationBell badgeの負座標 (rule: header rect内へ配置)" "$HITS"
fi
if ! grep -q -- '--color-danger-solid:' app/globals.css || \
   ! grep -q 'bg-\[var(--color-danger-solid)\]' components/layout/NotificationBell.tsx; then
  record "NotificationBell badgeの塗り面専用danger token欠落" "globals.css / NotificationBell.tsx"
fi

# ---------- 12. 主要認証UIの12px未満テキスト ----------
HITS=$(grep -En "text-\[(8|9|10|11)px\]" \
  components/layout/BottomNavBar.tsx \
  components/layout/NotificationBell.tsx \
  components/dashboard/HomeHero.tsx \
  components/dashboard/DailyMissions.tsx 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "主要認証UIに12px未満テキスト (rule: text-xs以上)" "$HITS"
fi

# ---------- 13. 認証ページsticky headerの共通契約 ----------
HITS=$(grep -rEn '<header className="[^"]*sticky top-0' \
  --include="page.tsx" 'app/[locale]' 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "sticky auth headerにdata-auth-header欠落 (rule: 共通App Shell契約)" "$HITS"
fi

# ---------- 14. CRLFを許容した差分空白検査 ----------
HITS=$(git -c core.whitespace=cr-at-eol diff --check 2>&1 || true)
if [ -n "$HITS" ]; then
  record "未ステージ差分の空白違反 (CRLF許容)" "$HITS"
fi
HITS=$(git -c core.whitespace=cr-at-eol diff --cached --check 2>&1 || true)
if [ -n "$HITS" ]; then
  record "ステージ済み差分の空白違反 (CRLF許容)" "$HITS"
fi

# ---------- 15. root縦スクロールコンテナ化 ----------
HITS=$(perl -0777 -ne '
  print "html overflow-y:auto\n" if /(?:^|\n)html\s*\{[^}]*overflow-y:\s*auto/s;
  print "body overflow-y:auto\n" if /(?:^|\n)body\s*\{[^}]*overflow-y:\s*auto/s;
' app/globals.css 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "root overflow-y:auto (rule: viewport自然スクロールを維持)" "$HITS"
fi

# ---------- 16. 認証ホームの実データrichness / quest story ----------
for REQUIRED_PANEL in HomeHero QuickActions WeeklyPulsePanel RewardWalletPanel LeaderboardPreviewPanel DashboardFollowing; do
  if ! grep -q "<${REQUIRED_PANEL}" 'app/[locale]/page.tsx'; then
    record "認証ホームの${REQUIRED_PANEL}欠落 (rule: 時系列+蓄積状態でrichnessを担保)" "app/[locale]/page.tsx"
  fi
done

STORY_LINE=$(grep -n '<HomeHero' 'app/[locale]/page.tsx' | head -1 | cut -d: -f1)
for SOCIAL_COMPONENT in LeaderboardPreviewPanel DashboardFollowing; do
  SOCIAL_DETAIL_LINE=$(grep -n "<${SOCIAL_COMPONENT}" 'app/[locale]/page.tsx' | head -1 | cut -d: -f1)
  if [ -n "$STORY_LINE" ] && [ -n "$SOCIAL_DETAIL_LINE" ] && [ "$STORY_LINE" -gt "$SOCIAL_DETAIL_LINE" ]; then
    record "認証ホームの${SOCIAL_COMPONENT}がquest storyより先" "app/[locale]/page.tsx"
  fi
done
QUEST_PROGRESS_LINE=$(grep -n 'data-story-step="progress"' components/dashboard/HomeHero.tsx | head -1 | cut -d: -f1)
QUEST_COMPETITION_LINE=$(grep -n 'data-story-step="competition"' components/dashboard/HomeHero.tsx | head -1 | cut -d: -f1)
QUEST_REWARD_LINE=$(grep -n 'data-story-step="reward"' components/dashboard/HomeHero.tsx | head -1 | cut -d: -f1)
QUEST_NEXT_LINE=$(grep -n 'data-story-step="next"' components/dashboard/HomeHero.tsx | head -1 | cut -d: -f1)
if [ -z "$QUEST_PROGRESS_LINE" ] || [ -z "$QUEST_COMPETITION_LINE" ] || [ -z "$QUEST_REWARD_LINE" ] || [ -z "$QUEST_NEXT_LINE" ] || \
   [ "$QUEST_PROGRESS_LINE" -ge "$QUEST_COMPETITION_LINE" ] || [ "$QUEST_COMPETITION_LINE" -ge "$QUEST_REWARD_LINE" ] || [ "$QUEST_REWARD_LINE" -ge "$QUEST_NEXT_LINE" ]; then
  record "Home quest storyの情報順序違反 (進捗→競争→報酬→次行動)" "components/dashboard/HomeHero.tsx"
fi
if grep -q '<NextActionCard' 'app/[locale]/page.tsx'; then
  record "Home quest story外の重複NextActionCard" "app/[locale]/page.tsx"
fi
if ! grep -q 'home-action-dock' components/dashboard/QuickActions.tsx || \
   ! grep -q 'prefers-reduced-motion: reduce' app/globals.css || \
   ! grep -q 'home-quest-ring' app/globals.css; then
  record "Home delight dock/motion/reduced-motion契約欠落" "QuickActions.tsx / globals.css"
fi
if ! grep -q '<QuickActions' 'app/[locale]/page.tsx'; then
  record "Homeの常設Utility Dock欠落" "app/[locale]/page.tsx"
fi
MISSIONS_GET_BLOCK=$(sed -n '/export async function GET()/,/^export async function POST/p' app/api/user/missions/route.ts)
if printf '%s' "$MISSIONS_GET_BLOCK" | grep -Eq '\.insert\(|\.update\(|completeMissionAndReward|awardAllCompletedBonus|generateDailyMissions'; then
  record "Mission GETに状態変更処理 (rule: GETは参照専用)" "app/api/user/missions/route.ts"
fi
if ! grep -q "const res = await fetch('/api/user/missions');" components/dashboard/DailyMissions.tsx || \
   ! grep -q "t('prepare')" components/dashboard/DailyMissions.tsx; then
  record "Mission初期GET/明示準備CTA契約欠落" "components/dashboard/DailyMissions.tsx"
fi
if grep -Rqs 'duration-700' 'app/[locale]/page.tsx' components/dashboard/DashboardChallenges.tsx components/dashboard/DashboardFollowing.tsx; then
  record "Home進捗motionが650ms超過" "Home dashboard progress components"
fi
if ! grep -q 'leaderboardPreviewOpenSlot' 'app/[locale]/page.tsx' || \
   ! grep -q 'questRewardStart' components/dashboard/HomeHero.tsx; then
  record "Home低活動時の未来志向表現欠落" "HomeHero / LeaderboardPreview"
fi
if grep -A8 'leaderboard-preview-empty-' 'app/[locale]/page.tsx' | grep -q 'aria-hidden="true"'; then
  record "Homeランキング励まし行がAX treeから除外" "app/[locale]/page.tsx"
fi
if ! grep -q 'aria-valuetext={todayProgressLabel}' components/dashboard/HomeHero.tsx || \
   ! grep -q 'aria-label={t('\''questProgress'\'')}' components/dashboard/HomeHero.tsx; then
  record "Home Quest progressbarの単一読み上げ契約欠落" "components/dashboard/HomeHero.tsx"
fi
if ! grep -q 'const isGoalComplete = todaySteps >= normalizedStepGoal' components/dashboard/HomeHero.tsx || \
   ! grep -q 'href="/leaderboard?period=WEEKLY"' components/dashboard/HomeHero.tsx || \
   ! grep -q "const period: Period = isRankingPeriod(requestedPeriod) ? requestedPeriod : 'WEEKLY'" components/dashboard/DynamicLeaderboard.tsx; then
  record "Home Quest完了判定/週次競争文脈の契約欠落" "HomeHero / DynamicLeaderboard"
fi
if grep -Eq "href: '/(groups|challenges|leaderboard|shop|wallet)'" components/dashboard/QuickActions.tsx || \
   ! grep -q "href: '/analytics'" components/dashboard/QuickActions.tsx || \
   ! grep -q "href: '/recommendations'" components/dashboard/QuickActions.tsx || \
   ! grep -q "href: '/groups/create'" components/dashboard/QuickActions.tsx || \
   ! grep -q "href: '/settings'" components/dashboard/QuickActions.tsx || \
   ! grep -q "t('linkBuilder')" components/dashboard/QuickActions.tsx; then
  record "Home Utility DockがBottomNav/Sidebarと重複" "components/dashboard/QuickActions.tsx"
fi
if grep -q 'md:grid-cols-2 xl:grid-cols-4' 'app/[locale]/page.tsx' || \
   ! grep -q '2xl:grid-cols-4' 'app/[locale]/page.tsx'; then
  record "Sidebar後1280pxでHomeカードを4列へ過圧縮" "app/[locale]/page.tsx"
fi
if ! grep -q 'home-module-grid.*items-stretch' 'app/[locale]/page.tsx' || \
   grep -q 'home-module-grid.*items-start' 'app/[locale]/page.tsx' || \
   ! grep -q 'block-size: 100%' app/globals.css; then
  record "Home同一grid行のパネル等高契約欠落" "app/[locale]/page.tsx / app/globals.css"
fi
if ! grep -q 'home-week-chart' 'app/[locale]/page.tsx' || \
   ! grep -q '@container home-analysis (min-width: 20rem)' app/globals.css || \
   ! grep -q 'activity-graph-plot' components/ActivityGraph.tsx || \
   ! grep -q '@container activity-graph (min-width: 39rem)' app/globals.css; then
  record "Home/Profileグラフのcontainer幅連動契約欠落" "Home WeeklyPulse / ActivityGraph / globals.css"
fi
if ! grep -q 'home-social-grid.*items-stretch' 'app/[locale]/page.tsx' || \
   ! grep -q 'QuickActions className="mb-3"' 'app/[locale]/page.tsx' || \
   grep -q 'home-social-stack' 'app/[locale]/page.tsx' || \
   ! grep -q 'DashboardFollowing className="home-friend-panel xl:h-full"' 'app/[locale]/page.tsx' || \
   ! grep -q 'auto-rows-fr gap-2' components/dashboard/DashboardFollowing.tsx || \
   ! grep -q 'className="flex flex-1 flex-col"' components/dashboard/DashboardFollowing.tsx; then
  record "Home独立Dock/社会パネル下端整列/余剰行配分契約欠落" "Home social grid / QuickActions / DashboardFollowing"
fi
if ! grep -q 'missingActivityCount = Math.max(0, 5 - following.length)' components/dashboard/DashboardFollowing.tsx || \
   ! grep -q 'friend-discovery-' components/dashboard/DashboardFollowing.tsx || \
   ! grep -q 'w-full min-w-0 max-w-full' components/dashboard/DashboardFollowing.tsx || \
   ! grep -q 'home-friend-list.*auto-rows-fr.*xl:gap-3' components/dashboard/DashboardFollowing.tsx || \
   ! grep -q 'xl:max-h-\[4.5rem\]' components/dashboard/DashboardFollowing.tsx || \
   ! node -e '
const fs = require("fs");
const ts = require("typescript");
const file = process.argv[1];
const source = fs.readFileSync(file, "utf8");
const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const attr = (element, name) => {
  const match = element.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText(root) === name,
  );
  if (!match) return undefined;
  if (!match.initializer) return true;
  return ts.isStringLiteral(match.initializer) ? match.initializer.text : undefined;
};
const markers = [];
const collectMarkers = (node) => {
  if (
    ts.isJsxElement(node)
    && node.openingElement.tagName.getText(root) === "span"
    && attr(node.openingElement, "data-friend-avatar") === true
  ) {
    markers.push(node);
  }
  ts.forEachChild(node, collectMarkers);
};
collectMarkers(root);
if (markers.length !== 1 || attr(markers[0].openingElement, "aria-hidden") !== "true") process.exit(1);
const avatars = [];
const collectAvatars = (node) => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(root) === "UserAvatar") avatars.push(node);
  ts.forEachChild(node, collectAvatars);
};
collectAvatars(markers[0]);
if (avatars.length !== 1 || attr(avatars[0], "alt") !== "") process.exit(1);
' components/dashboard/DashboardFollowing.tsx; then
  record "Home少数フォロー時の5行密度/長名リフロー契約欠落" "components/dashboard/DashboardFollowing.tsx"
fi
if ! grep -q '2xl:items-stretch' components/dashboard/DynamicLeaderboard.tsx || \
   grep -q 'className="flex flex-col gap-4 lg:grid lg:grid-cols-12' components/dashboard/DynamicLeaderboard.tsx; then
  record "Leaderboardの2xl境界/同一行パネル下端整列契約欠落" "components/dashboard/DynamicLeaderboard.tsx"
fi
if ! grep -q 'export function getRankGapInsight' lib/services/ranking-utils.ts || \
   ! grep -q 'export function getRankProgress' lib/services/ranking-utils.ts || \
   ! grep -q 'targetEntry.steps - currentEntry.steps + 1' lib/services/ranking-utils.ts || \
   ! grep -q 'targetName: string | null' lib/services/ranking-utils.ts || \
   ! grep -q 'leaderStepsGap: number' lib/services/ranking-utils.ts || \
   ! grep -q 'totalCount: number' lib/services/ranking-utils.ts || \
   ! grep -q 'currentEntry.steps <= 0' lib/services/ranking-utils.ts || \
   ! grep -q 'originalRank: index + 1' lib/services/ranking-service.ts || \
   ! grep -Fq '.filter(entry => entry.steps > 0)' lib/services/ranking-utils.ts || \
   ! grep -Fq '.filter(entry => entry.steps > 0)' lib/services/ranking-service.ts || \
   [ "$(grep -Fc 'getDisplayRankings(' components/dashboard/DynamicLeaderboard.tsx)" -ne 2 ] || \
   [ "$(grep -Fc ', userId, 5)' components/dashboard/DynamicLeaderboard.tsx)" -ne 2 ] || \
   ! grep -q 'href="/leaderboard?period=WEEKLY"' 'app/[locale]/page.tsx' || \
   ! grep -q 'data-rank-gap="global"' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'getRankProgress(' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'data-rank-gap="group"' components/group/GroupRankingPanel.tsx || \
   ! grep -q 'data-rank-gap="group-detail"' components/group/GroupDetailLeaderboard.tsx; then
  record "Homeから詳細ランキングへの到達可能差継続契約欠落" "ranking-utils / ranking components"
fi
if ! grep -q 'role="group"' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'aria-pressed={isActive}' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'role="status"' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'aria-busy={isLoading}' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'ranking-filter-button' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q '.ranking-filter-button:focus-visible' app/globals.css || \
   ! grep -q 'var(--color-primary-solid)' components/dashboard/DynamicLeaderboard.tsx || \
   grep -q 'ranking-filter-button[^`]*transition-all' components/dashboard/DynamicLeaderboard.tsx || \
   grep -q 'order-2 lg:order-1' components/dashboard/DynamicLeaderboard.tsx || \
   grep -q 'role="tab"' components/dashboard/DynamicLeaderboard.tsx; then
  record "Leaderboard期間フィルターのボタン群セマンティクス欠落" "components/dashboard/DynamicLeaderboard.tsx"
fi
if ! grep -q 'aria-label={lt('\''periodTabsLabel'\'')}' components/group/GroupAnalytics.tsx || \
   ! grep -q 'aria-pressed={isActive}' components/group/GroupAnalytics.tsx || \
   ! grep -q 'min-h-\[44px\]' components/group/GroupAnalytics.tsx || \
   ! grep -q 'role="status"' components/group/GroupAnalytics.tsx || \
   ! grep -q 'ranking-filter-button' components/group/GroupAnalytics.tsx || \
   ! grep -q 'var(--color-primary-solid)' components/group/GroupAnalytics.tsx || \
   grep -q 'ranking-filter-button[^`]*transition-all' components/group/GroupAnalytics.tsx; then
  record "グループ詳細期間フィルターの44px/状態通知契約欠落" "components/group/GroupAnalytics.tsx"
fi
if grep -q 'const total = allData.reduce' components/group/GroupAnalytics.tsx || \
   ! grep -Fq 'periodGroupRankings?.[idx]?.averageSteps' components/group/GroupAnalytics.tsx || \
   grep -Fq 'allData.length === 0 ?' components/group/GroupAnalytics.tsx || \
   ! grep -q 'data-group-detail-ranking' components/group/GroupDetailLeaderboard.tsx || \
   ! grep -q 'const showNoData = displayData.length === 0 && index === 0' components/group/GroupDetailLeaderboard.tsx; then
  record "グループ詳細の全員0歩固定5行/全メンバー平均契約欠落" "GroupAnalytics / GroupDetailLeaderboard"
fi
if ! grep -Fq '.ranking-filter-button[aria-pressed="true"]' app/globals.css || \
   ! grep -q 'background: Highlight !important' app/globals.css || \
   ! grep -q 'color: HighlightText !important' app/globals.css || \
   ! grep -q 'background: Canvas !important' app/globals.css || \
   ! grep -q 'color: CanvasText !important' app/globals.css; then
  record "ランキングfilterのForced Colors選択状態欠落" "app/globals.css"
fi
if ! grep -q 'data-ranking-state="global-error"' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'data-ranking-state="group-error"' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'data-ranking-state="group-empty"' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q '!isLoading && groupFetchError && groupRankingsList.length === 0 ?' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q '!isLoading && groupFetchError && groupRankingsList.length > 0' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'Promise.allSettled' components/dashboard/DynamicLeaderboard.tsx || \
   [ "$(grep -o 'onClick={handleRetry}' components/dashboard/DynamicLeaderboard.tsx | wc -l | tr -d ' ')" -lt 2 ]; then
  record "ランキング取得失敗と未所属空状態の分離契約欠落" "components/dashboard/DynamicLeaderboard.tsx"
fi
if ! grep -q '!isLoading && !fetchError && myRankGapInsight' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q "t('missionChaseAnonymous'" components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'friendProgressReached' components/dashboard/DashboardFollowing.tsx || \
   ! grep -q 'user.todaySteps > 0' components/dashboard/DashboardFollowing.tsx; then
  record "Home/Rankingの状態別読み上げ・匿名ライバル・0歩活動除外契約欠落" "DynamicLeaderboard / DashboardFollowing"
fi
if ! grep -q 'export function isRankingPeriod' lib/services/ranking-utils.ts || \
   ! grep -q 'export function buildRankingPeriodQuery' lib/services/ranking-utils.ts || \
   ! grep -Fq 'router.replace(`${pathname}?${query}`, { scroll: false })' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -Fq 'router.replace(`${pathname}?${query}`, { scroll: false })' components/group/GroupAnalytics.tsx || \
   ! grep -q "isRankingPeriod(requestedPeriod) ? requestedPeriod : 'WEEKLY'" components/group/GroupAnalytics.tsx || \
   ! grep -q "isRankingPeriod(requestedPeriod) ? requestedPeriod : 'WEEKLY'" components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q "labelKey: 'periods.daily'" components/group/GroupAnalytics.tsx || \
   ! grep -q 'period={period}' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'period: Period' components/group/GroupRankingPanel.tsx; then
  record "ランキング期間のURL/表示/リアクション共有契約欠落" "ranking-utils / DynamicLeaderboard / GroupAnalytics / GroupRankingPanel"
fi
analytics_line="$(grep -n '<GroupAnalytics' 'app/[locale]/groups/[groupId]/page.tsx' | head -n 1 | cut -d: -f1)"
events_line="$(grep -n '<GroupEventList' 'app/[locale]/groups/[groupId]/page.tsx' | head -n 1 | cut -d: -f1)"
if [ -z "$analytics_line" ] || [ -z "$events_line" ] || [ "$analytics_line" -ge "$events_line" ] || \
   ! grep -q 'id="group-analytics-title"' components/group/GroupAnalytics.tsx || \
   ! grep -q "daily.*今日の参考：過去7日間の推移" messages/ja.json || \
   ! grep -q "daily.*For today: 7-day trend" messages/en.json; then
  record "グループ期間filterの発見性/時間軸説明契約欠落" "Group detail page / GroupAnalytics / messages"
fi
if ! grep -q "href: '/leaderboard?period=WEEKLY' as const" components/layout/BottomNavBar.tsx || \
   ! grep -q "const itemPath = item.href.split('?')\\[0\\]" components/layout/BottomNavBar.tsx; then
  record "主要ランキング導線の週次文脈/active判定契約欠落" "BottomNav"
fi
if ! grep -q "color: isActive ? '#ffffff' : 'var(--color-text-muted)'" components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q "border: isActive ? '2px solid var(--color-text)'" components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q "border: isActive ? '2px solid var(--color-text)'" components/group/GroupAnalytics.tsx || \
   [ "$(grep -o 'aria-hidden=\"true\">✓' components/dashboard/DynamicLeaderboard.tsx | wc -l | tr -d ' ')" -lt 2 ] || \
   ! grep -q 'aria-hidden="true">✓' components/group/GroupAnalytics.tsx; then
  record "ランキング期間filterのMidnight contrast/非色選択表示欠落" "DynamicLeaderboard / GroupAnalytics"
fi
if ! grep -q 'const requestedPeriodRef = useRef<Period>(period)' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'const requestedPeriodRef = useRef<Period>(period)' components/group/GroupAnalytics.tsx || \
   ! grep -q 'requestedPeriodRef.current = newPeriod' components/dashboard/DynamicLeaderboard.tsx || \
   ! grep -q 'requestedPeriodRef.current = newPeriod' components/group/GroupAnalytics.tsx || \
   grep -A6 'const handlePeriodChange' components/dashboard/DynamicLeaderboard.tsx | grep -q 'setIsLoading'; then
  record "ランキング期間の連続操作で最新要求を保持する契約欠落" "DynamicLeaderboard / GroupAnalytics"
fi
if ! grep -Fq 'searchParams: Promise<{ period?: string | string[] }>' 'app/[locale]/leaderboard/page.tsx' || \
   ! grep -Fq 'searchParams: Promise<{ period?: string | string[] }>' 'app/[locale]/groups/[groupId]/page.tsx' || \
   ! grep -q 'isRankingPeriod(requestedPeriod)' 'app/[locale]/leaderboard/page.tsx' || \
   ! grep -q 'isRankingPeriod(requestedPeriod)' 'app/[locale]/groups/[groupId]/page.tsx' || \
   ! grep -Fq '`/leaderboard?period=${requestedPeriod}`' 'app/[locale]/leaderboard/page.tsx' || \
   ! grep -Fq '`${groupPath}?period=${requestedPeriod}`' 'app/[locale]/groups/[groupId]/page.tsx'; then
  record "未認証ランキングURLの検証済みperiod復元契約欠落" "Leaderboard / Group detail pages"
fi
if ! grep -q 'const abortController = new AbortController()' hooks/useGroupReactions.ts || \
   ! grep -Fq 'setReactions([])' hooks/useGroupReactions.ts || \
   ! grep -q 'signal: abortController.signal' hooks/useGroupReactions.ts || \
   ! grep -q 'return () => abortController.abort()' hooks/useGroupReactions.ts || \
   ! grep -q 'period: Period' hooks/useGroupReactions.ts || \
   ! grep -q 'const periodRef = useRef<Period>(period)' hooks/useGroupReactions.ts || \
   ! grep -q 'const periodGenerationRef = useRef(0)' hooks/useGroupReactions.ts || \
   ! grep -q 'periodGenerationRef.current === requestGeneration' hooks/useGroupReactions.ts || \
   grep -q 'renderedPeriodRef' hooks/useGroupReactions.ts || \
   ! grep -q 'periodGenerationRef.current += 1' hooks/useGroupReactions.ts || \
   [ "$(grep -o 'prev.some(reaction => reaction.id === removed.id)' hooks/useGroupReactions.ts | wc -l | tr -d ' ')" -lt 2 ] || \
   ! grep -q 'data-reaction-count={reactions.length}' components/group/GroupDetailLeaderboard.tsx; then
  record "期間切替時の旧リアクション隔離契約欠落" "hooks/useGroupReactions.ts"
fi
if [ "$(grep -Fo 'bg-[var(--color-primary-solid)]' components/dashboard/DynamicLeaderboard.tsx | wc -l | tr -d ' ')" -lt 2 ] || \
   ! grep -Fq 'bg-[var(--color-primary-solid)] text-white' components/group/GroupAnalytics.tsx || \
   grep -q 'ranking-filter-button[^`]*transition-colors' components/dashboard/DynamicLeaderboard.tsx || \
   grep -q 'ranking-filter-button[^`]*transition-colors' components/group/GroupAnalytics.tsx || \
   ! grep -q 'href="#group-gear"' components/group/GroupAnalytics.tsx || \
   ! grep -q 'id="group-gear"' 'app/[locale]/groups/[groupId]/page.tsx' || \
   ! grep -q 'data-group-gear-empty' components/group/GroupGear.tsx || \
   ! grep -q "if (!res.ok) throw new Error('fetch failed')" components/group/GroupGear.tsx || \
   ! grep -q 'data-group-gear-error' components/group/GroupGear.tsx || \
   [ "$(grep -o 'className=\"inline-flex h-11 w-11' components/group/GroupGear.tsx | wc -l | tr -d ' ')" -lt 2 ] || \
   ! grep -q "aria-label={t('scrollLeft')}" components/group/GroupGear.tsx || \
   ! grep -q "aria-label={t('scrollRight')}" components/group/GroupGear.tsx || \
   ! grep -q 'この期間のグループ活動はまだありません' messages/ja.json || \
   ! grep -q 'No group activity for this period yet' messages/en.json; then
  record "ランキングfilter全テーマcontrast/ギア導線/期間中立空状態契約欠落" "Ranking UI / Group detail / messages"
fi
if ! grep -q 'className="flex" aria-hidden="true"' components/ActivityGraph.tsx || \
   ! grep -q '<div className="sr-only">' components/ActivityGraph.tsx || \
   ! grep -q 'tabIndex={-1}' components/ActivityGraph.tsx || \
   ! grep -q 'activity-graph-goal-line' components/ActivityGraph.tsx || \
   ! grep -q '.activity-graph-bar' app/globals.css; then
  record "Profileグラフの代替表/clip/Forced Colors契約欠落" "ActivityGraph.tsx / globals.css"
fi
if ! grep -q 'rankedOpenSlots' 'app/[locale]/page.tsx'; then
  record "ランキング済みユーザーへ未参加向け空き行文言を表示" "app/[locale]/page.tsx"
fi
if ! grep -q 'hasWeeklyStepRecord' 'app/[locale]/page.tsx' || \
   ! grep -q 'recordedOpenSlots' 'app/[locale]/page.tsx'; then
  record "記録済み0歩へ同期要求コピーを表示" "app/[locale]/page.tsx"
fi
if ! grep -q 'class MissionRewardWriteError' app/api/user/missions/route.ts || \
   ! grep -q "code: 'MISSION_REWARD_DATABASE_ERROR'" app/api/user/missions/route.ts; then
  record "Mission報酬書き込み失敗を成功応答へ変換" "app/api/user/missions/route.ts"
fi
if ! grep -q 'MissionAnnouncement message={announcement}' components/dashboard/DailyMissions.tsx || \
   ! grep -q 'missionHeadingRef.current?.focus()' components/dashboard/DailyMissions.tsx || \
   ! grep -q "t('bonusEarned'" components/dashboard/DailyMissions.tsx || \
   ! grep -q "t('streakUnavailable')" components/dashboard/DailyMissions.tsx; then
  record "Mission状態遷移のlive通知/焦点移動/永続報酬表示欠落" "components/dashboard/DailyMissions.tsx"
fi
MISSIONS_FETCH_BLOCK=$(sed -n '/const fetchMissions = useCallback/,/}, \[\]);/p' components/dashboard/DailyMissions.tsx)
if ! printf '%s' "$MISSIONS_FETCH_BLOCK" | grep -q 'setIsLoading(true)'; then
  record "Mission GET再試行中に準備POSTを露出" "components/dashboard/DailyMissions.tsx"
fi
if ! grep -q 'streakUnavailable: streak === null' app/api/user/missions/route.ts || \
   ! grep -q "reportError('user/missions:streak'" app/api/user/missions/route.ts; then
  record "MissionストリークDB障害を0へ偽装" "app/api/user/missions/route.ts"
fi
if grep -q 'if (!pRes.ok) return \[c.id, 0\]' components/dashboard/DashboardChallenges.tsx || \
   ! grep -q 'progressUnavailable = challenge.is_joined && progressValue === null' components/dashboard/DashboardChallenges.tsx; then
  record "Challenge進捗取得失敗を0歩へ変換" "components/dashboard/DashboardChallenges.tsx"
fi
if grep -q '0.01ms' app/globals.css; then
  record "reduced motionがcomputed 0秒でない" "app/globals.css"
fi
if ! grep -q "document.addEventListener('focusin', keepFocusedControlVisible)" components/layout/BottomNavBar.tsx; then
  record "BottomNavによるfocus遮蔽補正欠落" "components/layout/BottomNavBar.tsx"
fi
if ! grep -q 'challenge-participant-enter' components/challenge/ChallengeDetailModal.tsx || \
   ! grep -q '.challenge-participant-enter' app/globals.css; then
  record "reduced motion時のChallenge参加者表示契約欠落" "ChallengeDetailModal / globals.css"
fi
FEED_ROW_BLOCK=$(sed -n '/function FeedItemRow(/,$p' components/layout/NotificationBell.tsx)
if [ "$(printf '%s' "$FEED_ROW_BLOCK" | grep -c '<Link')" -gt 1 ]; then
  record "Notification行に重複リンク" "components/layout/NotificationBell.tsx"
fi
if ! grep -q 'LEADERBOARD_PREVIEW_MIN_ROWS = 5' 'app/[locale]/page.tsx'; then
  record "認証ホームランキングの最低5行契約欠落" "app/[locale]/page.tsx"
fi
if ! grep -q 'leaderboard-row group relative flex min-h-\[4.5rem\] flex-col justify-center' 'app/[locale]/page.tsx'; then
  record "認証ホームランキング行の固定レイアウト契約欠落" "app/[locale]/page.tsx"
fi
if grep -Eq 'following\.map\(\(user, index\)|\{index \+ 1\}' components/dashboard/DashboardFollowing.tsx; then
  record "friend activityの順位表化 (rule: social activityとrankingを重複させない)" "components/dashboard/DashboardFollowing.tsx"
fi
if grep -q 'maxSteps' components/dashboard/DashboardFollowing.tsx; then
  record "friend activityの他者最大値基準bar (rule: social activityを相対順位化しない)" "components/dashboard/DashboardFollowing.tsx"
fi
if ! grep -q '/api/user/following?limit=5&sort=recent' components/dashboard/DashboardFollowing.tsx; then
  record "ホームfollowing APIのサーバー側limit欠落" "components/dashboard/DashboardFollowing.tsx"
fi
if grep -Eq 'id="friend-pulse-title"[^>]*truncate' components/dashboard/DashboardFollowing.tsx; then
  record "friend activity見出しの切り詰め (rule: モバイルで主要見出しを省略しない)" "components/dashboard/DashboardFollowing.tsx"
fi
if grep -Eq 'aria-label=\{[^}]*profile(Label|LinkLabel)' 'app/[locale]/page.tsx' components/dashboard/DashboardFollowing.tsx; then
  record "プロフィール行のaria-label上書き (rule: 可視の名前・歩数をaccessible nameへ残す)" "認証ホーム"
fi
for REQUIRED_STATE in 'error: usersErr' 'error: todayStepsErr' 'hasTodaySteps:'; do
  if ! grep -q "$REQUIRED_STATE" app/api/user/following/route.ts; then
    record "following APIの状態分離契約欠落: ${REQUIRED_STATE}" "app/api/user/following/route.ts"
  fi
done
if ! grep -q 'requestedLimit !== null && sort === "recent"' app/api/user/following/route.ts; then
  record "following APIのlimit/sort順序契約欠落" "app/api/user/following/route.ts"
fi

# ---------- 17. 認証ページの共通ヘッダー / PageIntro ----------
AUTH_HEADER_FILES=(
  'app/[locale]/analytics/page.tsx'
  'app/[locale]/challenges/page.tsx'
  'app/[locale]/groups/page.tsx'
  'app/[locale]/groups/[groupId]/page.tsx'
  'app/[locale]/groups/create/page.tsx'
  'app/[locale]/leaderboard/page.tsx'
  'app/[locale]/recommendations/page.tsx'
  'app/[locale]/settings/page.tsx'
  'app/[locale]/shop/page.tsx'
  'app/[locale]/user/[username]/page.tsx'
  'app/[locale]/wallet/page.tsx'
)
for file in "${AUTH_HEADER_FILES[@]}"; do
  if ! grep -q '<AuthenticatedPageHeader' "$file"; then
    record "標準認証ページの共通ヘッダー欠落" "$file"
  fi
done

PAGE_INTRO_FILES=(
  'app/[locale]/analytics/page.tsx'
  'app/[locale]/challenges/page.tsx'
  'app/[locale]/groups/page.tsx'
  'app/[locale]/leaderboard/page.tsx'
  'app/[locale]/recommendations/page.tsx'
  'app/[locale]/settings/page.tsx'
  'app/[locale]/shop/page.tsx'
  'app/[locale]/user/[username]/page.tsx'
  'app/[locale]/wallet/page.tsx'
  'app/[locale]/groups/create/page.tsx'
)
for file in "${PAGE_INTRO_FILES[@]}"; do
  if ! grep -q '<PageIntro' "$file"; then
    record "標準認証ページの共通PageIntro欠落" "$file"
  fi
  if ! grep -q 'headingId=' "$file"; then
    record "標準認証ページのPageIntro headingId欠落" "$file"
  fi
done
if ! grep -q '<h1' components/group/JoinGroupPreview.tsx; then
  record "グループ非メンバー画面のh1欠落" "components/group/JoinGroupPreview.tsx"
fi
if grep -q '<h1' components/ShopClient.tsx; then
  record "ShopClientの重複h1 (rule: PageIntroを唯一のh1にする)" "components/ShopClient.tsx"
fi
if ! grep -q "username = userResult.error ? '' : (userData?.username || '')" 'app/[locale]/page.tsx'; then
  record "Home障害時のプロフィールリンク静的化欠落" "app/[locale]/page.tsx"
fi
if ! grep -q 'username: userResult.error ? null : userData?.username' 'app/[locale]/groups/page.tsx'; then
  record "Groups障害時のプロフィールリンク静的化欠落" "app/[locale]/groups/page.tsx"
fi
VIEWER_STEPS_ERROR_BLOCK=$(sed -n '/if (vDataResult.error)/,/^[[:space:]]*}/p' 'app/[locale]/user/[username]/page.tsx')
if ! printf '%s' "$VIEWER_STEPS_ERROR_BLOCK" | grep -q "reportError('profile:viewer-steps'"; then
  record "プロフィール閲覧者歩数DBエラーのreportError欠落" "app/[locale]/user/[username]/page.tsx"
fi
if ! printf '%s' "$VIEWER_STEPS_ERROR_BLOCK" | grep -q "throw new Error('Failed to load profile viewer steps')"; then
  record "プロフィール閲覧者歩数DBエラーの伝播欠落" "app/[locale]/user/[username]/page.tsx"
fi
if ! grep -q 'const profileHref = user.username' components/layout/UserMenu.tsx || \
   ! grep -q '{profileHref ? (' components/layout/UserMenu.tsx; then
  record "UserMenuのusername欠落時プロフィールリンク静的化欠落" "components/layout/UserMenu.tsx"
fi

# ---------- 18. プロフィールcanonical導線 / グローバルoverlay ----------
if grep -q '<GlobalLoader' 'app/[locale]/layout.tsx'; then
  record "layoutに全画面GlobalLoader (rule: route loadingへ局所化)" "app/[locale]/layout.tsx"
fi
HITS=$(grep -En "href:[[:space:]]*['\"]/profile['\"]|href=['\"]/profile['\"]" \
  components/layout/BottomNavBar.tsx components/dashboard/DashboardSidebar.tsx components/layout/UserMenu.tsx 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "App Shellプロフィール導線が/profile経由 (rule: /user/{username}へ直接遷移)" "$HITS"
fi

# ---------- 19. ActivityGraphの日付水和契約 ----------
if ! grep -q 'todayDate: string' components/ActivityGraph.tsx; then
  record "ActivityGraphのServer確定日付prop欠落" "components/ActivityGraph.tsx"
fi
HITS=$(grep -nE 'new Date\(d\.fullDate\)|toLocaleString\(['\''\"]default['\''\"]' components/ActivityGraph.tsx 2>/dev/null || true)
if [ -n "$HITS" ]; then
  record "ActivityGraphに端末タイムゾーン依存の初期表示" "$HITS"
fi

# ---------- 20. 狭幅ブレイクポイント / 自然スクロール / a11y geometry ----------
if grep -q '<table className="sr-only"' components/StepCalendar.tsx; then
  record "StepCalendarのtable本体にsr-only (rule: absolute 1px wrapperで包む)" "components/StepCalendar.tsx"
fi
if ! grep -q 'xl:grid-cols-\[minmax(0,0.9fr)_minmax(30rem,1.1fr)\]' components/LandingPage.tsx || \
   grep -q 'lg:text-5xl' components/LandingPage.tsx || \
   grep -q 'details className="group lg:hidden"' components/LandingPage.tsx; then
  record "公開LPの1024px詳細展開 (rule: 複雑なHero/詳細はxlから)" "components/LandingPage.tsx"
fi
if grep -q 'lg:grid-cols-\[minmax(0,1.1fr)_minmax(260px,0.8fr)_minmax(280px,1fr)\]' 'app/[locale]/page.tsx'; then
  record "認証Homeの1024px 3列化 (rule: Sidebar後はxlから)" "app/[locale]/page.tsx"
fi
if grep -q 'flex flex-col lg:flex-row' 'app/[locale]/groups/page.tsx'; then
  record "Groupsの1024px main+aside化 (rule: xlから)" "app/[locale]/groups/page.tsx"
fi
if grep -Eq 'max-h-\[calc\(100dvh|overflow-y-auto|lg:grid-cols-4' components/ShopClient.tsx; then
  record "Shopの固定高内部スクロール/1024px 4列化" "components/ShopClient.tsx"
fi
if grep -Eq 'max-h-\[calc\(100dvh|overflow-y-auto' components/SettingsForm.tsx; then
  record "Settingsの固定高内部スクロール" "components/SettingsForm.tsx"
fi
FOOTER_STYLE_BLOCK=$(sed -n '/\.uc-auth-content :where(footer) {/,/^}/p' app/globals.css)
if printf '%s' "$FOOTER_STYLE_BLOCK" | grep -q 'display: none'; then
  record "認証Footerのモバイル非表示 (rule: 320pxから法務導線を表示)" "app/globals.css"
fi
if grep -q 'home-desktop-footer mt-auto hidden' 'app/[locale]/page.tsx'; then
  record "Home Footerのモバイル非表示" "app/[locale]/page.tsx"
fi

require_touch_target_count() {
  local file="$1"
  local minimum="$2"
  local count
  count=$(grep -o 'min-h-\[44px\]' "$file" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -lt "$minimum" ]; then
    record "44px操作領域不足: ${file} (${count}/${minimum})" "$file"
  fi
}

require_touch_target_count components/StepCalendar.tsx 3
require_touch_target_count components/dashboard/DynamicLeaderboard.tsx 3
require_touch_target_count components/challenge/ChallengeList.tsx 2
require_touch_target_count components/group/GroupList.tsx 5
require_touch_target_count components/group/GroupSettings.tsx 2
require_touch_target_count components/StreakShieldIndicator.tsx 1
require_touch_target_count components/SettingsForm.tsx 9
require_touch_target_count components/profile/AchievementProgress.tsx 2
require_touch_target_count components/profile/BadgeMuseum.tsx 1
require_touch_target_count components/RecommendedItems.tsx 13
require_touch_target_count components/TitleSelector.tsx 2
require_touch_target_count components/FrameSelector.tsx 3
require_touch_target_count components/StepGoalForm.tsx 4
require_touch_target_count components/shop/ShopItemCard.tsx 1
require_touch_target_count components/layout/Footer.tsx 5

if ! grep -q 'min-h-\[44px\] min-w-\[44px\]' components/shop/ShopItemCard.tsx; then
  record "Shop購入ボタンの44px幅不足" "components/shop/ShopItemCard.tsx"
fi
if grep -q 'w-6 h-6 rounded-full' components/RecommendedItems.tsx || \
   ! grep -q 'onFocusCapture={() => setSlideIndex(Math.min(index, maxSlide))}' components/RecommendedItems.tsx || \
   ! grep -q 'onFocus={() => setSlideIndex(maxSlide)}' components/RecommendedItems.tsx || \
   ! grep -q 'const maxTranslate = Math.max(0, trackWidth - viewportWidth)' components/RecommendedItems.tsx || \
   ! grep -q 'function ItemCommentBubble' components/RecommendedItems.tsx || \
   grep -q 'disabled={!isOwner || !isEditing}' components/RecommendedItems.tsx; then
  record "RecommendedItemsの編集操作/画面外focus契約欠落" "components/RecommendedItems.tsx"
fi
if ! grep -q 'min-h-\[44px\] min-w-\[48px\] items-center justify-center rounded-lg px-2' components/RecommendedItems.tsx; then
  record "RecommendedItemsコメント取消の44px幅不足" "components/RecommendedItems.tsx"
fi
if ! grep -q 'data-story-step="next"' components/dashboard/HomeHero.tsx || \
   ! grep -q 'href={`#${nextActionTargetId}`}' components/dashboard/HomeHero.tsx; then
  record "Home quest内の次行動ジャンプ欠落" "components/dashboard/HomeHero.tsx"
fi
if ! grep -q 'grid grid-cols-3' components/challenge/ChallengeList.tsx || \
   ! grep -q 'flex min-h-\[44px\] min-w-0 items-center justify-center' components/challenge/ChallengeList.tsx; then
  record "Challenge tabsの3等分44px中央揃え欠落" "components/challenge/ChallengeList.tsx"
fi
if grep -Eq '>[^<{]*(Retry|Save|Cancel|Edit)[^<{]*<' components/StepGoalForm.tsx components/StepCalendar.tsx components/profile/AchievementProgress.tsx; then
  record "変更対象の条件付きUIに英語固定文言" "StepGoalForm / StepCalendar / AchievementProgress"
fi
if ! grep -q '<form onSubmit={handleSubmit} noValidate' components/StepGoalForm.tsx || \
   [ "$(grep -o 'min-w-\[48px\]' components/StepGoalForm.tsx | wc -l | tr -d ' ')" -lt 2 ]; then
  record "StepGoal custom validation/48px短ラベル契約欠落" "components/StepGoalForm.tsx"
fi
if grep -Eq "'Just now'|m ago|h ago|d ago" 'app/[locale]/user/[username]/page.tsx' || \
   grep -q '>Group Name<' components/group/GroupSettings.tsx || \
   grep -Eq '>Daily<|>Weekly<' components/StepCalendar.tsx; then
  record "狭幅変更対象にja/en未対応の固定文言" "Profile / GroupSettings / StepCalendar"
fi

# ---------- 結果出力 ----------
if [ "$VIOLATIONS" -eq 0 ]; then
  echo "OK: UCFitness rule-check passed (0 violations)"
  exit 0
else
  printf "NG: %d rule violation(s) detected\n" "$VIOLATIONS"
  printf "%b\n" "$REPORT"
  exit 1
fi
