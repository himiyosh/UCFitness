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
for REQUIRED_PANEL in WeeklyPulsePanel RewardWalletPanel; do
  if ! grep -q "$REQUIRED_PANEL" 'app/[locale]/page.tsx'; then
    record "認証ホームの${REQUIRED_PANEL}欠落 (rule: 時系列+蓄積状態でrichnessを担保)" "app/[locale]/page.tsx"
  fi
done

# ---------- 結果出力 ----------
if [ "$VIOLATIONS" -eq 0 ]; then
  echo "OK: UCFitness rule-check passed (0 violations)"
  exit 0
else
  printf "NG: %d rule violation(s) detected\n" "$VIOLATIONS"
  printf "%b\n" "$REPORT"
  exit 1
fi
