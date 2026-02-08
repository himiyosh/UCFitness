# 🔒 UndouCoin セキュリティ強化ノート

> **日付:** 2026-02-08  
> **ブランチ:** `feature/undoucoin-bank`  
> **コミット:** `3449c03` (セキュリティ強化) / `bde10e6` (Vercel削除)

---

## 📋 目次

1. [なぜセキュリティ強化が必要だったのか](#1-なぜセキュリティ強化が必要だったのか)
2. [Supabase の 2つの鍵（anon key / service_role key）](#2-supabase-の-2つの鍵)
3. [変更①: RLS（Row Level Security）有効化](#3-変更-rls-有効化)
4. [変更②: anon → supabaseAdmin 統一](#4-変更-anon--supabaseadmin-統一)
5. [変更③: 出金トランザクション型の追加](#5-変更-出金トランザクション型の追加)
6. [変更④: 残高の非負制約](#6-変更-残高の非負制約)
7. [変更⑤: べき等性キー（idempotency_key）](#7-変更-べき等性キー)
8. [変更⑥: deduct_balance() DB関数](#8-変更-deduct_balance-db関数)
9. [変更⑦: credit_balance() DB関数](#9-変更-credit_balance-db関数)
10. [変更⑧: TypeScript ラッパー](#10-変更-typescript-ラッパー)
11. [PostgreSQL vs 他の DB](#11-postgresql-vs-他の-db)
12. [用語集](#12-用語集)

---

## 1. なぜセキュリティ強化が必要だったのか

Phase 1〜3 の UndouCoin は **「入金のみ」** のシステムだった：
- 歩くと UC が増える
- 目標達成で UC が増える
- ストリークで UC が増える

Phase 4 では **「出金」** が加わる：
- ショップで UC を使ってアイテム購入（出金）
- 他のユーザーに UC をギフト送信（出金）

**出金が入ると攻撃面が格段に広がる：**
| 攻撃 | 入金のみ | 出金あり |
|------|---------|---------|
| 残高の改ざん | ⚠️ 不正に増やせるが実害少 | 🔴 増やして使える |
| 二重購入 | — | 🔴 1回分の金額で2回購入 |
| Race condition | — | 🔴 残高100で200分購入 |

---

## 2. Supabase の 2つの鍵

### anon key（公開鍵）
```
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```
- `NEXT_PUBLIC_` → **ビルド時にフロントエンドのJSに埋め込まれる**
- ブラウザの DevTools で **誰でも見える**
- Supabase の設計上、**公開前提**
- RLS（Row Level Security）で制限をかけて使う

### service_role key（秘密鍵）
```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```
- `NEXT_PUBLIC_` がない → **サーバーサイドのみ**
- RLS を **バイパス**（無視）する
- **絶対に外部に公開しない**

### 鍵の所在
```
Supabase Dashboard     .env.local (ローカル)       本番環境
  で発行            →   手動コピーして保存      →   環境変数に設定
  （発行元）             （開発時に使用）            （デプロイ時に使用）
```

### コード内での使い分け（lib/supabase.ts）
```typescript
// 🔓 anon key で作成（ブラウザに公開される鍵）
export const supabase = createClient(supabaseUrl, supabaseKey);

// 🔐 service_role key で作成（サーバーだけが持つ鍵）
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { ... });
```

---

## 3. 変更①: RLS 有効化

### SQL
```sql
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_balances ENABLE ROW LEVEL SECURITY;
```

### 概要
- RLS を ON にして **ポリシーを作らない** = `service_role` 以外は全拒否
- ブラウザからの直接アクセスを完全ブロック

### Before → After
```
Before:
  ブラウザ → anon key → coin_balances → ✅ 全データ見える 🔴

After:
  ブラウザ → anon key → coin_balances → ❌ 拒否 ✅
  サーバー → service_role → coin_balances → ✅ OK
```

### 変更ファイル
- `migrations/011_security_hardening.sql` L11-12

---

## 4. 変更②: anon → supabaseAdmin 統一

### 概要
RLS 有効化に伴い、読み取り系関数で使っていた `supabase`（anon client）を
全て `supabaseAdmin`（service_role client）に切り替えた。

### 変更された関数
| 関数 | ファイル |
|------|---------|
| `getCoinBalance()` | `lib/coin-service.ts` |
| `getRecentTransactions()` | `lib/coin-service.ts` |
| `getDailyBalanceHistory()`（2箇所） | `lib/coin-service.ts` |
| `getCoinLeaderboard()`（2箇所） | `lib/coin-service.ts` |
| ユーザー情報クエリ | `app/[locale]/wallet/page.tsx` |

### なぜ安全か
認証は NextAuth の `auth()` がサーバーサイドで処理し、
認証済み userId を使って `supabaseAdmin` でクエリするので、
他人のデータにはアクセスできない。

---

## 5. 変更③: 出金トランザクション型の追加

### SQL
```sql
ALTER TABLE coin_transactions 
    ADD CONSTRAINT coin_transactions_type_check 
    CHECK (type IN (
        'STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'RANK_BONUS',   -- 既存（入金）
        'PURCHASE', 'GIFT_SEND', 'GIFT_RECEIVE'                  -- 新規
    ));
```

### 新しいタイプの意味
| type | 意味 | amount の符号 |
|------|------|-------------|
| `PURCHASE` | ショップでアイテム購入 | マイナス |
| `GIFT_SEND` | 他ユーザーにUC送信 | マイナス |
| `GIFT_RECEIVE` | 他ユーザーからUC受信 | プラス |

### CHECK 制約とは
「このカラムに入れていい値はこれだけ」という DB レベルのルール。
プログラムのバグで不正な値が来ても DB が拒否する。

### 変更ファイル
- `migrations/011_security_hardening.sql` L22-31

---

## 6. 変更④: 残高の非負制約

### SQL
```sql
ALTER TABLE coin_balances 
    ADD CONSTRAINT coin_balances_non_negative_balance 
    CHECK (total_balance >= 0);
```

### 概要
`total_balance` が 0 未満にならないことを DB レベルで保証。

### Defense in Depth（多層防御）の考え方
```
アプリ側チェック → 残高足りる？ → OK → DB へ書き込み
                                        ↓
DB 側チェック   →                    total_balance >= 0 ?
                                        ↓ NO
                                     ❌ 拒否！ロールバック
```
アプリのバグでチェックをすり抜けても、DB が最後の砦として守る。

### 変更ファイル
- `migrations/011_security_hardening.sql` L38-40

---

## 7. 変更⑤: べき等性キー

### 概要
「べき等性（idempotency）」= **同じ操作を何回やっても結果が1回分になる** 性質。

### DB 変更
```sql
-- カラム追加
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- ユニークインデックス（NULL は除外）
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_idempotency 
    ON coin_transactions(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;
```

### アプリ変更（processCoins 内）
```typescript
const idempotencyPrefix = `coins:${userId}:${date}`;
{
    user_id: userId, date, type: 'STEPS', amount: baseCoins,
    idempotency_key: `${idempotencyPrefix}:STEPS`,  // ← 追加
}
```

### 問題シナリオ（べき等性がない場合）
```
ユーザー「購入」ボタンを押す
 → サーバーで処理成功（UC が減る）
 → レスポンスがネットワークエラーで返ってこない
 → ユーザーもう一度押す
 → サーバーでまた処理成功（UC がさらに減る）💀
```

### べき等性がある場合
```
1回目: key = "purchase:user123:item456:1707350400" → INSERT 成功 ✅
2回目: 同じ key → ユニーク違反 → 「もう処理済み」と判定 → スキップ ✅
```

### `WHERE idempotency_key IS NOT NULL` の意味
過去のトランザクション（key が NULL）には影響しない。
NULL 同士はユニーク制約に引っかからない。

### 変更ファイル
- `migrations/011_security_hardening.sql` L47-53
- `lib/coin-service.ts`（processCoins 内の3箇所）

---

## 8. 変更⑥: deduct_balance() DB関数

### 概要
UC を安全に減らすための PostgreSQL 関数。
**原子性（atomic）**・**べき等性**・**排他制御** を1回の DB 呼び出しで保証。

### 処理フロー
```
1. べき等性チェック → 同じキーが既にあれば即リターン
2. 金額バリデーション → 0以下なら拒否
3. タイプバリデーション → PURCHASE/GIFT_SEND 以外は拒否
4. SELECT ... FOR UPDATE → 残高行をロック ★最重要
5. 残高チェック → 不足なら拒否
6. INSERT coin_transactions → 出金記録（amount をマイナスで記録）
7. UPDATE coin_balances → 残高を減算
8. 結果を JSONB で返す
```

### FOR UPDATE が最重要な理由（Race Condition 防止）

**FOR UPDATE なし（危険）:**
```
時刻 0ms:  リクエストA: SELECT balance → 100
           リクエストB: SELECT balance → 100   ← 同時に来る
時刻 1ms:  リクエストA: 100 >= 100? → OK ✅
           リクエストB: 100 >= 100? → OK ✅   ← 両方OKになってしまう
時刻 2ms:  リクエストA: UPDATE balance = 0
           リクエストB: UPDATE balance = 0

結果: 残高100なのに200分の買い物ができた 💀
```

**FOR UPDATE あり（安全）:**
```
時刻 0ms:  リクエストA: SELECT ... FOR UPDATE → ロック取得 → 100
           リクエストB: SELECT ... FOR UPDATE → ⏳ ロック待ち...
時刻 1ms:  リクエストA: OK → UPDATE balance = 0 → ロック解放
時刻 2ms:  リクエストB: ロック取得 → 0
時刻 3ms:  リクエストB: 0 >= 100? → ❌ 残高不足！拒否 ✅
```

### なぜ DB 関数にしたのか（アプリ側でやらない理由）
```typescript
// アプリ側でやると：
const balance = await getBalance(userId);  // DB往復 1回目
if (balance >= amount) {                    // ← この間に別リクエストが割り込める！
    await deduct(userId, amount);            // DB往復 2回目
}
```
2回の DB 往復の **間** に割り込みが可能。
DB関数なら **1回の呼び出し** で全てが原子的に実行される。

### 変更ファイル
- `migrations/011_security_hardening.sql` L61-138

---

## 9. 変更⑦: credit_balance() DB関数

### 概要
`deduct_balance` の逆。UC を安全に加算する関数。

### deduct との違い
| | deduct_balance | credit_balance |
|---|---|---|
| 用途 | 出金（購入・ギフト送信） | 入金（ギフト受信・ランクボーナス） |
| FOR UPDATE | ✅ 必要（race condition 防止） | ❌ 不要（加算は競合しない） |
| 許可タイプ | PURCHASE, GIFT_SEND | GIFT_RECEIVE, RANK_BONUS |
| レコード無し | エラー(user_not_found) | UPSERT で自動作成 |

### 変更ファイル
- `migrations/011_security_hardening.sql` L144-200

---

## 10. 変更⑧: TypeScript ラッパー

### 概要
DB関数を TypeScript から呼ぶためのラッパー関数。

```typescript
// deductBalance — 出金用
export async function deductBalance(
    userId: string,
    amount: number,
    type: 'PURCHASE' | 'GIFT_SEND',
    description: string,
    idempotencyKey?: string,
): Promise<DeductResult> {
    const { data } = await supabaseAdmin.rpc('deduct_balance', { ... });
    return data;
}

// creditBalance — 入金用
export async function creditBalance(
    userId: string,
    amount: number,
    type: 'GIFT_RECEIVE' | 'RANK_BONUS',
    description: string,
    idempotencyKey?: string,
): Promise<CreditResult>
```

### Phase 4 での使い方
```typescript
// ショップ購入
const result = await deductBalance(
    userId, 500, 'PURCHASE', 
    'レアアイコン購入',
    `purchase:${userId}:${itemId}:${Date.now()}`
);
if (!result.success) {
    if (result.error === 'insufficient_balance') return { error: '残高不足' };
}
```

### 変更ファイル
- `lib/coin-service.ts`（ファイル末尾に追加）

---

## 11. PostgreSQL vs 他の DB

### 全体像
| | PostgreSQL | MySQL | SQLite | MongoDB |
|---|---|---|---|---|
| 種類 | リレーショナル(SQL) | リレーショナル(SQL) | リレーショナル(SQL) | ドキュメント(NoSQL) |
| 動作場所 | サーバー | サーバー | ファイル（組み込み） | サーバー |
| 思想 | 正しさ優先 | 速さ優先 | 手軽さ優先 | 柔軟性優先 |

### 今回使った機能の DB 別対応状況

#### FOR UPDATE（行ロック）
| DB | 対応 | 備考 |
|---|---|---|
| PostgreSQL | ✅ | 他の読み取りをブロックしない（MVCC） |
| MySQL (InnoDB) | ✅ | ほぼ同じ構文 |
| SQLite | ❌ | DB 全体ロックのみ |
| MongoDB | ⚠️ | `findOneAndUpdate` で代替 |

#### PL/pgSQL（DB 内プログラミング）
| DB | 対応 | 備考 |
|---|---|---|
| PostgreSQL | ✅ | 複数言語対応、非常に強力 |
| MySQL | ⚠️ | Stored Procedures（機能限定的） |
| SQLite | ❌ | 関数を書けない |
| MongoDB | ❌ | アプリ側で処理 |

#### RLS（Row Level Security）
| DB | 対応 | 備考 |
|---|---|---|
| PostgreSQL | ✅ | Supabase の設計基盤 |
| MySQL | ❌ | アプリ側で毎回 `WHERE user_id = ?` |
| SQLite | ❌ | 同上 |
| MongoDB | ⚠️ | Atlas で一部対応 |

#### CHECK 制約
| DB | 対応 | 備考 |
|---|---|---|
| PostgreSQL | ✅ | 完全対応 |
| MySQL 8.0+ | ✅ | **5.x では書いても黙って無視される！** |
| SQLite | ✅ | 対応 |
| MongoDB | ⚠️ | JSON Schema Validation |

#### JSONB 型
| DB | 対応 | 備考 |
|---|---|---|
| PostgreSQL | ✅ | バイナリ保存、インデックス可 |
| MySQL 5.7+ | ⚠️ | TEXT 保存、インデックス限定的 |
| SQLite | ❌ | JSON 関数はあるが型は無い |
| MongoDB | ✅ | そもそも全てが JSON |

### Supabase が PostgreSQL を採用した理由
```
Supabase = PostgreSQL + REST API + Auth + RLS + Storage
```
RLS, PL/pgSQL, JSONB を組み合わせて
「anon key を公開しても安全な BaaS」を実現している。
MySQL では同じアーキテクチャが成り立たない。

---

## 12. 用語集

| 用語 | 意味 |
|------|------|
| **RLS** | Row Level Security。テーブルの各行へのアクセスを制御する仕組み |
| **anon key** | Supabase の公開用 API キー。ブラウザに露出する前提 |
| **service_role key** | Supabase の管理者キー。RLS をバイパスする。秘密 |
| **CHECK 制約** | カラムに入れていい値を DB レベルで制限するルール |
| **べき等性 (Idempotency)** | 同じ操作を何回やっても結果が1回分になる性質 |
| **Race Condition** | 複数の処理が同時に走り、予期しない結果になる問題 |
| **FOR UPDATE** | SELECT 時に行をロックし、他のトランザクションの書き込みを待たせる |
| **PL/pgSQL** | PostgreSQL のプロシージャル言語。DB内でプログラムを書ける |
| **原子性 (Atomicity)** | 処理が「全部成功」か「全部失敗」のどちらか。中途半端にならない |
| **Defense in Depth** | 多層防御。アプリ + DB の2層でチェックし、片方漏れても守る |
| **MVCC** | Multi-Version Concurrency Control。読み取りと書き込みが互いをブロックしない仕組み |
| **UPSERT** | INSERT + UPDATE。あれば更新、なければ挿入 |
| **BaaS** | Backend as a Service。Supabase のようなバックエンド提供サービス |

---

## 📊 変更前 vs 変更後 セキュリティ比較

| 攻撃ベクトル | 変更前 | 変更後 |
|-------------|--------|--------|
| ブラウザから全ユーザーの残高を読む | 🔴 可能 | ✅ RLS で不可 |
| ブラウザから残高を書き換える | 🔴 可能 | ✅ RLS で不可 |
| 送信ボタン連打で二重購入 | 🔴 可能 | ✅ べき等性キーで防止 |
| 残高100で200分の同時購入 | 🔴 可能 | ✅ FOR UPDATE ロックで防止 |
| バグで残高がマイナスに | 🔴 可能 | ✅ CHECK制約で不可 |
| 不正なトランザクション型 | 🟡 一部防止 | ✅ CHECK制約で完全防止 |

---

## 📁 変更ファイル一覧

| ファイル | 変更内容 |
|---------|----------|
| `migrations/011_security_hardening.sql` | 新規作成（RLS, CHECK, べき等性, DB関数） |
| `lib/coin-service.ts` | anon→admin統一, べき等性キー追加, deductBalance/creditBalance追加 |
| `app/[locale]/wallet/page.tsx` | anon→admin統一 |
