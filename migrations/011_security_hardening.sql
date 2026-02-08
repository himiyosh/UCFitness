-- ============================================
-- セキュリティ強化マイグレーション
-- Phase 4（ショップ・ギフト）に備えた防御策
-- ============================================

-- =====================
-- 1. RLS 有効化（Defense in Depth）
-- NextAuth + supabaseAdmin を使用するため、anon アクセスを完全ブロック
-- =====================

ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_balances ENABLE ROW LEVEL SECURITY;

-- anon/authenticated は何もできない（全操作を service_role 経由に強制）
-- service_role は RLS をバイパスするのでポリシー不要

-- =====================
-- 2. 出金トランザクション型の追加
-- Phase 4 で PURCHASE, GIFT_SEND, GIFT_RECEIVE を使用
-- =====================

ALTER TABLE coin_transactions 
    DROP CONSTRAINT IF EXISTS coin_transactions_type_check;

ALTER TABLE coin_transactions 
    ADD CONSTRAINT coin_transactions_type_check 
    CHECK (type IN (
        'STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'RANK_BONUS',
        'PURCHASE', 'GIFT_SEND', 'GIFT_RECEIVE'
    ));

-- =====================
-- 3. 残高の非負制約
-- total_balance が 0 未満にならないことをDB レベルで保証
-- =====================

ALTER TABLE coin_balances 
    ADD CONSTRAINT coin_balances_non_negative_balance 
    CHECK (total_balance >= 0);

-- =====================
-- 4. べき等性キー（二重処理防止）
-- 同じ操作が2回実行されても1回分しか記録されない
-- =====================

ALTER TABLE coin_transactions 
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- NULL を許容しつつ、非 NULL 値はユニークに
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_idempotency 
    ON coin_transactions(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- =====================
-- 5. 原子的な残高減算関数（Phase 4 のショップ・ギフト用）
-- FOR UPDATE ロックで race condition を防止
-- =====================

CREATE OR REPLACE FUNCTION deduct_balance(
    p_user_id UUID, 
    p_amount INTEGER,
    p_type TEXT,
    p_description TEXT,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_current_balance BIGINT;
    v_existing_tx UUID;
    v_new_tx_id UUID;
BEGIN
    -- べき等性チェック: 同じキーの取引が既にあれば何もしない
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_tx
        FROM coin_transactions
        WHERE idempotency_key = p_idempotency_key;
        
        IF v_existing_tx IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true, 
                'already_processed', true,
                'transaction_id', v_existing_tx
            );
        END IF;
    END IF;

    -- 金額バリデーション
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
    END IF;

    -- 出金タイプのバリデーション
    IF p_type NOT IN ('PURCHASE', 'GIFT_SEND') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_debit_type');
    END IF;

    -- 行ロックで排他制御
    SELECT total_balance INTO v_current_balance
    FROM coin_balances
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- 残高不足チェック
    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;
    
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'insufficient_balance',
            'current_balance', v_current_balance,
            'requested', p_amount
        );
    END IF;
    
    -- トランザクション記録（金額をマイナスで記録）
    INSERT INTO coin_transactions (user_id, date, type, amount, description, idempotency_key)
    VALUES (p_user_id, CURRENT_DATE, p_type, -p_amount, p_description, p_idempotency_key)
    RETURNING id INTO v_new_tx_id;
    
    -- 残高更新
    UPDATE coin_balances
    SET total_balance = total_balance - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'transaction_id', v_new_tx_id,
        'new_balance', v_current_balance - p_amount
    );
END;
$$ LANGUAGE plpgsql;

-- =====================
-- 6. 原子的な残高加算関数（ギフト受け取り用）
-- =====================

CREATE OR REPLACE FUNCTION credit_balance(
    p_user_id UUID, 
    p_amount INTEGER,
    p_type TEXT,
    p_description TEXT,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_existing_tx UUID;
    v_new_tx_id UUID;
    v_new_balance BIGINT;
BEGIN
    -- べき等性チェック
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_tx
        FROM coin_transactions
        WHERE idempotency_key = p_idempotency_key;
        
        IF v_existing_tx IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_processed', true,
                'transaction_id', v_existing_tx
            );
        END IF;
    END IF;

    -- 金額バリデーション
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
    END IF;

    -- 入金タイプのバリデーション
    IF p_type NOT IN ('GIFT_RECEIVE', 'RANK_BONUS') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_credit_type');
    END IF;

    -- トランザクション記録
    INSERT INTO coin_transactions (user_id, date, type, amount, description, idempotency_key)
    VALUES (p_user_id, CURRENT_DATE, p_type, p_amount, p_description, p_idempotency_key)
    RETURNING id INTO v_new_tx_id;
    
    -- 残高更新（存在しない場合はupsert）
    INSERT INTO coin_balances (user_id, total_balance, total_bonus, updated_at)
    VALUES (p_user_id, p_amount, p_amount, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET total_balance = coin_balances.total_balance + p_amount,
        total_bonus = coin_balances.total_bonus + p_amount,
        updated_at = NOW();

    SELECT total_balance INTO v_new_balance
    FROM coin_balances WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'transaction_id', v_new_tx_id,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql;

-- =====================
-- コメント追加
-- =====================
COMMENT ON FUNCTION deduct_balance IS '原子的な残高減算。FOR UPDATEロック + 残高チェック + べき等性を保証';
COMMENT ON FUNCTION credit_balance IS '原子的な残高加算。べき等性を保証';
