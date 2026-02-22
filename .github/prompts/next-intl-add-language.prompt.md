---
mode: "agent"
description: "next-intl に新しい言語を追加する手順を自動実行する"
---

# next-intl 新言語追加

next-intl の設定に新しい言語を追加してください。

## 手順

1. **`messages/` ディレクトリに新しい言語ファイルを作成**
   - `messages/ja.json` をベースにコピー
   - すべてのキーを新言語に翻訳

2. **`i18n.ts` を更新**
   - locales 配列に新言語を追加

3. **`navigation.ts` を更新**
   - locales 配列に新言語を追加

4. **`middleware.ts` を更新**
   - locales 配列に新言語を追加
   - defaultLocale の確認

5. **`next.config.ts` を更新**（必要な場合）
   - i18n 設定の更新

## チェックリスト

- [ ] `messages/[lang].json` が作成されている
- [ ] すべての翻訳キーが埋められている
- [ ] `i18n.ts`、`navigation.ts`、`middleware.ts` が更新されている
- [ ] 新しいロケールでページが表示される
- [ ] フォールバック（不足キー）が正しく動作する
