BEGIN;

ALTER TABLE public.group_challenge_reward_outbox
    ALTER COLUMN attempt_count TYPE bigint;

CREATE INDEX idx_group_challenge_reward_outbox_pending_user
    ON public.group_challenge_reward_outbox(
        user_id,
        lease_expires_at,
        created_at,
        id
    )
    WHERE delivered_at IS NULL;

-- These definer RPCs require the Supabase migration owner to retain BYPASSRLS.
CREATE FUNCTION public.claim_group_challenge_reward_outbox()
RETURNS TABLE (
    user_id uuid,
    challenge_count bigint,
    total_reward bigint,
    lease_id uuid,
    lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_claimed_at timestamptz;
    v_lease_id uuid := gen_random_uuid();
    v_lease_expires_at timestamptz;
    v_user_ids uuid[];
BEGIN
    v_claimed_at := clock_timestamp();

    SELECT COALESCE(
        array_agg(
            locked_user.user_id
            ORDER BY
                locked_user.first_created_at,
                locked_user.first_id,
                locked_user.user_id
        ),
        ARRAY[]::uuid[]
    )
    INTO v_user_ids
    FROM (
        WITH candidate_users AS MATERIALIZED (
            SELECT DISTINCT ON (queue.user_id)
                queue.user_id,
                queue.created_at AS first_created_at,
                queue.id AS first_id
            FROM public.group_challenge_reward_outbox AS queue
            WHERE queue.delivered_at IS NULL
              AND (
                  queue.claim_id IS NULL
                  OR queue.lease_expires_at <= v_claimed_at
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.group_challenge_reward_outbox AS active_lease
                  WHERE active_lease.user_id = queue.user_id
                    AND active_lease.delivered_at IS NULL
                    AND active_lease.claim_id IS NOT NULL
                    AND active_lease.lease_expires_at > v_claimed_at
              )
            ORDER BY queue.user_id, queue.created_at, queue.id
        )
        SELECT
            app_user.id AS user_id,
            candidate.first_created_at,
            candidate.first_id
        FROM candidate_users AS candidate
        JOIN public.users AS app_user
          ON app_user.id = candidate.user_id
        ORDER BY
            candidate.first_created_at,
            candidate.first_id,
            candidate.user_id
        LIMIT 20
        FOR UPDATE OF app_user SKIP LOCKED
    ) AS locked_user;

    -- The new statement snapshot includes rewards committed while user locks were pending.
    v_claimed_at := clock_timestamp();
    v_lease_expires_at := v_claimed_at + interval '5 minutes';
    SELECT COALESCE(
        array_agg(candidate.user_id ORDER BY candidate.ordinality),
        ARRAY[]::uuid[]
    )
    INTO v_user_ids
    FROM unnest(v_user_ids) WITH ORDINALITY AS candidate(user_id, ordinality)
    WHERE EXISTS (
        SELECT 1
        FROM public.group_challenge_reward_outbox AS queue
        WHERE queue.user_id = candidate.user_id
          AND queue.delivered_at IS NULL
          AND (
              queue.claim_id IS NULL
              OR queue.lease_expires_at <= v_claimed_at
          )
    )
      AND NOT EXISTS (
          SELECT 1
          FROM public.group_challenge_reward_outbox AS active_lease
          WHERE active_lease.user_id = candidate.user_id
            AND active_lease.delivered_at IS NULL
            AND active_lease.claim_id IS NOT NULL
            AND active_lease.lease_expires_at > v_claimed_at
      );

    RETURN QUERY
    WITH claimed_rows AS (
        UPDATE public.group_challenge_reward_outbox AS queue
        SET
            claim_id = v_lease_id,
            lease_expires_at = v_lease_expires_at
        WHERE queue.user_id = ANY(v_user_ids)
          AND queue.delivered_at IS NULL
          AND (
              queue.claim_id IS NULL
              OR queue.lease_expires_at <= v_claimed_at
          )
        RETURNING queue.user_id, queue.reward_amount
    )
    SELECT
        candidate.user_id,
        COUNT(*)::bigint,
        SUM(claimed.reward_amount),
        v_lease_id,
        v_lease_expires_at
    FROM unnest(v_user_ids) WITH ORDINALITY AS candidate(user_id, ordinality)
    JOIN claimed_rows AS claimed
      ON claimed.user_id = candidate.user_id
    GROUP BY candidate.user_id, candidate.ordinality
    ORDER BY candidate.ordinality;
END;
$$;

CREATE FUNCTION public.complete_group_challenge_reward_outbox(
    p_user_id uuid,
    p_lease_id uuid
)
RETURNS TABLE (delivered_count bigint, total_reward bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz;
    v_owned_count bigint;
    v_expired_count bigint;
    v_total_reward bigint;
BEGIN
    IF p_user_id IS NULL OR p_lease_id IS NULL THEN
        RAISE EXCEPTION 'User ID and lease ID are required';
    END IF;

    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reward outbox user does not exist';
    END IF;

    PERFORM 1
    FROM public.group_challenge_reward_outbox
    WHERE user_id = p_user_id
      AND delivered_at IS NULL
    FOR UPDATE;

    v_now := clock_timestamp();
    SELECT
        COUNT(*) FILTER (WHERE claim_id = p_lease_id),
        COUNT(*) FILTER (
            WHERE claim_id = p_lease_id
              AND lease_expires_at <= v_now
        ),
        COALESCE(
            SUM(reward_amount) FILTER (WHERE claim_id = p_lease_id),
            0::bigint
        )
    INTO v_owned_count, v_expired_count, v_total_reward
    FROM public.group_challenge_reward_outbox
    WHERE user_id = p_user_id
      AND delivered_at IS NULL;

    IF v_owned_count = 0 THEN
        RAISE EXCEPTION 'Reward outbox lease ownership mismatch';
    END IF;
    IF v_expired_count > 0 THEN
        RAISE EXCEPTION 'Reward outbox lease has expired';
    END IF;

    UPDATE public.group_challenge_reward_outbox
    SET
        delivered_at = v_now,
        claim_id = NULL,
        lease_expires_at = NULL
    WHERE user_id = p_user_id
      AND claim_id = p_lease_id
      AND delivered_at IS NULL;

    RETURN QUERY SELECT v_owned_count, v_total_reward;
END;
$$;

CREATE FUNCTION public.release_group_challenge_reward_outbox(
    p_user_id uuid,
    p_lease_id uuid
)
RETURNS TABLE (released_count bigint, total_reward bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz;
    v_owned_count bigint;
    v_expired_count bigint;
    v_max_attempt_count bigint;
    v_total_reward bigint;
BEGIN
    IF p_user_id IS NULL OR p_lease_id IS NULL THEN
        RAISE EXCEPTION 'User ID and lease ID are required';
    END IF;

    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reward outbox user does not exist';
    END IF;

    PERFORM 1
    FROM public.group_challenge_reward_outbox
    WHERE user_id = p_user_id
      AND delivered_at IS NULL
    FOR UPDATE;

    v_now := clock_timestamp();
    SELECT
        COUNT(*) FILTER (WHERE claim_id = p_lease_id),
        COUNT(*) FILTER (
            WHERE claim_id = p_lease_id
              AND lease_expires_at <= v_now
        ),
        MAX(attempt_count) FILTER (WHERE claim_id = p_lease_id),
        COALESCE(
            SUM(reward_amount) FILTER (WHERE claim_id = p_lease_id),
            0::bigint
        )
    INTO
        v_owned_count,
        v_expired_count,
        v_max_attempt_count,
        v_total_reward
    FROM public.group_challenge_reward_outbox
    WHERE user_id = p_user_id
      AND delivered_at IS NULL;

    IF v_owned_count = 0 THEN
        RAISE EXCEPTION 'Reward outbox lease ownership mismatch';
    END IF;
    IF v_expired_count > 0 THEN
        RAISE EXCEPTION 'Reward outbox lease has expired';
    END IF;
    IF v_max_attempt_count = 9223372036854775807::bigint THEN
        RAISE EXCEPTION 'Reward outbox attempt count exhausted';
    END IF;

    UPDATE public.group_challenge_reward_outbox
    SET
        claim_id = NULL,
        lease_expires_at = NULL,
        attempt_count = attempt_count + 1
    WHERE user_id = p_user_id
      AND claim_id = p_lease_id
      AND delivered_at IS NULL;

    RETURN QUERY SELECT v_owned_count, v_total_reward;
END;
$$;

COMMENT ON FUNCTION public.claim_group_challenge_reward_outbox() IS
    'Claims every currently available reward event for up to 20 users under one five-minute lease.';
COMMENT ON FUNCTION public.complete_group_challenge_reward_outbox(uuid, uuid) IS
    'Marks every reward event owned by one active user lease as delivered.';
COMMENT ON FUNCTION public.release_group_challenge_reward_outbox(uuid, uuid) IS
    'Releases every reward event owned by one active user lease and increments delivery attempts.';

REVOKE ALL ON TABLE public.group_challenge_reward_outbox
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.group_challenge_reward_outbox_id_seq
    FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_group_challenge_reward_outbox()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_group_challenge_reward_outbox(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_group_challenge_reward_outbox(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_group_challenge_reward_outbox()
    TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_group_challenge_reward_outbox(uuid, uuid)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.release_group_challenge_reward_outbox(uuid, uuid)
    TO service_role;

-- Rollback order:
-- 1. Drop the three reward outbox delivery functions and pending-user index.
-- 2. Restore attempt_count to integer only after verifying every value fits.
-- 3. Restore the 20260722 service_role table and sequence grants.

COMMIT;
