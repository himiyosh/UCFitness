BEGIN;

ALTER TABLE public.challenges
    ADD COLUMN IF NOT EXISTS settled_at timestamptz,
    ADD COLUMN IF NOT EXISTS settlement_completed boolean,
    ADD COLUMN IF NOT EXISTS settled_total_steps bigint,
    ADD COLUMN IF NOT EXISTS settled_member_count bigint;

ALTER TABLE public.challenges
    DROP CONSTRAINT IF EXISTS challenges_settlement_state_check;
ALTER TABLE public.challenges
    ADD CONSTRAINT challenges_settlement_state_check CHECK (
        (
            settled_at IS NULL
            AND settlement_completed IS NULL
            AND settled_total_steps IS NULL
            AND settled_member_count IS NULL
        )
        OR (
            settled_at IS NOT NULL
            AND settlement_completed IS NOT NULL
            AND settled_total_steps IS NOT NULL
            AND settled_member_count IS NOT NULL
            AND settled_total_steps >= 0
            AND settled_member_count >= 0
        )
    );

ALTER TABLE public.coin_transactions
    DROP CONSTRAINT IF EXISTS coin_transactions_type_check;
ALTER TABLE public.coin_transactions
    ADD CONSTRAINT coin_transactions_type_check CHECK (type IN (
        'STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'STREAK_MILESTONE',
        'RANK_BONUS', 'LOGIN_BONUS', 'MISSION_REWARD', 'GROUP_CHALLENGE_REWARD',
        'PURCHASE', 'GIFT_SEND', 'GIFT_RECEIVE'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_idempotency
    ON public.coin_transactions(idempotency_key);

CREATE OR REPLACE FUNCTION public.credit_balance(
    p_user_id uuid, p_amount integer, p_type text,
    p_description text, p_idempotency_key text DEFAULT NULL,
    p_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_existing uuid;
    v_transaction uuid;
    v_balance bigint;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
    END IF;
    IF p_type NOT IN (
        'GIFT_RECEIVE', 'RANK_BONUS', 'MISSION_REWARD', 'GROUP_CHALLENGE_REWARD'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_credit_type');
    END IF;
    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM public.coin_transactions
        WHERE idempotency_key = p_idempotency_key;
        IF v_existing IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_processed', true,
                'transaction_id', v_existing
            );
        END IF;
    END IF;
    INSERT INTO public.coin_transactions (
        user_id, date, type, amount, description, idempotency_key
    ) VALUES (
        p_user_id,
        COALESCE(p_date, (now() AT TIME ZONE 'Asia/Tokyo')::date),
        p_type,
        p_amount,
        p_description,
        p_idempotency_key
    ) RETURNING id INTO v_transaction;
    INSERT INTO public.coin_balances (
        user_id, total_balance, total_bonus, updated_at
    ) VALUES (
        p_user_id, p_amount, p_amount, now()
    ) ON CONFLICT (user_id) DO UPDATE SET
        total_balance = coin_balances.total_balance + EXCLUDED.total_balance,
        total_bonus = coin_balances.total_bonus + EXCLUDED.total_bonus,
        updated_at = EXCLUDED.updated_at
    RETURNING total_balance INTO v_balance;
    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'transaction_id', v_transaction,
        'new_balance', v_balance
    );
END;
$$;

CREATE FUNCTION public.settle_group_challenge(p_challenge_id uuid)
RETURNS TABLE (
    status text,
    is_completed boolean,
    total_steps bigint,
    member_count bigint,
    rewarded_count bigint,
    settled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_challenge public.challenges%ROWTYPE;
    v_member_ids uuid[];
    v_user_id uuid;
    v_total_steps bigint;
    v_member_count bigint;
    v_rewarded_count bigint := 0;
    v_is_completed boolean;
    v_settled_at timestamptz;
    v_credit jsonb;
BEGIN
    IF p_challenge_id IS NULL THEN
        RAISE EXCEPTION 'Challenge ID is required';
    END IF;

    SELECT challenge.*
    INTO v_challenge
    FROM public.challenges AS challenge
    WHERE challenge.id = p_challenge_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            'not_found'::text, NULL::boolean, NULL::bigint,
            NULL::bigint, NULL::bigint, NULL::timestamptz;
        RETURN;
    END IF;
    IF v_challenge.type IS DISTINCT FROM 'GROUP' OR v_challenge.group_id IS NULL THEN
        RETURN QUERY SELECT
            'invalid_type'::text, NULL::boolean, NULL::bigint,
            NULL::bigint, NULL::bigint, NULL::timestamptz;
        RETURN;
    END IF;
    IF v_challenge.settled_at IS NOT NULL THEN
        RETURN QUERY SELECT
            'already_settled'::text,
            v_challenge.settlement_completed,
            v_challenge.settled_total_steps,
            v_challenge.settled_member_count,
            CASE
                WHEN v_challenge.settlement_completed
                THEN v_challenge.settled_member_count
                ELSE 0::bigint
            END,
            v_challenge.settled_at;
        RETURN;
    END IF;
    IF v_challenge.end_date >= (now() AT TIME ZONE 'Asia/Tokyo')::date THEN
        RETURN QUERY SELECT
            'not_ended'::text, NULL::boolean, NULL::bigint,
            NULL::bigint, NULL::bigint, NULL::timestamptz;
        RETURN;
    END IF;
    IF v_challenge.target_steps <= 0 OR v_challenge.reward_uc <= 0 THEN
        RAISE EXCEPTION 'Invalid GROUP challenge settlement data';
    END IF;

    WITH current_members AS MATERIALIZED (
        SELECT member.user_id
        FROM public.group_members AS member
        WHERE member.group_id = v_challenge.group_id
    ),
    member_steps AS (
        SELECT
            member.user_id,
            COALESCE(
                SUM(step.steps::bigint) FILTER (WHERE step.steps > 0),
                0::bigint
            ) AS total_steps
        FROM current_members AS member
        LEFT JOIN public.daily_steps AS step
          ON step.user_id = member.user_id
         AND step.date >= v_challenge.start_date
         AND step.date <= v_challenge.end_date
        GROUP BY member.user_id
    )
    SELECT
        COALESCE(
            array_agg(member_steps.user_id ORDER BY member_steps.user_id),
            ARRAY[]::uuid[]
        ),
        COALESCE(SUM(member_steps.total_steps), 0::bigint),
        COUNT(*)::bigint
    INTO v_member_ids, v_total_steps, v_member_count
    FROM member_steps;

    v_is_completed := v_total_steps >= v_challenge.target_steps::bigint;
    v_settled_at := now();

    IF v_is_completed THEN
        FOREACH v_user_id IN ARRAY v_member_ids LOOP
            v_credit := public.credit_balance(
                v_user_id,
                v_challenge.reward_uc,
                'GROUP_CHALLENGE_REWARD',
                'Group challenge completion reward',
                'group_challenge_reward:' || p_challenge_id::text || ':' || v_user_id::text,
                v_challenge.end_date
            );
            IF COALESCE((v_credit ->> 'success')::boolean, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'GROUP challenge credit failed for member %', v_user_id;
            END IF;
            v_rewarded_count := v_rewarded_count + 1;
        END LOOP;
    END IF;

    UPDATE public.challenge_participants AS participant
    SET
        is_completed = v_is_completed AND participant.user_id = ANY(v_member_ids),
        completed_at = CASE
            WHEN v_is_completed AND participant.user_id = ANY(v_member_ids)
            THEN v_settled_at
            ELSE NULL
        END
    WHERE participant.challenge_id = p_challenge_id;

    UPDATE public.challenges
    SET
        settled_at = v_settled_at,
        settlement_completed = v_is_completed,
        settled_total_steps = v_total_steps,
        settled_member_count = v_member_count
    WHERE id = p_challenge_id;

    RETURN QUERY SELECT
        'settled'::text,
        v_is_completed,
        v_total_steps,
        v_member_count,
        v_rewarded_count,
        v_settled_at;
END;
$$;

COMMENT ON FUNCTION public.settle_group_challenge(uuid) IS
    'Service-role boundary for atomic, idempotent post-period GROUP challenge settlement.';

REVOKE ALL ON FUNCTION public.credit_balance(uuid, integer, text, text, text, date)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_group_challenge(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid, integer, text, text, text, date)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_group_challenge(uuid)
    TO service_role;

COMMIT;
