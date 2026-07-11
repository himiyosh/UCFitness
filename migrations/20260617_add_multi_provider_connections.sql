BEGIN;

CREATE TABLE IF NOT EXISTS public.user_auth_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('fitbit', 'google')),
    provider_account_id text NOT NULL,
    email_at_link text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_auth_identities_provider_account_unique
        UNIQUE (provider, provider_account_id),
    CONSTRAINT user_auth_identities_user_provider_unique
        UNIQUE (user_id, provider)
);

COMMENT ON TABLE public.user_auth_identities IS
    'Explicitly linked sign-in identities. Email matching must not create links.';

ALTER TABLE public.user_auth_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_auth_identities FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS user_auth_identities_user_id_idx
    ON public.user_auth_identities (user_id);

CREATE TABLE IF NOT EXISTS public.fitness_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('fitbit', 'google_health')),
    provider_user_id text,
    legacy_provider_user_id text,
    access_token_encrypted text,
    refresh_token_encrypted text,
    access_token_expires_at bigint,
    scopes text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disconnected', 'reauthorization_required', 'error')),
    last_error_code text,
    last_synced_at timestamptz,
    history_synced_at timestamptz,
    sync_claim_id uuid,
    sync_claimed_at timestamptz,
    consented_at timestamptz NOT NULL DEFAULT now(),
    connected_at timestamptz NOT NULL DEFAULT now(),
    disconnected_at timestamptz,
    provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fitness_connections_user_provider_unique
        UNIQUE (user_id, provider)
);

ALTER TABLE public.fitness_connections
    ADD COLUMN IF NOT EXISTS history_synced_at timestamptz;
ALTER TABLE public.fitness_connections
    ADD COLUMN IF NOT EXISTS sync_claim_id uuid;
ALTER TABLE public.fitness_connections
    ADD COLUMN IF NOT EXISTS sync_claimed_at timestamptz;

COMMENT ON TABLE public.fitness_connections IS
    'Health data connections kept separate from sign-in identities.';
COMMENT ON COLUMN public.fitness_connections.legacy_provider_user_id IS
    'Used only to verify the official Fitbit-to-Google-Health migration mapping.';
COMMENT ON COLUMN public.fitness_connections.access_token_encrypted IS
    'AES-256-GCM encrypted application token envelope.';
COMMENT ON COLUMN public.fitness_connections.refresh_token_encrypted IS
    'AES-256-GCM encrypted application token envelope.';
COMMENT ON COLUMN public.fitness_connections.history_synced_at IS
    'Set after the one-time authoritative history replacement completes.';
COMMENT ON COLUMN public.fitness_connections.sync_claim_id IS
    'Opaque lease owner used to serialize per-user provider synchronization.';
COMMENT ON COLUMN public.fitness_connections.sync_claimed_at IS
    'Lease acquisition time; abandoned leases become reclaimable after 30 minutes.';

ALTER TABLE public.fitness_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fitness_connections FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS fitness_connections_user_status_idx
    ON public.fitness_connections (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS fitness_connections_provider_user_unique_idx
    ON public.fitness_connections (provider, provider_user_id)
    WHERE provider_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_google_health_connection(
    p_user_id uuid,
    p_provider_user_id text,
    p_legacy_provider_user_id text,
    p_access_token_encrypted text,
    p_refresh_token_encrypted text,
    p_access_token_expires_at bigint,
    p_scopes text[]
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    existing_provider_user_id text;
    existing_refresh_token_encrypted text;
    persisted_refresh_token_encrypted text;
BEGIN
    IF p_user_id IS NULL
       OR p_provider_user_id IS NULL
       OR btrim(p_provider_user_id) = ''
       OR (
           p_legacy_provider_user_id IS NOT NULL
           AND btrim(p_legacy_provider_user_id) = ''
       )
       OR p_access_token_encrypted IS NULL
       OR btrim(p_access_token_encrypted) = ''
       OR (
           p_refresh_token_encrypted IS NOT NULL
           AND btrim(p_refresh_token_encrypted) = ''
       )
       OR p_access_token_expires_at IS NULL
       OR p_access_token_expires_at <= 0
       OR p_scopes IS NULL
       OR array_position(p_scopes, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'Google Health connection has invalid arguments';
    END IF;

    PERFORM 1
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Google Health connection user does not exist';
    END IF;

    SELECT
        provider_user_id,
        refresh_token_encrypted
    INTO
        existing_provider_user_id,
        existing_refresh_token_encrypted
    FROM public.fitness_connections
    WHERE user_id = p_user_id
      AND provider = 'google_health';

    IF FOUND
       AND existing_provider_user_id IS NOT NULL
       AND existing_provider_user_id <> p_provider_user_id THEN
        RAISE EXCEPTION 'Google Health provider identity mismatch';
    END IF;

    persisted_refresh_token_encrypted := COALESCE(
        p_refresh_token_encrypted,
        existing_refresh_token_encrypted
    );
    IF persisted_refresh_token_encrypted IS NULL THEN
        RAISE EXCEPTION 'Google Health refresh token is required';
    END IF;

    INSERT INTO public.fitness_connections AS existing (
        user_id,
        provider,
        provider_user_id,
        legacy_provider_user_id,
        access_token_encrypted,
        refresh_token_encrypted,
        access_token_expires_at,
        scopes,
        status,
        last_error_code,
        consented_at,
        connected_at,
        disconnected_at,
        sync_claim_id,
        sync_claimed_at,
        provider_metadata,
        updated_at
    )
    VALUES (
        p_user_id,
        'google_health',
        p_provider_user_id,
        p_legacy_provider_user_id,
        p_access_token_encrypted,
        persisted_refresh_token_encrypted,
        p_access_token_expires_at,
        p_scopes,
        'active',
        NULL,
        now(),
        now(),
        NULL,
        NULL,
        NULL,
        jsonb_build_object(
            'tokenStorage',
            'application-aes-256-gcm',
            'tokenEnvelopeVersion',
            2
        ),
        now()
    )
    ON CONFLICT (user_id, provider) DO UPDATE
    SET
        provider_user_id = EXCLUDED.provider_user_id,
        legacy_provider_user_id = COALESCE(
            EXCLUDED.legacy_provider_user_id,
            existing.legacy_provider_user_id
        ),
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        scopes = EXCLUDED.scopes,
        status = 'active',
        last_error_code = NULL,
        consented_at = EXCLUDED.consented_at,
        connected_at = EXCLUDED.connected_at,
        disconnected_at = NULL,
        sync_claim_id = NULL,
        sync_claimed_at = NULL,
        provider_metadata = EXCLUDED.provider_metadata,
        updated_at = now();

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_google_health_connection(
    uuid,
    text,
    text,
    text,
    text,
    bigint,
    text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_google_health_connection(
    uuid,
    text,
    text,
    text,
    text,
    bigint,
    text[]
) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_user_fitbit_connection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.provider IS DISTINCT FROM 'fitbit' OR NEW.provider_account_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.user_auth_identities (
        user_id,
        provider,
        provider_account_id,
        email_at_link,
        updated_at
    )
    VALUES (
        NEW.id,
        'fitbit',
        NEW.provider_account_id,
        NEW.email,
        now()
    )
    ON CONFLICT (user_id, provider) DO UPDATE
    SET
        provider_account_id = EXCLUDED.provider_account_id,
        email_at_link = COALESCE(
            EXCLUDED.email_at_link,
            public.user_auth_identities.email_at_link
        ),
        updated_at = now();

    INSERT INTO public.fitness_connections (
        user_id,
        provider,
        provider_user_id,
        scopes,
        status,
        provider_metadata,
        updated_at
    )
    VALUES (
        NEW.id,
        'fitbit',
        NEW.provider_account_id,
        ARRAY['activity', 'profile'],
        'active',
        jsonb_build_object('tokenStorage', 'legacy_users'),
        now()
    )
    ON CONFLICT (user_id, provider) DO UPDATE
    SET
        provider_user_id = EXCLUDED.provider_user_id,
        scopes = EXCLUDED.scopes,
        provider_metadata = EXCLUDED.provider_metadata,
        updated_at = now();

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_fitbit_connection()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_fitbit_connection()
    TO service_role;

DROP TRIGGER IF EXISTS sync_user_fitbit_connection_trigger ON public.users;
CREATE TRIGGER sync_user_fitbit_connection_trigger
AFTER INSERT OR UPDATE OF provider, provider_account_id, email
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_fitbit_connection();

INSERT INTO public.user_auth_identities (
    user_id,
    provider,
    provider_account_id,
    email_at_link
)
SELECT
    id,
    provider,
    provider_account_id,
    email
FROM public.users
WHERE provider IN ('fitbit', 'google')
  AND provider_account_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.fitness_connections (
    user_id,
    provider,
    provider_user_id,
    scopes,
    status,
    provider_metadata
)
SELECT
    id,
    'fitbit',
    provider_account_id,
    ARRAY['activity', 'profile'],
    'active',
    jsonb_build_object('tokenStorage', 'legacy_users')
FROM public.users
WHERE provider = 'fitbit'
  AND provider_account_id IS NOT NULL
ON CONFLICT (user_id, provider) DO NOTHING;

CREATE OR REPLACE FUNCTION public.replace_daily_steps_range(
    p_user_id uuid,
    p_start_date date,
    p_end_date date,
    p_rows jsonb,
    p_claim_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF p_user_id IS NULL
       OR p_claim_id IS NULL
       OR p_start_date IS NULL
       OR p_end_date IS NULL
       OR p_start_date > p_end_date
       OR p_end_date - p_start_date > 364 THEN
        RAISE EXCEPTION 'Daily step replacement range must be between 1 and 365 days';
    END IF;

    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'Daily step replacement rows must be a JSON array';
    END IF;

    PERFORM 1
    FROM public.fitness_connections
    WHERE user_id = p_user_id
      AND provider = 'google_health'
      AND status = 'active'
      AND sync_claim_id = p_claim_id
      AND sync_claimed_at IS NOT NULL
      AND sync_claimed_at >= now() - interval '30 minutes'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Google Health sync lease is not active';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_rows) AS row_data(date date, steps integer)
        WHERE row_data.date IS NULL
           OR row_data.date < p_start_date
           OR row_data.date > p_end_date
           OR row_data.steps IS NULL
           OR row_data.steps < 0
    ) THEN
        RAISE EXCEPTION 'Daily step replacement rows are outside the requested range or invalid';
    END IF;

    DELETE FROM public.daily_steps
    WHERE user_id = p_user_id
      AND date BETWEEN p_start_date AND p_end_date;

    INSERT INTO public.daily_steps (
        user_id,
        date,
        steps,
        updated_at
    )
    SELECT
        p_user_id,
        row_data.date,
        max(row_data.steps),
        now()
    FROM jsonb_to_recordset(p_rows) AS row_data(date date, steps integer)
    GROUP BY row_data.date
    ON CONFLICT (user_id, date) DO UPDATE
    SET
        steps = EXCLUDED.steps,
        updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_daily_steps_range(uuid, date, date, jsonb, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_daily_steps_range(uuid, date, date, jsonb, uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_daily_steps_max(
    p_user_id uuid,
    p_date date,
    p_steps integer,
    p_claim_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    persisted_steps integer;
BEGIN
    IF p_user_id IS NULL
       OR p_claim_id IS NULL
       OR p_date IS NULL
       OR p_steps IS NULL
       OR p_steps < 0 THEN
        RAISE EXCEPTION 'Daily steps must be a non-negative integer';
    END IF;

    PERFORM 1
    FROM public.fitness_connections
    WHERE user_id = p_user_id
      AND provider = 'google_health'
      AND status = 'active'
      AND sync_claim_id = p_claim_id
      AND sync_claimed_at IS NOT NULL
      AND sync_claimed_at >= now() - interval '30 minutes'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Google Health sync lease is not active';
    END IF;

    INSERT INTO public.daily_steps AS existing (
        user_id,
        date,
        steps,
        updated_at
    )
    VALUES (
        p_user_id,
        p_date,
        p_steps,
        now()
    )
    ON CONFLICT (user_id, date) DO UPDATE
    SET
        steps = GREATEST(existing.steps, EXCLUDED.steps),
        updated_at = now()
    RETURNING steps INTO persisted_steps;

    RETURN persisted_steps;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_daily_steps_max(uuid, date, integer, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_daily_steps_max(uuid, date, integer, uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_fitbit_daily_steps_max(
    p_user_id uuid,
    p_date date,
    p_steps integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    google_health_status text;
    persisted_steps integer;
BEGIN
    IF p_user_id IS NULL
       OR p_date IS NULL
       OR p_steps IS NULL
       OR p_steps < 0 THEN
        RAISE EXCEPTION 'Daily steps must be a non-negative integer';
    END IF;

    PERFORM 1
    FROM public.users
    WHERE id = p_user_id
      AND provider = 'fitbit'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fitbit user is not available';
    END IF;

    SELECT status
    INTO google_health_status
    FROM public.fitness_connections
    WHERE user_id = p_user_id
      AND provider = 'google_health'
    FOR UPDATE;

    IF google_health_status IS NOT NULL
       AND google_health_status <> 'disconnected' THEN
        RAISE EXCEPTION 'Google Health remains the selected step source';
    END IF;

    INSERT INTO public.daily_steps AS existing (
        user_id,
        date,
        steps,
        updated_at
    )
    VALUES (
        p_user_id,
        p_date,
        p_steps,
        now()
    )
    ON CONFLICT (user_id, date) DO UPDATE
    SET
        steps = GREATEST(existing.steps, EXCLUDED.steps),
        updated_at = now()
    RETURNING steps INTO persisted_steps;

    RETURN persisted_steps;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_fitbit_daily_steps_max(uuid, date, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_fitbit_daily_steps_max(uuid, date, integer)
    TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_fitbit_daily_steps_batch(
    p_user_id uuid,
    p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    google_health_status text;
    google_health_history_synced_at timestamptz;
    persisted_count integer := 0;
BEGIN
    IF p_user_id IS NULL
       OR p_rows IS NULL
       OR jsonb_typeof(p_rows) <> 'array'
       OR jsonb_array_length(p_rows) > 1000 THEN
        RAISE EXCEPTION 'Fitbit history batch has invalid arguments';
    END IF;

    PERFORM 1
    FROM public.users
    WHERE id = p_user_id
      AND provider = 'fitbit'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fitbit user is not available';
    END IF;

    SELECT
        status,
        history_synced_at
    INTO
        google_health_status,
        google_health_history_synced_at
    FROM public.fitness_connections
    WHERE user_id = p_user_id
      AND provider = 'google_health'
    FOR UPDATE;

    IF google_health_status IS NOT NULL
       AND (
           google_health_status <> 'disconnected'
           OR google_health_history_synced_at IS NOT NULL
       ) THEN
        RAISE EXCEPTION 'Google Health history remains authoritative';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_rows) AS row_data(
            date date,
            steps integer
        )
        WHERE row_data.date IS NULL
           OR row_data.steps IS NULL
           OR row_data.steps < 0
    ) THEN
        RAISE EXCEPTION 'Fitbit history batch contains invalid rows';
    END IF;

    INSERT INTO public.daily_steps AS existing (
        user_id,
        date,
        steps,
        updated_at
    )
    SELECT
        p_user_id,
        row_data.date,
        row_data.steps,
        now()
    FROM jsonb_to_recordset(p_rows) AS row_data(
        date date,
        steps integer
    )
    ON CONFLICT (user_id, date) DO UPDATE
    SET
        steps = GREATEST(existing.steps, EXCLUDED.steps),
        updated_at = now();

    GET DIAGNOSTICS persisted_count = ROW_COUNT;
    RETURN persisted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_fitbit_daily_steps_batch(uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_fitbit_daily_steps_batch(uuid, jsonb)
    TO service_role;

CREATE OR REPLACE FUNCTION public.claim_google_health_sync(
    p_user_id uuid,
    p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    claimed_history_synced_at timestamptz;
BEGIN
    IF p_user_id IS NULL OR p_claim_id IS NULL THEN
        RAISE EXCEPTION 'Google Health sync claim requires user and claim identifiers';
    END IF;

    UPDATE public.fitness_connections
    SET
        sync_claim_id = p_claim_id,
        sync_claimed_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id
      AND provider = 'google_health'
      AND status = 'active'
      AND (
          sync_claim_id IS NULL
          OR sync_claimed_at IS NULL
          OR sync_claimed_at < now() - interval '30 minutes'
      )
    RETURNING history_synced_at INTO claimed_history_synced_at;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('acquired', false);
    END IF;

    RETURN jsonb_build_object(
        'acquired',
        true,
        'historySyncedAt',
        claimed_history_synced_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_google_health_sync(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_health_sync(uuid, uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.update_google_health_tokens(
    p_user_id uuid,
    p_claim_id uuid,
    p_access_token_encrypted text,
    p_refresh_token_encrypted text,
    p_access_token_expires_at bigint,
    p_scopes text[]
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    updated boolean := false;
BEGIN
    IF p_user_id IS NULL
       OR p_claim_id IS NULL
       OR p_access_token_encrypted IS NULL
       OR btrim(p_access_token_encrypted) = ''
       OR (
           p_refresh_token_encrypted IS NOT NULL
           AND btrim(p_refresh_token_encrypted) = ''
       )
       OR p_access_token_expires_at IS NULL
       OR p_access_token_expires_at <= 0
       OR p_scopes IS NULL
       OR array_position(p_scopes, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'Google Health token update has invalid arguments';
    END IF;

    UPDATE public.fitness_connections
    SET
        access_token_encrypted = p_access_token_encrypted,
        refresh_token_encrypted = COALESCE(
            p_refresh_token_encrypted,
            refresh_token_encrypted
        ),
        access_token_expires_at = p_access_token_expires_at,
        scopes = p_scopes,
        last_error_code = NULL,
        updated_at = now()
    WHERE user_id = p_user_id
      AND provider = 'google_health'
      AND status = 'active'
      AND sync_claim_id = p_claim_id
      AND sync_claimed_at IS NOT NULL
      AND sync_claimed_at >= now() - interval '30 minutes'
    RETURNING true INTO updated;

    RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_google_health_tokens(
    uuid,
    uuid,
    text,
    text,
    bigint,
    text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_google_health_tokens(
    uuid,
    uuid,
    text,
    text,
    bigint,
    text[]
) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_google_health_reauthorization_required(
    p_user_id uuid,
    p_claim_id uuid,
    p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    updated boolean := false;
BEGIN
    IF p_user_id IS NULL
       OR p_claim_id IS NULL
       OR p_error_code IS NULL
       OR btrim(p_error_code) = '' THEN
        RAISE EXCEPTION 'Google Health reauthorization update has invalid arguments';
    END IF;

    UPDATE public.fitness_connections
    SET
        status = 'reauthorization_required',
        last_error_code = p_error_code,
        sync_claim_id = NULL,
        sync_claimed_at = NULL,
        updated_at = now()
    WHERE user_id = p_user_id
      AND provider = 'google_health'
      AND status = 'active'
      AND sync_claim_id = p_claim_id
      AND sync_claimed_at IS NOT NULL
      AND sync_claimed_at >= now() - interval '30 minutes'
    RETURNING true INTO updated;

    RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_google_health_reauthorization_required(
    uuid,
    uuid,
    text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_google_health_reauthorization_required(
    uuid,
    uuid,
    text
) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_google_health_synced(
    p_user_id uuid,
    p_claim_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    updated boolean := false;
BEGIN
    IF p_user_id IS NULL OR p_claim_id IS NULL THEN
        RAISE EXCEPTION 'Google Health sync completion requires user and claim identifiers';
    END IF;

    UPDATE public.fitness_connections
    SET
        last_synced_at = now(),
        last_error_code = NULL,
        updated_at = now()
    WHERE user_id = p_user_id
      AND provider = 'google_health'
      AND status = 'active'
      AND sync_claim_id = p_claim_id
      AND sync_claimed_at IS NOT NULL
      AND sync_claimed_at >= now() - interval '30 minutes'
    RETURNING true INTO updated;

    RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_google_health_synced(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_google_health_synced(uuid, uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.mark_google_health_history_synced(
    p_user_id uuid,
    p_claim_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    marked boolean := false;
BEGIN
    IF p_user_id IS NULL OR p_claim_id IS NULL THEN
        RAISE EXCEPTION 'Google Health history completion requires user and claim identifiers';
    END IF;

    UPDATE public.fitness_connections
    SET
        history_synced_at = now(),
        last_synced_at = now(),
        last_error_code = NULL,
        updated_at = now()
    WHERE user_id = p_user_id
      AND provider = 'google_health'
      AND status = 'active'
      AND sync_claim_id = p_claim_id
      AND sync_claimed_at IS NOT NULL
      AND sync_claimed_at >= now() - interval '30 minutes'
    RETURNING true INTO marked;

    RETURN marked;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_google_health_history_synced(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_google_health_history_synced(uuid, uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.release_google_health_sync(
    p_user_id uuid,
    p_claim_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF p_user_id IS NULL OR p_claim_id IS NULL THEN
        RAISE EXCEPTION 'Google Health sync release requires user and claim identifiers';
    END IF;

    UPDATE public.fitness_connections
    SET
        sync_claim_id = NULL,
        sync_claimed_at = NULL,
        updated_at = now()
    WHERE user_id = p_user_id
      AND provider = 'google_health'
      AND sync_claim_id = p_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_google_health_sync(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_google_health_sync(uuid, uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.disconnect_google_health(
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    encrypted_tokens jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Google Health disconnect requires a user identifier';
    END IF;

    SELECT jsonb_build_object(
        'accessTokenEncrypted',
        access_token_encrypted,
        'refreshTokenEncrypted',
        refresh_token_encrypted
    )
    INTO encrypted_tokens
    FROM public.fitness_connections
    WHERE user_id = p_user_id
      AND provider = 'google_health'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE public.fitness_connections
    SET
        access_token_encrypted = NULL,
        refresh_token_encrypted = NULL,
        access_token_expires_at = NULL,
        status = 'disconnected',
        last_error_code = NULL,
        sync_claim_id = NULL,
        sync_claimed_at = NULL,
        disconnected_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id
      AND provider = 'google_health';

    RETURN encrypted_tokens;
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_google_health(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_google_health(uuid)
    TO service_role;

COMMIT;
