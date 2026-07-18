BEGIN;
INSERT INTO public.badges (code, name, description, category, type, rank) VALUES
('STREAK_3', '3 Day Streak', 'Reached daily goal for 3 consecutive days', 'STREAK', 'ACHIEVEMENT', 3),
('STREAK_7', 'Perfect Week', 'Reached daily goal for 7 consecutive days', 'STREAK', 'ACHIEVEMENT', 2),
('STREAK_30', 'Monthly Master', 'Reached daily goal for 30 consecutive days', 'STREAK', 'ACHIEVEMENT', 1),
('STREAK_100', 'Century Streak', 'Reached daily goal for 100 consecutive days', 'STREAK', 'ACHIEVEMENT', 1),
('STREAK_365', 'Yearlong Legend', 'Reached daily goal for 365 consecutive days', 'STREAK', 'ACHIEVEMENT', 1)
ON CONFLICT (code) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.user_streak_shield_uses (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    used_date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, used_date)
);
ALTER TABLE public.user_streak_shield_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_streak_shield_uses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.user_streak_shield_uses TO service_role;
INSERT INTO public.user_streak_shield_uses (user_id, used_date)
SELECT user_id, last_used_date FROM public.user_streak_shields
WHERE last_used_date IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE public.coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_type_check;
ALTER TABLE public.coin_transactions ADD CONSTRAINT coin_transactions_type_check
CHECK (type IN (
    'STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'STREAK_MILESTONE',
    'RANK_BONUS', 'LOGIN_BONUS', 'MISSION_REWARD',
    'PURCHASE', 'GIFT_SEND', 'GIFT_RECEIVE'
));
DROP INDEX IF EXISTS public.idx_coin_transactions_idempotency;
CREATE UNIQUE INDEX idx_coin_transactions_idempotency
ON public.coin_transactions(idempotency_key);
CREATE OR REPLACE FUNCTION public.recalculate_coin_balance(p_user_id uuid, p_streak integer)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_earned bigint; v_bonus bigint; v_balance bigint; v_best integer; v_rank text;
BEGIN
    IF p_user_id IS NULL OR p_streak IS NULL OR p_streak < 0 THEN
        RAISE EXCEPTION 'Invalid coin balance recalculation';
    END IF;
    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Coin balance user does not exist'; END IF;
    PERFORM 1 FROM public.coin_balances WHERE user_id = p_user_id FOR UPDATE;
    SELECT
        COALESCE(sum(amount) FILTER (WHERE type = 'STEPS'), 0),
        COALESCE(sum(amount) FILTER (WHERE type <> 'STEPS' AND amount > 0), 0),
        COALESCE(sum(amount), 0)
    INTO v_earned, v_bonus, v_balance
    FROM public.coin_transactions WHERE user_id = p_user_id;
    SELECT GREATEST(p_streak, COALESCE(best_streak, 0)) INTO v_best
    FROM public.coin_balances WHERE user_id = p_user_id;
    v_best := COALESCE(v_best, p_streak);
    v_rank := CASE
        WHEN v_earned + v_bonus >= 5000000 THEN 'TYCOON'
        WHEN v_earned + v_bonus >= 1000000 THEN 'DIAMOND'
        WHEN v_earned + v_bonus >= 500000 THEN 'FUND_MANAGER'
        WHEN v_earned + v_bonus >= 100000 THEN 'BUSINESS'
        ELSE 'BEGINNER'
    END;
    INSERT INTO public.coin_balances (
        user_id, total_balance, total_earned, total_bonus,
        current_streak, best_streak, investor_rank, updated_at
    ) VALUES (
        p_user_id, v_balance, v_earned, v_bonus, p_streak, v_best, v_rank, now()
    ) ON CONFLICT (user_id) DO UPDATE SET
        total_balance = EXCLUDED.total_balance, total_earned = EXCLUDED.total_earned,
        total_bonus = EXCLUDED.total_bonus, current_streak = EXCLUDED.current_streak,
        best_streak = EXCLUDED.best_streak, investor_rank = EXCLUDED.investor_rank,
        updated_at = EXCLUDED.updated_at;
END;
$$;
CREATE OR REPLACE FUNCTION public.deduct_balance(
    p_user_id uuid, p_amount integer, p_type text,
    p_description text, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_existing uuid; v_transaction uuid; v_balance bigint;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
    END IF;
    IF p_type NOT IN ('PURCHASE', 'GIFT_SEND') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_debit_type');
    END IF;
    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing FROM public.coin_transactions
        WHERE idempotency_key = p_idempotency_key;
        IF v_existing IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true, 'already_processed', true, 'transaction_id', v_existing
            );
        END IF;
    END IF;
    SELECT total_balance INTO v_balance FROM public.coin_balances
    WHERE user_id = p_user_id FOR UPDATE;
    IF v_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;
    IF v_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'insufficient_balance',
            'current_balance', v_balance, 'requested', p_amount
        );
    END IF;
    INSERT INTO public.coin_transactions (
        user_id, date, type, amount, description, idempotency_key
    ) VALUES (
        p_user_id, (now() AT TIME ZONE 'Asia/Tokyo')::date,
        p_type, -p_amount, p_description, p_idempotency_key
    ) RETURNING id INTO v_transaction;
    UPDATE public.coin_balances SET
        total_balance = total_balance - p_amount, updated_at = now()
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
        'success', true, 'already_processed', false,
        'transaction_id', v_transaction, 'new_balance', v_balance - p_amount
    );
END;
$$;
DROP FUNCTION IF EXISTS public.credit_balance(uuid, integer, text, text, text);
CREATE FUNCTION public.credit_balance(
    p_user_id uuid, p_amount integer, p_type text,
    p_description text, p_idempotency_key text DEFAULT NULL,
    p_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_existing uuid; v_transaction uuid; v_balance bigint;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
    END IF;
    IF p_type NOT IN ('GIFT_RECEIVE', 'RANK_BONUS', 'MISSION_REWARD') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_credit_type');
    END IF;
    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing FROM public.coin_transactions
        WHERE idempotency_key = p_idempotency_key;
        IF v_existing IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true, 'already_processed', true, 'transaction_id', v_existing
            );
        END IF;
    END IF;
    INSERT INTO public.coin_transactions (user_id, date, type, amount, description, idempotency_key)
    VALUES (
        p_user_id, COALESCE(p_date, (now() AT TIME ZONE 'Asia/Tokyo')::date),
        p_type, p_amount, p_description, p_idempotency_key
    ) RETURNING id INTO v_transaction;
    INSERT INTO public.coin_balances (user_id, total_balance, total_bonus, updated_at)
    VALUES (p_user_id, p_amount, p_amount, now()) ON CONFLICT (user_id) DO UPDATE SET
        total_balance = coin_balances.total_balance + EXCLUDED.total_balance,
        total_bonus = coin_balances.total_bonus + EXCLUDED.total_bonus,
        updated_at = EXCLUDED.updated_at
    RETURNING total_balance INTO v_balance;
    RETURN jsonb_build_object(
        'success', true, 'already_processed', false, 'transaction_id', v_transaction,
        'new_balance', v_balance
    );
END;
$$;
CREATE OR REPLACE FUNCTION public.use_streak_shield(p_user_id uuid, p_date date)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_remaining integer;
BEGIN
    IF p_user_id IS NULL OR p_date IS NULL
       OR p_date <> (now() AT TIME ZONE 'Asia/Tokyo')::date THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_date');
    END IF;
    SELECT remaining_uses INTO v_remaining FROM public.user_streak_shields
    WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF v_remaining <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_remaining');
    END IF;
    INSERT INTO public.user_streak_shield_uses (user_id, used_date)
    VALUES (p_user_id, p_date) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_used');
    END IF;
    UPDATE public.user_streak_shields SET
        remaining_uses = remaining_uses - 1, last_used_date = p_date, updated_at = now()
    WHERE user_id = p_user_id RETURNING remaining_uses INTO v_remaining;
    RETURN jsonb_build_object('success', true, 'remaining', v_remaining);
END;
$$;
CREATE OR REPLACE FUNCTION public.award_streak_milestones(p_target_date date)
RETURNS TABLE (
    awarded_user_id uuid, awarded_badge_code text,
    awarded_reward_amount integer, error_code text
)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_user_id uuid; v_goal integer; v_streak integer;
    v_milestone record; v_transaction uuid; v_key text;
    v_codes text[]; v_rewards integer[]; v_index integer; v_reward_total integer;
BEGIN
    IF p_target_date IS NULL
       OR p_target_date >= (now() AT TIME ZONE 'Asia/Tokyo')::date THEN
        RAISE EXCEPTION 'Streak target must be a completed JST day';
    END IF;
    FOR v_user_id IN
        SELECT candidate.user_id
        FROM (
            SELECT user_id FROM public.daily_steps WHERE date = p_target_date
            UNION
            SELECT user_id FROM public.user_streak_shield_uses WHERE used_date = p_target_date
        ) AS candidate
        ORDER BY candidate.user_id
    LOOP
        BEGIN
            v_codes := ARRAY[]::text[];
            v_rewards := ARRAY[]::integer[];
            v_reward_total := 0;
            SELECT step_goal INTO v_goal
            FROM public.users WHERE id = v_user_id FOR UPDATE;
            IF NOT FOUND OR v_goal IS NULL OR v_goal <= 0 THEN
                awarded_user_id := v_user_id; awarded_badge_code := NULL;
                awarded_reward_amount := 0; error_code := 'INVALID_USER_OR_GOAL';
                RETURN NEXT;
                CONTINUE;
            END IF;
            WITH days AS (
                SELECT day_offset, p_target_date - day_offset AS date
                FROM generate_series(0, 364) AS offsets(day_offset)
            ), steps AS (
                SELECT date, max(daily_steps.steps) AS value
                FROM public.daily_steps
                WHERE user_id = v_user_id
                  AND date BETWEEN p_target_date - 364 AND p_target_date
                GROUP BY date
            )
            SELECT COALESCE(min(days.day_offset) FILTER (
                WHERE NOT (
                    COALESCE(steps.value >= v_goal, false)
                    OR EXISTS (
                        SELECT 1 FROM public.user_streak_shield_uses AS shield
                        WHERE shield.user_id = v_user_id AND shield.used_date = days.date
                    )
                )
            ), 365)
            INTO v_streak
            FROM days LEFT JOIN steps USING (date);
            FOR v_milestone IN
                SELECT * FROM (VALUES
                    (7, 'STREAK_7'::text, 700),
                    (30, 'STREAK_30'::text, 3000),
                    (100, 'STREAK_100'::text, 10000),
                    (365, 'STREAK_365'::text, 36500)
                ) AS milestone(days, badge_code, reward)
                WHERE milestone.days <= v_streak
                ORDER BY milestone.days
            LOOP
                IF EXISTS (
                    SELECT 1 FROM public.user_badges
                    WHERE user_id = v_user_id
                      AND badge_code = v_milestone.badge_code
                ) THEN
                    CONTINUE;
                END IF;
                INSERT INTO public.user_badges (
                    user_id, badge_code, period_date, group_id
                ) VALUES (
                    v_user_id, v_milestone.badge_code, p_target_date, NULL
                );
                v_transaction := NULL;
                IF v_milestone.reward > 0 THEN
                    v_key := 'streak_milestone:' || v_user_id::text || ':' || v_milestone.badge_code;
                    INSERT INTO public.coin_transactions
                        (user_id, date, type, amount, description, idempotency_key)
                    VALUES (
                        v_user_id, p_target_date, 'STREAK_MILESTONE',
                        v_milestone.reward,
                        v_milestone.days || '-day streak milestone reward',
                        v_key
                    )
                    ON CONFLICT (idempotency_key) DO NOTHING
                    RETURNING id INTO v_transaction;
                    IF v_transaction IS NOT NULL THEN
                        v_reward_total := v_reward_total + v_milestone.reward;
                    END IF;
                END IF;
                v_codes := array_append(v_codes, v_milestone.badge_code);
                v_rewards := array_append(v_rewards,
                    CASE WHEN v_transaction IS NULL THEN 0 ELSE v_milestone.reward END);
            END LOOP;
            IF v_reward_total > 0 THEN
                INSERT INTO public.coin_balances (user_id, total_balance, total_bonus, updated_at)
                VALUES (v_user_id, v_reward_total, v_reward_total, now())
                ON CONFLICT (user_id) DO UPDATE SET
                    total_balance = coin_balances.total_balance + EXCLUDED.total_balance,
                    total_bonus = coin_balances.total_bonus + EXCLUDED.total_bonus,
                    updated_at = EXCLUDED.updated_at;
            END IF;
            FOR v_index IN 1..cardinality(v_codes) LOOP
                awarded_user_id := v_user_id; awarded_badge_code := v_codes[v_index];
                awarded_reward_amount := v_rewards[v_index]; error_code := NULL;
                RETURN NEXT;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            awarded_user_id := v_user_id; awarded_badge_code := NULL;
            awarded_reward_amount := 0; error_code := SQLSTATE;
            RETURN NEXT;
        END;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_balance(uuid, integer, text, text, text, date)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_balance(uuid, integer, text, text, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_coin_balance(uuid, integer)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.use_streak_shield(uuid, date)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_streak_milestones(date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid, integer, text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_balance(uuid, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_coin_balance(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.use_streak_shield(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_streak_milestones(date) TO service_role;
COMMIT;
