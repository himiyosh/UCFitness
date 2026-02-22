---
applyTo: "components/**/*.tsx,app/**/*.tsx,hooks/**/*.ts"
---

# React Hooks ルール（最重要 — 違反すると本番クラッシュ）

⚠️ React Error #310 が頻発した経緯あり。以下を厳守すること。

## 原則

- **すべての Hooks（`useState`・`useMemo`・`useEffect`・`useCallback`・`useRef`・`useTranslations`・`useLocale` 等）は、コンポーネント内のいかなる条件付き早期 `return` よりも前に配置すること**
- React の Rules of Hooks: Hooks の呼び出し回数・順序はレンダーごとに同一でなければならない
- 条件付き `return` の後に Hooks を置くと、特定条件下で Hooks 数が変わり **本番で即クラッシュ** する

## NG パターン（絶対禁止）

```tsx
// ❌ NG: useMemo が早期 return の後にある → 本番クラッシュ
if (loading) return <Skeleton />;
if (!data) return null;
const processed = useMemo(() => transform(data), [data]); // ← CRASH
```

## OK パターン

```tsx
// ✅ OK: すべての Hooks を早期 return の前に配置し、null-safe にする
const processed = useMemo(
  () => (data ? transform(data) : defaultValue),
  [data],
);
if (loading) return <Skeleton />;
if (!data) return null;
```

## 実行チェックリスト（コード変更時に必ず確認）

1. **新しい Hook を追加する場合**: 既存の Hooks 群の直後、最初の `if (...) return` の前に配置する
2. **`useMemo` / `useCallback` が外部データを参照する場合**: `data ?` や `data ?? []` で null/undefined を安全にハンドリングする
3. **早期 return を追加する場合**: その return の下に Hooks が存在しないことを確認する
4. **ファイル編集後の最終確認**: ファイル内で `useMemo|useCallback|useState|useEffect|useRef` を検索し、すべてが最初の条件付き `return` より上にあることを目視確認する
