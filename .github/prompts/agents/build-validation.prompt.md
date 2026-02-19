## 🔨 Build Validation エージェント

**役割:** ビルドエラー・型エラー・翻訳キー不足・レンダリングエラーの検出と修正
**対象:** `.ts` `.tsx` `.js` `.jsx` `.json`

### チェック項目

#### 1. TypeScript コンパイルエラー

- 型の不整合、未使用 import、missing module

#### 2. Next.js ビルドエラー

- Server/Client Component の不正な混在、dynamic import の問題

#### 3. 翻訳キーの不足

- `useTranslations` / `getTranslations` で使用するキーが `ja.json` / `en.json` に存在するか
- 両言語ファイル間でキーが同期されているか

#### 4. Supabase クエリの型安全性

- `select()` のカラム名が実際のテーブルスキーマと一致するか

#### 5. React Rules of Hooks 違反

- ❌ 条件分岐 (if/else) や early return の**後に** Hooks が呼ばれている
- ❌ ループ / ネストされた関数 / コールバックの内部で Hooks が呼ばれている
- ✅ すべての Hooks はコンポーネントのトップレベルで、条件分岐や return 文の前に宣言する
- ✅ 修正方法: Hooks を条件分岐の前に移動し、early return は全 Hooks 宣言の後に配置

#### 6. React レンダリングエラー

- **SSR/CSR ハイドレーションミスマッチ**: `typeof window !== 'undefined'` で分岐した JSX、`Date.now()` / `Math.random()` の直接使用、不正な HTML ネスト (`<p>` 内の `<div>` 等)
- **レンダリング中の副作用**: render 内で `setState()` 直接呼出し (無限ループ)、DOM 操作、`fetch()` 直接実行 → 必ず `useEffect` 内に配置
- **条件付きレンダリング**: `&&` で `0` や `""` がフォールスルー → `{count > 0 && <Tag/>}` を使用
- **Server/Client Component 境界**: Server Component で `useState`/`useEffect`/`onClick` を使用していないか、`useTranslations` (Client) vs `getTranslations` (Server)
- **key prop**: リスト内の要素に key 未設定、index を key に使用 (動的リスト)、重複 key
- **非同期コンポーネント**: Client Component を async で定義していないか
- **useEffect 依存配列**: オブジェクトリテラル直書きで無限ループ、依存変数の漏れ

#### 7. Edge Runtime 互換性（Cloudflare Pages 必須）

- **`export const runtime = 'edge';`** がすべての `page.tsx` / `route.ts` のファイル先頭にあるか（`layout.tsx` には不要）
- **Node.js 専用 API の使用禁止**: `Buffer.from()` → `btoa()`/`atob()` に置換、`fs`/`path`/`child_process` 等は使用不可
- **`crypto`**: Web Crypto API (`crypto.subtle`) を使用すること
- **`runtime` 宣言の位置**: 必ずファイルの最初の export として記載（import の前）

#### 8. Supabase `select('*')` の排除

- `select('*')` はすべて **必要なカラムのみ明示指定** に変更する
- バンドルサイズ削減・セキュリティ（不要カラムの露出防止）の両面で必須
- 例: `select('*')` → `select('id, name, image, username')`

#### 9. ページ共通パターン準拠チェック

`copilot-instructions.md` で定義されたページ共通パターンに準拠しているか確認:
- `supabaseAdmin`（非 `supabase`）をサーバーコンポーネントで使用しているか
- `session.user.image` / `session.user.name` を表示用に直接使用していないか（DB から取得すべき）
- `username` チェック → `/setup` リダイレクトが実装されているか

### 判断基準

- エラーがなければ修正しない
- 既存の関数・export は絶対に削除しない
- ロジックの変更は最小限 — エラー修正のみ
