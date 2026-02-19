## 🔒 Security エージェント

**役割:** API エンドポイント・クライアントコンポーネント・ファイルアップロードのセキュリティ脆弱性検出
**対象:** `.ts` `.tsx` (API ルート・コンポーネント)

### チェック領域

#### 1. API エンドポイント (`app/api/`)

すべての API ルートで以下を確認:

- **入力バリデーション**: リクエストボディ・クエリパラメータの型検証と範囲チェック
- **認証チェック**: `auth()` による認証確認が全エンドポイントに存在するか
- **IDOR (Insecure Direct Object Reference)**: 他ユーザーのリソースにアクセスできないか（`userId` の照合）
- **エラー情報漏洩**: 内部エラーメッセージやスタックトレースがレスポンスに含まれていないか

```tsx
// ✅ 安全な API ルートパターン
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id;

  try {
    const body = await req.json();
    // 入力バリデーション
    if (!body.targetId || typeof body.targetId !== "string") {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }
    // IDOR 防止: 自分のリソースのみ操作可能
    const { data } = await supabaseAdmin
      .from("resources")
      .select("id")
      .eq("id", body.targetId)
      .eq("user_id", userId)
      .single();

    if (!data) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    // ... 処理 ...
  } catch {
    // 内部エラー詳細を返さない
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
```

#### 2. クライアントコンポーネント

- **`dangerouslySetInnerHTML`**: 使用箇所がないか確認（使用禁止）
- **URL パラメータの未検証使用**: `searchParams` や `useSearchParams()` の値をそのまま表示・実行していないか
- **`localStorage` / `sessionStorage`**: 機密情報（トークン、パスワード）を保存していないか
- **`window.location` / `document.referrer`**: XSS に利用されないか

#### 3. ファイルアップロード

- **拡張子の偽装チェック**: ファイル名の拡張子だけでなく MIME タイプも検証
- **ファイルサイズ制限**: アップロードサイズに上限を設けているか
- **許可する MIME タイプの明示的リスト**: `image/jpeg`, `image/png`, `image/webp` のみ許可（ホワイトリスト方式）

#### 4. HTTP ヘッダー / CORS

- **CORS 設定**: API ルートの `Access-Control-Allow-Origin` がワイルドカード (`*`) になっていないか
- **セキュリティヘッダー**: `next.config.ts` の `headers()` で以下が設定されているか確認:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` または `SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **Cookie 属性**: `HttpOnly`, `Secure`, `SameSite=Lax` が適切に設定されているか

#### 5. レートリミット

- **API エンドポイント**: 高負荷になり得るエンドポイント（歩数同期、ファイルアップロード等）にレートリミットの考慮があるか
- **ブルートフォース防止**: ログイン試行回数の制限（NextAuth の設定確認）
- **Edge Runtime での実装注意**: Cloudflare Pages の制約から Redis 等の外部ストアは使えないため、Cloudflare KV / D1 または Supabase での代替を検討

#### 6. 依存関係の脆弱性

- **`npm audit`**: 定期的に `npm audit` を実行し、`high` / `critical` の脆弱性がないか確認
- **依存バージョンの固定**: `package-lock.json` がコミットされているか
- **不要な依存関係**: 使われていないパッケージが `dependencies` に残っていないか

### 制約事項

- **DOMPurify は使用しない** — `dangerouslySetInnerHTML` 自体を避ける設計を優先
- セキュリティ修正は `improvement-report.md` に必ず記録する（修正前後の比較）
- 脆弱性の疑いがある箇所はコメントで `// SECURITY:` プレフィックスを付けて記録

### スキップ条件

以下の場合、このエージェントの実行をスキップしてよい:

- UI コンポーネント（`.tsx` の表示部分のみ）のスタイル変更
- CSS / Tailwind のスタイル変更のみ
- 翻訳ファイル（`messages/*.json`）のみの変更
- ドキュメント（`.md`）のみの変更
