BEGIN;

CREATE TABLE public.group_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    CHECK (expires_at > created_at)
);

CREATE INDEX idx_group_invites_group_expiry
ON public.group_invites (group_id, expires_at);

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.group_invites FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_group_invite(
    p_group_id uuid,
    p_created_by uuid,
    p_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_expires_at timestamptz;
BEGIN
    IF p_group_id IS NULL OR p_created_by IS NULL
       OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    PERFORM 1 FROM public.groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    PERFORM 1 FROM public.users WHERE id = p_created_by FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    SELECT role INTO v_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_created_by
    FOR UPDATE;

    IF v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN') THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF (
        SELECT count(*) >= 20
        FROM public.group_invites
        WHERE group_id = p_group_id AND expires_at > now()
    ) THEN
        RETURN jsonb_build_object('status', 'rate_limited');
    END IF;

    INSERT INTO public.group_invites (group_id, token_hash, created_by)
    VALUES (p_group_id, p_token_hash, p_created_by)
    RETURNING expires_at INTO v_expires_at;

    RETURN jsonb_build_object('status', 'created', 'expiresAt', v_expires_at);
END;
$$;

CREATE FUNCTION public.join_group_with_invite(
    p_token_hash text,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_group_id uuid;
    v_expires_at timestamptz;
    v_joined boolean;
BEGIN
    IF p_user_id IS NULL OR p_token_hash IS NULL
       OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    SELECT group_id INTO v_group_id
    FROM public.group_invites
    WHERE token_hash = p_token_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    PERFORM 1 FROM public.groups WHERE id = v_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    SELECT expires_at INTO v_expires_at
    FROM public.group_invites
    WHERE token_hash = p_token_hash AND group_id = v_group_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF v_expires_at <= now() THEN
        RETURN jsonb_build_object('status', 'expired');
    END IF;

    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_group_id, p_user_id, 'MEMBER')
    ON CONFLICT (group_id, user_id) DO NOTHING;
    v_joined := FOUND;

    UPDATE public.users
    SET group_keyword = group_keyword
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'status', CASE WHEN v_joined THEN 'joined' ELSE 'already_member' END,
        'groupId', v_group_id
    );
END;
$$;

CREATE FUNCTION public.validate_user_group_keywords()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    SELECT COALESCE(
        array_agg(
            groups.keyword
            ORDER BY COALESCE(array_position(NEW.group_keyword, groups.keyword), 2147483647),
                     memberships.joined_at,
                     groups.id
        ),
        ARRAY[]::text[]
    )
    INTO NEW.group_keyword
    FROM public.group_members AS memberships
    JOIN public.groups AS groups ON groups.id = memberships.group_id
    WHERE memberships.user_id = NEW.id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_user_group_keywords_before_update
BEFORE UPDATE OF group_keyword ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.validate_user_group_keywords();

REVOKE ALL ON FUNCTION public.create_group_invite(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_group_with_invite(text, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_user_group_keywords()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_invite(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_group_with_invite(text, uuid) TO service_role;

COMMIT;
