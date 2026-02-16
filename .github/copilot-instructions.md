# UCFitness — GitHub Copilot 共通指示

## アプリケーション概要

UCFitness は Fitbit 連携の歩数トラッキング・フィットネス競争アプリ (PWA)。

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router), React 19, TypeScript
- **スタイリング**: Tailwind CSS v4, CSS カスタムプロパティ (テーマ)
- **認証**: NextAuth v5 (beta)
- **DB**: Supabase (PostgreSQL)
- **i18n**: next-intl (ja/en)
- **デプロイ**: Cloudflare Pages
- **チャート**: Recharts

## 絶対遵守ルール

### ブランチ保護

- **main/master への直接 push は禁止** — 必ずユーザーの明示的な承認を得ること
- **PR merge (gh pr merge, git merge) も承認なしに禁止**
- PR の作成 (`gh pr create`) までは許可

### コーディング規約

- テーマ: `var(--theme-primary)` 等の CSS カスタムプロパティを使用
- `dark:` は使用しない (テーマシステムで対応済み)
- `framer-motion` は使用しない
- 新しい外部ライブラリは追加しない
- 既存の関数・export は絶対に削除しない
- ファイル末尾には必ず改行を入れる

### React Hooks ルール（最重要 — 違反すると本番クラッシュ）

**⚠️ React Error #310 が頻発した経緯あり。以下を厳守すること。**

#### 原則

- **すべての Hooks（`useState`・`useMemo`・`useEffect`・`useCallback`・`useRef`・`useTranslations`・`useLocale` 等）は、コンポーネント内のいかなる条件付き早期 `return` よりも前に配置すること**
- React の Rules of Hooks: Hooks の呼び出し回数・順序はレンダーごとに同一でなければならない
- 条件付き `return` の後に Hooks を置くと、特定条件下で Hooks 数が変わり **本番で即クラッシュ** する

#### NG パターン（絶対禁止）

```tsx
// ❌ NG: useMemo が早期 return の後にある → 本番クラッシュ
if (loading) return <Skeleton />;
if (!data) return null;
const processed = useMemo(() => transform(data), [data]);  // ← CRASH
```

#### OK パターン

```tsx
// ✅ OK: すべての Hooks を早期 return の前に配置し、null-safe にする
const processed = useMemo(() => data ? transform(data) : defaultValue, [data]);
if (loading) return <Skeleton />;
if (!data) return null;
// ここ以降は data が確実に存在する
```

#### 実行チェックリスト（コード変更時に必ず確認）

1. **新しい Hook を追加する場合**: 既存の Hooks 群の直後、最初の `if (...) return` の前に配置する
2. **`useMemo` / `useCallback` が外部データ（`data`, `items` 等）を参照する場合**: `data ?` や `data ?? []` で null/undefined を安全にハンドリングする
3. **早期 return を追加する場合**: その return の下に Hooks が存在しないことを確認する
4. **ファイル編集後の最終確認**: ファイル内で `useMemo|useCallback|useState|useEffect|useRef` を検索し、すべてが最初の条件付き `return` より上にあることを目視確認する

### モバイルファースト設計（必須）

UCFitness は PWA であり、**モバイル端末での利用が主要ユースケース**である。  
すべての UI 変更・新規コンポーネント作成時に以下を厳守すること。

- **モバイルファースト**: まずモバイル（`w-full`, `flex-col`）でレイアウトし、`sm:` / `md:` / `lg:` で拡張する
- **最小タッチターゲット**: ボタン・リンクは最低 **44×44px** のタップ領域を確保する（`min-h-[44px] min-w-[44px]`）
- **横スクロール禁止**: `overflow-x-hidden` を意識し、`w-screen` や固定幅（`w-[500px]` 等）を使わない
- **テキストサイズ**: モバイルでは `text-sm` / `text-xs` を基本とし、`sm:text-base` 等で拡大する
- **パディング**: モバイルでは `px-4 py-3` を基本とし、`sm:px-6 lg:px-8` で拡張する
- **グリッド**: `grid-cols-1` をデフォルトとし、`sm:grid-cols-2` / `lg:grid-cols-3` で拡張する
- **画像・カード**: `w-full` + `max-w-*` で制御し、固定幅を使わない
- **モーダル・ドロップダウン**: モバイルでは全幅 or ボトムシート風にする
- **フォントサイズの階層**: モバイルの見出しは `text-xl` ～ `text-2xl`、`sm:text-3xl` ～ `sm:text-4xl` で拡大

### デプロイ制限

- `git push` は Cloudflare Pages のデプロイ制限があるため、明示的に許可があるまで実行しない

### 言語ポリシー

- コミットメッセージ: 日本語
- コードコメント: 日本語 OK
- ユーザーへの応答: 日本語サマリー + 英語本文

### ページ共通パターン（絶対統一）

**新規ページ作成・既存ページ修正時は、以下のすべてのパターンに必ず従うこと。**  
**既存ページを参照する場合は、ダッシュボード（`page.tsx`）ではなく `wallet/page.tsx` や `shop/page.tsx` を正規のリファレンスとすること。**  
ダッシュボードは公開ランディングページ兼用のため、例外的な構造を持つ。

#### ① ファイル先頭宣言

```ts
export const runtime = "edge";
// ...imports...
export const dynamic = "force-dynamic";
```

#### ② 必須インポート

```ts
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase"; // ※ supabase ではなく supabaseAdmin
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/navigation";
import UserMenu from "@/components/UserMenu";
import Breadcrumbs from "@/components/Breadcrumbs";
```

#### ③ 認証チェック → userId 取得 → DB ユーザー情報取得

```tsx
const session = await auth();
const t = await getTranslations("PageName");
const dashboardT = await getTranslations("Dashboard");

if (!session?.user) {
  redirect("/");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const userId = (session.user as any).id;

// 必ず supabaseAdmin で DB からユーザー情報を取得する
const { data: dbUser } = await supabaseAdmin
  .from("users")
  .select("name, image, username") // ← 最低限この3つ。ページ固有のカラムは追加OK
  .eq("id", userId)
  .single();

if (!dbUser?.username) {
  redirect("/setup");
}
```

**禁止事項:**

- `session.user.image` / `session.user.name` を表示用に直接使用してはいけない（Fitbit OAuth の値のため）
- `supabase`（非 admin）をサーバーコンポーネントで使用してはいけない（`supabaseAdmin` を使う）
- username チェック・`/setup` リダイレクトを省略してはいけない

#### ④ ルート要素

```tsx
<main className="min-h-screen bg-[var(--theme-page-bg)]">
```

#### ⑤ ヘッダー（アプリブランディング）

```tsx
<header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
  <div className="mx-auto max-w-[1600px] w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-16 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Link href="/" className="flex items-center gap-2 group">
        <h1
          className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity"
          style={{ fontFamily: '"Inter", sans-serif' }}
        >
          {dashboardT("title")}
        </h1>
        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20">
          {dashboardT("beta")}
        </span>
      </Link>
    </div>
    <UserMenu
      user={{
        id: userId,
        name: dbUser?.name || session.user.name,
        email: session.user.email,
        image: dbUser?.image || session.user.image,
      }}
    />
  </div>
</header>
```

- `BackButton` はヘッダーに置かない（パンくずリストで代替）
- ヘッダー左側は常にアプリロゴ（`UCFitness` グラデーション + beta バッジ）
- `dashboardT = await getTranslations('Dashboard')` で取得

#### ⑥ コンテンツ領域

```tsx
<div className="mx-auto max-w-[1600px] w-full px-4 sm:px-6 lg:px-8 py-8">
  {/* パンくずリスト */}
  <div className="mb-6">
    <Breadcrumbs items={[{ label: t("title") }]} />
  </div>

  {/* ページタイトル */}
  <div className="mb-8">
    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2.5">
      <span>{emoji}</span>
      <span className="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] bg-clip-text text-transparent">
        {t("title")}
      </span>
    </h2>
    <p className="mt-2.5 text-base text-gray-500">{t("headerDesc")}</p>
    <div className="mt-4 h-1 w-32 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60" />
  </div>

  {/* メインコンテンツ */}
</div>
```

- `Breadcrumbs` は Home アイコンを自動付与するため、`🏠` を手動追加しない
- ページタイトルはグラデーション + 絵文字 + 説明文 + 装飾線
- 翻訳キーに `headerDesc` を必ず含める（ja/en 両方）

#### ⑦ 翻訳キー要件（messages/ja.json, messages/en.json）

新規ページには最低限以下の翻訳キーを定義すること:

```json
{
  "PageName": {
    "title": "ページ名",
    "headerDesc": "ページの説明文"
  }
}
```

### Cloudflare Pages デプロイ前チェック（必須）

コードを push する前に、以下を必ず確認すること。

#### Edge Runtime 宣言

- **すべての `app/` 配下の非静的ルート**（`page.tsx`, `route.ts`）には、ファイル先頭に `export const runtime = 'edge';` を記載すること
- Cloudflare Pages は Edge Runtime のみ対応。Node.js Runtime のままだとビルドが失敗する
- `layout.tsx` には不要（ページとAPIルートのみ）
- 新規ファイル作成時は最初の行に必ず追加すること

```ts
// ファイル先頭に必ず記載
export const runtime = "edge";
```

#### ビルド検証

- push 前に `npx @cloudflare/next-on-pages` または `npm run pages:build` を実行してビルドが通ることを確認
- 特に新規ページ・API ルート追加時は Edge Runtime 漏れが発生しやすいため注意

#### `.next` キャッシュ破損の防止（必須）

- **`npx next build` を実行した後は、必ず `.next` ディレクトリを削除すること**
  ```powershell
  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
  ```
- `next build` は `.next` 内のファイルを本番用に上書きするため、`next dev` で使うキャッシュと不整合が起き、`routes-manifest.json` や WASM ファイルが見つからず 500 エラーになる
- ビルド検証の最後のステップとして `.next` 削除を必ず実行し、ユーザーが `npm run dev` を再起動すれば正常に動作する状態にすること
- **TypeScript 型チェック (`npx tsc --noEmit`) はキャッシュを破損しないため、ビルド検証にはこちらを優先使用すること**

#### Node.js 専用 API の使用禁止

- Edge Runtime では `fs`, `path`, `child_process` 等の Node.js ネイティブモジュールは使用不可
- `crypto` は Web Crypto API (`crypto.subtle`) を使用すること
