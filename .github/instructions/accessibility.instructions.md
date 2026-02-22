---
applyTo: "components/**/*.tsx,app/**/*.tsx"
---

# アクセシビリティ (WCAG 2.1/2.2) ガイドライン

UCFitness は PWA であり、すべてのユーザーがアクセスできることが重要。
UI コンポーネント作成・修正時に以下を遵守すること。

## キーボードナビゲーション

- すべてのインタラクティブ要素は Tab キーでフォーカス可能であること
- フォーカス順序は視覚的な順序と一致すること
- カスタムコンポーネントには `tabIndex`, `onKeyDown` を適切に設定
- モーダル・ドロップダウンはフォーカストラップを実装

## セマンティック HTML

- `<button>` と `<a>` を適切に使い分ける（ナビゲーション = `<a>`、アクション = `<button>`）
- 見出しは `<h1>` → `<h2>` → `<h3>` の順で階層構造を維持
- リスト表示は `<ul>` / `<ol>` を使用
- フォーム要素には `<label>` を関連付ける

## ARIA 属性

- アイコンボタンには `aria-label` を付与（例: `<button aria-label="閉じる"><XIcon /></button>`）
- ローディング状態は `aria-busy="true"` を使用
- トグル要素には `aria-expanded`, `aria-pressed` を使用
- モーダルには `role="dialog"` と `aria-modal="true"` を付与
- 通知・アラートには `role="alert"` を使用

## カラーコントラスト

- テキストと背景のコントラスト比は最低 4.5:1（WCAG AA）
- 大きなテキスト（18px+ bold、24px+ regular）は 3:1
- 色だけで情報を伝えない — アイコン・テキストも併用

## 画像・メディア

- `<img>` には常に `alt` を設定（装飾画像は `alt=""`）
- チャート・グラフにはテキストベースの代替情報を提供
- アニメーションは `prefers-reduced-motion` を尊重

## フォーム

- エラーメッセージは入力フィールドの近くに表示し、`aria-describedby` で関連付け
- 必須フィールドは `aria-required="true"` を設定
- フォーム送信後のフィードバックは `aria-live="polite"` で通知

## テスト

- Tab キーだけで主要操作ができることを確認
- スクリーンリーダー（NVDA/VoiceOver）で読み上げ順序を確認
- ブラウザの Accessibility DevTools で問題がないことを検証
