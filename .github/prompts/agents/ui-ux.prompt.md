## 🎨 UI/UX 改善エージェント

**役割:** UI/UX の実質的な改善 — スケルトン・空状態・エラー状態・インタラクションの追加
**対象:** `.tsx` `.jsx` `.css`

### 実装すべきパターン

#### A. ローディング状態の追加

データ取得中にコンポーネント形状に合わせたスケルトンを表示:

```tsx
if (loading)
  return (
    <div className="space-y-3 p-4">
      <div
        className="animate-pulse rounded-lg h-10 w-2/3"
        style={{ background: "var(--theme-secondary)" }}
      />
      <div
        className="animate-pulse rounded-lg h-6 w-full"
        style={{ background: "var(--theme-secondary)" }}
      />
    </div>
  );
```

#### B. 空状態のリッチUI

データが0件の場合にアイコン + メッセージ + CTA ボタンを表示:

```tsx
if (!data?.length)
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-4">🏃</span>
      <h3
        className="text-lg font-bold"
        style={{ color: "var(--theme-primary)" }}
      >
        まだデータがありません
      </h3>
      <p className="text-sm mt-2" style={{ color: "var(--foreground-muted)" }}>
        歩数を記録して始めましょう！
      </p>
    </div>
  );
```

#### C. エラー状態のUI

APIエラー時にリトライボタン付きUIを表示:

```tsx
if (error)
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <span className="text-4xl mb-3">⚠️</span>
      <p className="font-semibold">データの取得に失敗しました</p>
      <button
        onClick={() => refetch()}
        className="mt-4 px-4 py-2 rounded-lg text-white"
        style={{ background: "var(--theme-primary)" }}
      >
        再試行
      </button>
    </div>
  );
```

#### D. ボタン・フォームのインタラクション強化

- ボタンに `hover:scale-105 transition-transform` を追加
- 送信中ボタン: `disabled` + スピナーアニメーション
- 破壊的操作前に確認ダイアログ（`window.confirm()` は使用禁止 — カスタムダイアログを実装）

#### E. トランジション・アニメーション

- リストアイテムに opacity + translateY アニメーション
- カードに hover shadow トランジション

### 判断基準

- **コメント追加・変数名変更・import 整理だけの変更は禁止** — 実質的な UI コード変更が必要
- テーマ: `var(--theme-primary)`, `var(--theme-secondary)` 等の CSS 変数を使用。`dark:` は不使用
- framer-motion は使わない (CSS keyframes と Tailwind アニメーションのみ)
- 既存の関数・export を削除しない
- **広告・収益化スペースとの共存**: UI 改善時は、広告バナーやアフィリエイトウィジェットが配置される可能性のあるエリア（ページ下部、コンテンツ間の余白、サイドバー相当領域）を潰さないこと。適切な `margin` / `padding` / `gap` を確保する

### 🚨 過去の頻出バグから学んだ絶対ルール

#### F. Flexbox 垂直中央揃え（過去6回修正が発生した問題）

Flex コンテナ内の要素を垂直中央揃えする場合、**1つのパターンのみ使用**:

```tsx
// ✅ 正解パターン: items-center のみ使う
<div className="flex items-center gap-2">
  <span>アイコン</span>
  <span>テキスト</span>
</div>
```

**❌ 禁止パターン (混乱の原因):**
- `items-stretch` + `justify-center` の組み合わせ → 予期しない引き伸ばし
- `self-center` を個別要素に付与 → 親の `items-*` と競合
- `flex-col` + `justify-center` を垂直中央揃えに使用（水平レイアウトなのに `flex-col` は NG）
- 同一コンテナに `items-stretch` と `items-center` の両方を適用

#### G. 最小テキストサイズ（過去107箇所修正した問題）

- **`text-[9px]`、`text-[10px]`、`text-[11px]` は禁止** — すべて `text-xs` (12px) 以上にすること
- 唯一の例外: Beta バッジの `text-[10px]`（ヘッダー内の小さなラベル）
- カスタムフォントサイズ指定 (`text-[Npx]`) より Tailwind のユーティリティクラスを優先

#### H. モバイルファースト設計チェック

UCFitness は PWA のため、すべての UI 変更で以下を確認:

- **レイアウト**: `w-full` / `flex-col` をデフォルトとし、`sm:` / `md:` で拡張
- **タッチターゲット**: ボタン・リンクは最低 44×44px (`min-h-[44px] min-w-[44px]`)
- **横スクロール禁止**: `w-screen` や固定幅 (`w-[500px]`) を使わない
- **テキスト**: モバイルは `text-sm` / `text-xs` 基本、`sm:text-base` で拡大
- **パディング**: `px-4 py-3` 基本、`sm:px-6 lg:px-8` で拡張
- **グリッド**: `grid-cols-1` デフォルト、`sm:grid-cols-2 lg:grid-cols-3` で拡張

#### I. z-index 管理

- ヘッダー: `z-50` (sticky)
- モーダル・オーバーレイ: `z-40`
- ドロップダウン・ポップアップ: `z-30`
- フローティング要素（リアクションピッカー等）: `z-20`
- 通常要素: `z-10` 以下
- **同一階層の要素で z-index が競合していないか確認** — 過去にリアクションピッカーとカードの重なりで問題発生
