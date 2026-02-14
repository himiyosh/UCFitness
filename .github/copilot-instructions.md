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

### デプロイ制限

- `git push` は Cloudflare Pages のデプロイ制限があるため、明示的に許可があるまで実行しない

### 言語ポリシー

- コミットメッセージ: 日本語
- コードコメント: 日本語 OK
- ユーザーへの応答: 日本語サマリー + 英語本文

### ページレイアウト共通パターン（必ず統一すること）

新規ページ作成・既存ページ修正時は、以下の共通パターンに従うこと。

#### ルート要素

```tsx
<main className="min-h-screen bg-[var(--theme-page-bg)]">
```

#### ヘッダー（アプリブランディング）

```tsx
<header className="bg-white backdrop-blur-md border-b border-[var(--theme-primary)]/10 sticky top-0 z-50">
  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Link href="/" className="flex items-center gap-2 group">
        <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] group-hover:opacity-80 transition-opacity" style={{ fontFamily: '"Inter", sans-serif' }}>
          {dashboardT('title')}
        </h1>
        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] text-[10px] font-bold tracking-wide uppercase border border-[var(--theme-primary)]/20">
          {dashboardT('beta')}
        </span>
      </Link>
    </div>
    <UserMenu user={...} />
  </div>
</header>
```

- `BackButton` はヘッダーに置かない（パンくずリストで代替）
- ヘッダー左側は常にアプリロゴ（`UCFitness` グラデーション + beta バッジ）
- `dashboardT = await getTranslations('Dashboard')` で取得

#### コンテンツ領域

```tsx
<div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
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
