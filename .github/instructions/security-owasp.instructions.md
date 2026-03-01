---
applyTo: "app/api/**/*.ts,lib/**/*.ts,app/**/actions.ts,middleware.ts"
---

# セキュアコーディング & OWASP ガイドライン

UCFitness のバックエンド（API Routes, Server Actions, ミドルウェア）に適用。
OWASP Top 10 に基づくセキュリティファーストの原則に従う。

## 認証・認可 (A01: Broken Access Control)

- すべての API Route で `auth()` による認証チェックを最初に実行
- 認証失敗時は `401 Unauthorized` を返す
- 他ユーザーのデータへのアクセスは IDOR として扱い、必ず `session.user.id` でフィルタ
- **Deny by Default**: アクセス制御は明示的な許可ルールがある場合のみアクセスを許可
- **最小権限の原則**: 各操作に必要最低限の権限のみを付与

```ts
const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const userId = (session.user as any).id;
// 必ず userId でフィルタしてデータアクセス
```

## 暗号化・秘密管理 (A02: Cryptographic Failures)

- パスワードハッシュには Argon2 / bcrypt を使用（MD5 / SHA-1 禁止）
- 通信はすべて HTTPS を使用
- 機密データの保存には AES-256 等の強力な暗号化を適用
- Web Crypto API (`crypto.subtle`) を使用（Edge Runtime では Node.js `crypto` モジュール使用不可）
- **シークレットの直接記載禁止**: ソースコードに API キー・トークン・パスワードを記載しない

```ts
// ✅ 環境変数からシークレットを取得
const apiKey = process.env.FITBIT_CLIENT_SECRET;
// ❌ ハードコーディング禁止
const apiKey = "sk_live_extremely_bad_idea_12345";
```

## 入力検証・インジェクション防止 (A03: Injection)

- すべてのユーザー入力（body, query params, path params）を型チェック・バリデーション
- 数値パラメータは `parseInt` + `isNaN` チェック
- 文字列は長さ制限、不正文字の排除
- SQL インジェクション: Supabase のパラメータバインディングを使用（文字列連結禁止）
- **XSS 防止**: ユーザー入力を表示する際はコンテキストに応じたエスケープを使用
- `dangerouslySetInnerHTML` は原則禁止（必要な場合は DOMPurify でサニタイズ）

## セキュリティ設定 (A05: Security Misconfiguration)

- 本番環境で詳細エラーメッセージ・デバッグ情報を無効化
- セキュリティヘッダーの設定:
  - `Content-Security-Policy` (CSP)
  - `Strict-Transport-Security` (HSTS)
  - `X-Content-Type-Options: nosniff`
- 依存パッケージの脆弱性を定期的にスキャン（`npm audit`）

## 認証の堅牢化 (A07: Identification & Authentication Failures)

- ログイン時にセッション ID を再生成（セッション固定化攻撃防止）
- セッション Cookie は `HttpOnly`, `Secure`, `SameSite=Strict` を設定
- 認証失敗時のブルートフォース防止: レート制限を実装

## SSRF 防止 (A10: Server-Side Request Forgery)

- ユーザー提供の URL に基づくサーバーリクエストはホスト・ポート・パスのホワイトリスト検証必須
- パストラバーサル防止: ファイルパスの入力はサニタイズし、安全な API でパスを構築

## エラーハンドリング

- スタックトレースや内部 ID をクライアントに返さない
- エラーレスポンスは汎用メッセージ: `{ error: "Internal server error" }`
- サーバーログには詳細を記録してよい

## データ露出防止

- `select('*')` は禁止 — 必要なカラムのみ明示指定
- `session.user.image` / `session.user.name` は OAuth プロバイダの値のため表示に直接使用しない

## クライアントサイド

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
- ログ出力に機密情報を含めない（`console.log` にパスワード・トークン・PII を含めない）
