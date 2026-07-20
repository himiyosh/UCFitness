BEGIN;

CREATE TABLE public.group_challenge_reward_outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    challenge_id uuid NOT NULL
        REFERENCES public.challenges(id) ON DELETE CASCADE,
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    reward_amount integer NOT NULL CHECK (reward_amount > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    claim_id uuid,
    lease_expires_at timestamptz,
    delivered_at timestamptz,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    CONSTRAINT group_challenge_reward_outbox_recipient_key
        UNIQUE (challenge_id, user_id),
    CONSTRAINT group_challenge_reward_outbox_lease_check CHECK (
        (claim_id IS NULL AND lease_expires_at IS NULL)
        OR (claim_id IS NOT NULL AND lease_expires_at IS NOT NULL)
    ),
    CONSTRAINT group_challenge_reward_outbox_delivery_check CHECK (
        delivered_at IS NULL
        OR (claim_id IS NULL AND lease_expires_at IS NULL)
    )
);

CREATE INDEX idx_group_challenge_reward_outbox_pending
    ON public.group_challenge_reward_outbox(created_at, id)
    WHERE delivered_at IS NULL;

ALTER TABLE public.group_challenge_reward_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_challenge_reward_outbox FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.group_challenge_reward_outbox
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.group_challenge_reward_outbox_id_seq
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.group_challenge_reward_outbox
    TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.group_challenge_reward_outbox_id_seq
    TO service_role;

CREATE OR REPLACE FUNCTION public.settle_group_challenge(p_challenge_id uuid)
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
    v_existing_reward integer;
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

            INSERT INTO public.group_challenge_reward_outbox (
                challenge_id,
                user_id,
                reward_amount
            ) VALUES (
                p_challenge_id,
                v_user_id,
                v_challenge.reward_uc
            )
            ON CONFLICT (challenge_id, user_id) DO NOTHING;

            SELECT reward_amount
            INTO v_existing_reward
            FROM public.group_challenge_reward_outbox
            WHERE challenge_id = p_challenge_id
              AND user_id = v_user_id;

            IF v_existing_reward IS DISTINCT FROM v_challenge.reward_uc THEN
                RAISE EXCEPTION 'GROUP challenge outbox reward mismatch for member %', v_user_id;
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

COMMENT ON TABLE public.group_challenge_reward_outbox IS
    'Durable service-role-only delivery queue for credited GROUP challenge rewards.';
COMMENT ON FUNCTION public.settle_group_challenge(uuid) IS
    'Service-role boundary for atomic, idempotent GROUP reward credit, outbox creation, and settlement.';

REVOKE ALL ON FUNCTION public.settle_group_challenge(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_group_challenge(uuid)
    TO service_role;

-- Rollback order:
-- 1. Restore the 20260721 settle_group_challenge(uuid) definition.
-- 2. Drop public.group_challenge_reward_outbox.

COMMIT;
