---
applyTo: "app/api/**/*.ts,lib/**/*.ts,app/**/actions.ts,middleware.ts"
---

# セキュアコーディング & OWASP ガイドライン

UCFitness のバックエンド（API Routes, Server Actions, ミドルウェア）に適用。

## 認証・認可

- すべての API Route で `auth()` による認証チェックを最初に実行
- 認証失敗時は `401 Unauthorized` を返す
- 他ユーザーのデータへのアクセスは IDOR として扱い、必ず `session.user.id` でフィルタ

```ts
const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const userId = (session.user as any).id;
// 必ず userId でフィルタしてデータアクセス
```

## 入力検証

- すべてのユーザー入力（body, query params, path params）を型チェック・バリデーション
- 数値パラメータは `parseInt` + `isNaN` チェック
- 文字列は長さ制限、不正文字の排除
- SQL インジェクション: Supabase のパラメータバインディングを使用（文字列連結禁止）

## エラーハンドリング

- スタックトレースや内部 ID をクライアントに返さない
- エラーレスポンスは汎用メッセージ: `{ error: "Internal server error" }`
- サーバーログには詳細を記録してよい

## データ露出防止

- `select('*')` は禁止 — 必要なカラムのみ明示指定
- `session.user.image` / `session.user.name` は OAuth プロバイダの値のため表示に直接使用しない

## クライアントサイド

- `dangerouslySetInnerHTML` は原則禁止
- URL パラメータは使用前にサニタイズ
- `localStorage` に機密情報（トークン、パスワード等）を保存しない

## ファイルアップロード

- MIME タイプと拡張子の両方を検証
- アップロードサイズ制限を設定
- ファイル名は UUID 等で置換（パストラバーサル防止）

## レート制限

- 公開 API エンドポイントにはレート制限を検討
- 重い処理（画像アップロード等）には個別のレート制限

## 機密情報

- API キー、トークン、パスワードをソースコードに直接記載しない
- `.env` ファイルは `.gitignore` に含まれていることを確認
- ログ出力に機密情報を含めない
