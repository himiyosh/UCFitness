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

# ---------- 16. 認証ホームの実データrichness ----------
for REQUIRED_PANEL in WeeklyPulsePanel RewardWalletPanel NextActionCard LeaderboardPreviewPanel DashboardFollowing; do
  if ! grep -q "<${REQUIRED_PANEL}" 'app/[locale]/page.tsx'; then
    record "認証ホームの${REQUIRED_PANEL}欠落 (rule: 時系列+蓄積状態でrichnessを担保)" "app/[locale]/page.tsx"
  fi
done

NEXT_ACTION_LINE=$(grep -n '<NextActionCard id=' 'app/[locale]/page.tsx' | head -1 | cut -d: -f1)
for SOCIAL_COMPONENT in LeaderboardPreviewPanel DashboardFollowing; do
  SOCIAL_DETAIL_LINE=$(grep -n "<${SOCIAL_COMPONENT}" 'app/[locale]/page.tsx' | head -1 | cut -d: -f1)
  if [ -n "$NEXT_ACTION_LINE" ] && [ -n "$SOCIAL_DETAIL_LINE" ] && [ "$NEXT_ACTION_LINE" -gt "$SOCIAL_DETAIL_LINE" ]; then
    record "認証ホームの${SOCIAL_COMPONENT}が次行動より先 (rule: 復帰ユーザーの比較圧を抑える)" "app/[locale]/page.tsx"
  fi
done
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
if ! grep -q 'focus-visible:ring-offset-2 xl:hidden' components/dashboard/HomeHero.tsx; then
  record "1024px Homeの次行動ジャンプ欠落" "components/dashboard/HomeHero.tsx"
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
