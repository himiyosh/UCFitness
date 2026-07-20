BEGIN;
CREATE FUNCTION public.create_group_challenge(
    p_group_id uuid, p_created_by uuid, p_type text,
    p_title text, p_description text, p_target_steps integer,
    p_start_date date, p_end_date date, p_reward_uc integer
) RETURNS TABLE(status text, challenge jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_public boolean;
    v_role text;
    v_challenge public.challenges%ROWTYPE;
BEGIN
    IF p_group_id IS NULL OR p_created_by IS NULL
       OR p_type IS DISTINCT FROM 'GROUP'
       OR p_title IS NULL OR btrim(p_title) = '' OR char_length(p_title) > 100
       OR (p_description IS NOT NULL AND char_length(p_description) > 1000)
       OR p_target_steps IS NULL OR p_target_steps <= 0
       OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date <= p_start_date
       OR p_reward_uc IS NULL OR p_reward_uc < 100 OR p_reward_uc > 10000 THEN
        RETURN QUERY SELECT 'invalid'::text, NULL::jsonb;
        RETURN;
    END IF;
    SELECT is_public INTO v_is_public
    FROM public.groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::jsonb;
        RETURN;
    END IF;
    PERFORM 1 FROM public.users WHERE id = p_created_by FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'forbidden'::text, NULL::jsonb;
        RETURN;
    END IF;
    SELECT role INTO v_role FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_created_by FOR UPDATE;
    IF v_role IS NULL THEN
        RETURN QUERY SELECT
            CASE WHEN v_is_public THEN 'forbidden' ELSE 'not_found' END::text,
            NULL::jsonb;
        RETURN;
    END IF;
    IF v_role NOT IN ('OWNER', 'ADMIN') THEN
        RETURN QUERY SELECT 'forbidden'::text, NULL::jsonb;
        RETURN;
    END IF;
    INSERT INTO public.challenges
        (title, description, type, target_steps, start_date, end_date,
         reward_uc, created_by, group_id)
    VALUES
        (btrim(p_title), NULLIF(btrim(p_description), ''), p_type, p_target_steps,
         p_start_date, p_end_date, p_reward_uc, p_created_by, p_group_id)
    RETURNING * INTO v_challenge;
    INSERT INTO public.challenge_participants (challenge_id, user_id)
    VALUES (v_challenge.id, p_created_by);
    RETURN QUERY SELECT
        'created'::text,
        jsonb_build_object(
            'id', v_challenge.id, 'title', v_challenge.title,
            'description', v_challenge.description, 'type', v_challenge.type,
            'target_steps', v_challenge.target_steps, 'start_date', v_challenge.start_date,
            'end_date', v_challenge.end_date, 'reward_uc', v_challenge.reward_uc,
            'is_active', v_challenge.is_active, 'created_by', v_challenge.created_by,
            'group_id', v_challenge.group_id,
            'created_at', v_challenge.created_at
        );
END;
$$;
COMMENT ON FUNCTION public.create_group_challenge(uuid, uuid, text, text, text, integer, date, date, integer) IS
    'Service-role boundary: atomically reauthorizes a supplied caller ID, creates one GROUP challenge, and joins its creator.';

REVOKE ALL ON FUNCTION public.create_group_challenge(uuid, uuid, text, text, text, integer, date, date, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_challenge(uuid, uuid, text, text, text, integer, date, date, integer)
    TO service_role;
COMMIT;
