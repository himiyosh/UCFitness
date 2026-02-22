---
applyTo: "**/*.{ts,tsx}"
---

# 自己説明的コードとコメント戦略

コメントは「なぜ」を説明し、「何を」は書かない。コードそのものが意図を語るようにする。

## コメントすべきもの

- **ビジネスルール**: なぜその処理が必要なのか

```ts
// Fitbit API は1日分の歩数を翌日AM3:00まで更新し続けるため、
// 2日前以前のデータのみ確定値として扱う
const confirmedDate = subDays(now, 2);
```

- **非自明な最適化**: なぜその書き方を選んだか

```ts
// Map で O(1) ルックアップ — メンバー数が多いグループで find() は O(n) のためペナルティ大
const memberMap = new Map(members.map(m => [m.id, m]));
```

- **ワークアラウンド**: 既知の問題への対処

```ts
// NextAuth v5 beta ではセッションに id が含まれないため、any キャスト必須
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const userId = (session.user as any).id;
```

- **TODO / FIXME**: 期限と理由を記載

```ts
// TODO(2026-Q2): Fitbit API v2 移行後に削除 — レガシーフォーマット対応
```

## コメントすべきでないもの

```ts
// ❌ 自明なコメント — コードが語っている
const count = items.length; // アイテム数を取得

// ❌ 変更ログ — Git が管理する
// 2026-01-15: ユーザー名バリデーション追加

// ❌ セクション区切りだけのコメント
// -------- ここからヘルパー関数 --------
```

## 言語

- コードコメントは日本語 OK（プロジェクト方針）
- JSDoc の `@param` / `@returns` は英語でも日本語でも可
