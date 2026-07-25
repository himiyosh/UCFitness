BEGIN;
SET LOCAL search_path = '';

DO $preconditions$
DECLARE
    users_table regclass := pg_catalog.to_regclass('public.users');
BEGIN
    IF users_table IS NULL
       OR (SELECT relkind FROM pg_catalog.pg_class WHERE oid = users_table) <> 'r'
       OR (SELECT relnamespace FROM pg_catalog.pg_class WHERE oid = users_table) <> pg_catalog.to_regnamespace('public')
       OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
        RAISE EXCEPTION 'LL083: notification outbox prerequisites are unavailable';
    END IF;
    IF pg_catalog.to_regclass('public.notification_delivery_outbox') IS NOT NULL OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public' AND procedure.proname = ANY (ARRAY[
            'claim_notification_delivery_outbox', 'complete_notification_delivery_outbox',
            'release_notification_delivery_outbox'
        ])
    ) THEN RAISE EXCEPTION 'LL083: notification outbox objects already exist'; END IF;
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_roles
        WHERE rolname = ANY (ARRAY['postgres', 'service_role', 'anon', 'authenticated'])) <> 4
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres' AND rolbypassrls)
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
        RAISE EXCEPTION 'LL083: notification outbox roles are unsafe';
    END IF;
    LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = users_table AND attname = 'id' AND atttypid = 'uuid'::pg_catalog.regtype
          AND attnotnull AND attgenerated = ''
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = users_table AND contype = 'p'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = users_table AND attname = 'id')]::smallint[]
    ) THEN RAISE EXCEPTION 'LL083: public.users identity contract changed'; END IF;
END;
$preconditions$;

CREATE TABLE public.notification_delivery_outbox (
    id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    notification_type text NOT NULL,
    occurrence_key text NOT NULL,
    user_id uuid NOT NULL,
    state text NOT NULL DEFAULT 'pending',
    lease_owner uuid,
    claim_token uuid,
    lease_until timestamptz,
    attempt_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    completed_at timestamptz,
    last_failed_at timestamptz,
    retain_until timestamptz NOT NULL,
    CONSTRAINT notification_delivery_outbox_pkey PRIMARY KEY (id),
    CONSTRAINT notification_delivery_outbox_user_fkey FOREIGN KEY (user_id)
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT notification_delivery_outbox_occurrence_user_key
        UNIQUE (notification_type, occurrence_key, user_id),
    CONSTRAINT notification_delivery_outbox_occurrence_check CHECK (
        (notification_type = 'step-reminder'
         AND occurrence_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' AND pg_catalog.to_char(pg_catalog.to_date(occurrence_key, 'FXYYYY-MM-DD'), 'YYYY-MM-DD') = occurrence_key)
        OR (notification_type = 'weekly-summary'
         AND occurrence_key ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' AND pg_catalog.to_char(pg_catalog.to_date(occurrence_key || '-1', 'FXIYYY-"W"IW-ID'), 'IYYY-"W"IW') = occurrence_key)
    ),
    CONSTRAINT notification_delivery_outbox_attempt_count_check CHECK (attempt_count BETWEEN 0 AND 5),
    CONSTRAINT notification_delivery_outbox_timeline_check CHECK (
        updated_at >= created_at AND retain_until >= created_at + interval '90 days'
        AND (completed_at IS NULL OR completed_at >= created_at)
        AND (last_failed_at IS NULL OR last_failed_at <= updated_at)
        AND (state NOT IN ('completed', 'failed') OR retain_until >= COALESCE(completed_at, last_failed_at) + interval '90 days')
    ),
    CONSTRAINT notification_delivery_outbox_state_lease_check CHECK (
        (state = 'pending' AND attempt_count < 5 AND lease_owner IS NULL AND claim_token IS NULL
         AND lease_until IS NULL AND completed_at IS NULL)
        OR (state = 'claimed' AND attempt_count BETWEEN 1 AND 5 AND lease_owner IS NOT NULL
         AND claim_token IS NOT NULL AND lease_until IS NOT NULL AND completed_at IS NULL)
        OR (state = 'completed' AND attempt_count BETWEEN 1 AND 5 AND lease_owner IS NOT NULL
         AND claim_token IS NOT NULL AND lease_until IS NOT NULL AND completed_at IS NOT NULL
         AND completed_at < lease_until)
        OR (state = 'failed' AND attempt_count = 5 AND lease_owner IS NULL AND claim_token IS NULL
         AND lease_until IS NULL AND completed_at IS NULL AND last_failed_at IS NOT NULL)
    )
);
ALTER TABLE public.notification_delivery_outbox OWNER TO postgres;
CREATE INDEX notification_delivery_outbox_retention_idx
    ON public.notification_delivery_outbox(retain_until, id) WHERE state IN ('completed', 'failed');
ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.notification_delivery_outbox
    FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.claim_notification_delivery_outbox(
    p_notification_type text, p_occurrence_key text, p_user_ids uuid[], p_lease_owner uuid
) RETURNS TABLE (user_id uuid, claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_requested_users uuid[];
    v_locked_users uuid[];
BEGIN
    IF p_notification_type IS NULL OR p_occurrence_key IS NULL
       OR p_lease_owner IS NULL OR p_user_ids IS NULL
       OR pg_catalog.cardinality(p_user_ids) NOT BETWEEN 1 AND 20
       OR pg_catalog.array_position(p_user_ids, NULL::uuid) IS NOT NULL
       OR NOT (
           (p_notification_type = 'step-reminder'
            AND p_occurrence_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' AND pg_catalog.to_char(pg_catalog.to_date(p_occurrence_key, 'FXYYYY-MM-DD'), 'YYYY-MM-DD') = p_occurrence_key)
           OR (p_notification_type = 'weekly-summary'
            AND p_occurrence_key ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' AND pg_catalog.to_char(pg_catalog.to_date(p_occurrence_key || '-1', 'FXIYYY-"W"IW-ID'), 'IYYY-"W"IW') = p_occurrence_key)
       ) THEN RAISE EXCEPTION 'Invalid notification outbox claim input'; END IF;

    SELECT pg_catalog.array_agg(requested.user_id ORDER BY requested.user_id) INTO v_requested_users
    FROM (SELECT DISTINCT input.user_id
          FROM pg_catalog.unnest(p_user_ids) AS input(user_id)) AS requested;
    SELECT pg_catalog.array_agg(locked_user.id ORDER BY locked_user.id) INTO v_locked_users
    FROM (SELECT app_user.id FROM public.users AS app_user
          WHERE app_user.id = ANY (v_requested_users)
          ORDER BY app_user.id FOR UPDATE OF app_user) AS locked_user;
    IF v_locked_users IS DISTINCT FROM v_requested_users THEN
        RAISE EXCEPTION 'Notification outbox user set changed';
    END IF;

    INSERT INTO public.notification_delivery_outbox (
        notification_type, occurrence_key, user_id, created_at, updated_at, retain_until
    )
    SELECT p_notification_type, p_occurrence_key, requested.user_id, v_now, v_now,
           v_now + interval '90 days'
    FROM pg_catalog.unnest(v_locked_users) AS requested(user_id) ORDER BY requested.user_id
    ON CONFLICT ON CONSTRAINT notification_delivery_outbox_occurrence_user_key DO NOTHING;
    PERFORM ledger.id FROM public.notification_delivery_outbox AS ledger
    WHERE ledger.notification_type = p_notification_type AND ledger.occurrence_key = p_occurrence_key
      AND ledger.user_id = ANY (v_locked_users)
    ORDER BY ledger.user_id FOR UPDATE;

    v_now := pg_catalog.clock_timestamp();
    UPDATE public.notification_delivery_outbox AS ledger
    SET state = 'failed', lease_owner = NULL, claim_token = NULL, lease_until = NULL,
        updated_at = v_now, last_failed_at = v_now, retain_until = v_now + interval '90 days'
    WHERE ledger.notification_type = p_notification_type AND ledger.occurrence_key = p_occurrence_key
      AND ledger.user_id = ANY (v_locked_users) AND ledger.state = 'claimed'
      AND ledger.lease_until <= v_now AND ledger.attempt_count = 5;

    RETURN QUERY
    WITH candidates AS MATERIALIZED (
        SELECT ledger.id FROM public.notification_delivery_outbox AS ledger
        WHERE ledger.notification_type = p_notification_type
          AND ledger.occurrence_key = p_occurrence_key
          AND ledger.user_id = ANY (v_locked_users) AND ledger.attempt_count < 5
          AND (ledger.state = 'pending'
               OR (ledger.state = 'claimed' AND ledger.lease_until <= v_now))
        ORDER BY ledger.user_id LIMIT 20
    ), claimed AS (
        UPDATE public.notification_delivery_outbox AS ledger
        SET state = 'claimed', lease_owner = p_lease_owner,
            claim_token = pg_catalog.gen_random_uuid(), lease_until = v_now + interval '5 minutes',
            attempt_count = ledger.attempt_count + 1, updated_at = v_now,
            last_failed_at = CASE WHEN ledger.state = 'claimed' THEN v_now ELSE ledger.last_failed_at END
        FROM candidates WHERE ledger.id = candidates.id
        RETURNING ledger.user_id, ledger.claim_token
    )
    SELECT claimed.user_id, claimed.claim_token FROM claimed ORDER BY claimed.user_id;
END;
$function$;

CREATE FUNCTION public.complete_notification_delivery_outbox(
    p_notification_type text, p_occurrence_key text, p_user_id uuid,
    p_lease_owner uuid, p_claim_token uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    v_now timestamptz;
    v_row public.notification_delivery_outbox%ROWTYPE;
BEGIN
    IF p_notification_type IS NULL OR p_occurrence_key IS NULL OR p_user_id IS NULL
       OR p_lease_owner IS NULL OR p_claim_token IS NULL THEN
        RAISE EXCEPTION 'Invalid notification outbox completion input';
    END IF;
    PERFORM app_user.id FROM public.users AS app_user
    WHERE app_user.id = p_user_id FOR UPDATE OF app_user;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT ledger.* INTO v_row FROM public.notification_delivery_outbox AS ledger
    WHERE ledger.notification_type = p_notification_type
      AND ledger.occurrence_key = p_occurrence_key AND ledger.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    IF v_row.state = 'completed' THEN
        RETURN v_row.lease_owner IS NOT DISTINCT FROM p_lease_owner
           AND v_row.claim_token IS NOT DISTINCT FROM p_claim_token;
    END IF;
    v_now := pg_catalog.clock_timestamp();
    IF v_row.state <> 'claimed' OR v_row.lease_owner IS DISTINCT FROM p_lease_owner
       OR v_row.claim_token IS DISTINCT FROM p_claim_token OR v_row.lease_until <= v_now THEN
        RETURN false;
    END IF;
    UPDATE public.notification_delivery_outbox
    SET state = 'completed', completed_at = v_now, updated_at = v_now,
        retain_until = v_now + interval '90 days' WHERE id = v_row.id;
    RETURN true;
END;
$function$;

CREATE FUNCTION public.release_notification_delivery_outbox(
    p_notification_type text, p_occurrence_key text, p_user_id uuid,
    p_lease_owner uuid, p_claim_token uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    v_now timestamptz;
    v_row public.notification_delivery_outbox%ROWTYPE;
BEGIN
    IF p_notification_type IS NULL OR p_occurrence_key IS NULL OR p_user_id IS NULL
       OR p_lease_owner IS NULL OR p_claim_token IS NULL THEN
        RAISE EXCEPTION 'Invalid notification outbox release input';
    END IF;
    PERFORM app_user.id FROM public.users AS app_user
    WHERE app_user.id = p_user_id FOR UPDATE OF app_user;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT ledger.* INTO v_row FROM public.notification_delivery_outbox AS ledger
    WHERE ledger.notification_type = p_notification_type
      AND ledger.occurrence_key = p_occurrence_key AND ledger.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    v_now := pg_catalog.clock_timestamp();
    IF v_row.state <> 'claimed' OR v_row.lease_owner IS DISTINCT FROM p_lease_owner
       OR v_row.claim_token IS DISTINCT FROM p_claim_token OR v_row.lease_until <= v_now THEN
        RETURN false;
    END IF;
    UPDATE public.notification_delivery_outbox
    SET state = CASE WHEN v_row.attempt_count = 5 THEN 'failed' ELSE 'pending' END,
        lease_owner = NULL, claim_token = NULL, lease_until = NULL,
        updated_at = v_now, last_failed_at = v_now,
        retain_until = CASE WHEN v_row.attempt_count = 5 THEN v_now + interval '90 days' ELSE v_row.retain_until END
    WHERE id = v_row.id;
    RETURN true;
END;
$function$;

ALTER FUNCTION public.claim_notification_delivery_outbox(text, text, uuid[], uuid) OWNER TO postgres;
ALTER FUNCTION public.complete_notification_delivery_outbox(text, text, uuid, uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.release_notification_delivery_outbox(text, text, uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_notification_delivery_outbox(text, text, uuid[], uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_notification_delivery_outbox(text, text, uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_notification_delivery_outbox(text, text, uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_notification_delivery_outbox(text, text, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_notification_delivery_outbox(text, text, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_notification_delivery_outbox(text, text, uuid, uuid, uuid) TO service_role;

COMMENT ON TABLE public.notification_delivery_outbox IS
    'PII-minimal occurrence ledger for service-role notification delivery claims.';
COMMENT ON FUNCTION public.claim_notification_delivery_outbox(text, text, uuid[], uuid) IS
    'Creates and claims at most 20 notification occurrences under per-user locks.';
COMMENT ON FUNCTION public.complete_notification_delivery_outbox(text, text, uuid, uuid, uuid) IS
    'Idempotently completes an occurrence only for its current claim owner and token.';
COMMENT ON FUNCTION public.release_notification_delivery_outbox(text, text, uuid, uuid, uuid) IS
    'Records a failed attempt and releases only an unexpired current claim.';

DO $postconditions$
DECLARE
    target_table regclass := 'public.notification_delivery_outbox'::regclass;
    users_table regclass := 'public.users'::regclass;
    actual_columns text[];
    functions regprocedure[] := ARRAY[
        'public.claim_notification_delivery_outbox(text,text,uuid[],uuid)'::regprocedure,
        'public.complete_notification_delivery_outbox(text,text,uuid,uuid,uuid)'::regprocedure,
        'public.release_notification_delivery_outbox(text,text,uuid,uuid,uuid)'::regprocedure
    ];
BEGIN
    SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s:%s', attribute.attname,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull::text,
        COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '<none>'))
        ORDER BY attribute.attname) INTO actual_columns
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = target_table AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    IF actual_columns IS DISTINCT FROM ARRAY[
        'attempt_count:integer:true:0', 'claim_token:uuid:false:<none>',
        'completed_at:timestamp with time zone:false:<none>', 'created_at:timestamp with time zone:true:now()',
        'id:uuid:true:gen_random_uuid()', 'last_failed_at:timestamp with time zone:false:<none>',
        'lease_owner:uuid:false:<none>', 'lease_until:timestamp with time zone:false:<none>',
        'notification_type:text:true:<none>', 'occurrence_key:text:true:<none>',
        'retain_until:timestamp with time zone:true:<none>', 'state:text:true:''pending''::text',
        'updated_at:timestamp with time zone:true:now()', 'user_id:uuid:true:<none>'
    ]::text[] THEN RAISE EXCEPTION 'LL083: notification outbox columns or defaults changed'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = target_table AND contype = 'p'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'id')]::smallint[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = target_table
          AND confrelid = users_table AND contype = 'f' AND convalidated AND confdeltype = 'c'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'user_id')]::smallint[]
          AND confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = users_table AND attname = 'id')]::smallint[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint AS constraint_record
        JOIN pg_catalog.pg_index AS backing_index ON backing_index.indexrelid = constraint_record.conindid
        WHERE constraint_record.conrelid = target_table AND constraint_record.contype = 'u'
          AND constraint_record.convalidated AND NOT constraint_record.condeferrable
          AND NOT constraint_record.condeferred AND constraint_record.conkey = ARRAY[
              (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = target_table AND attname = 'notification_type'),
              (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = target_table AND attname = 'occurrence_key'),
              (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = target_table AND attname = 'user_id')
          ]::smallint[] AND backing_index.indisunique AND backing_index.indisvalid
          AND backing_index.indisready AND backing_index.indimmediate
          AND backing_index.indnkeyatts = 3 AND backing_index.indnatts = 3
          AND backing_index.indpred IS NULL AND backing_index.indexprs IS NULL
    ) THEN RAISE EXCEPTION 'LL083: notification outbox keys changed'; END IF;

    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table AND contype = 'c' AND convalidated) <> 4
       OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_class AS index_relation
            JOIN pg_catalog.pg_index AS index_record ON index_record.indexrelid = index_relation.oid
            WHERE index_relation.oid = 'public.notification_delivery_outbox_retention_idx'::regclass
              AND index_record.indrelid = target_table AND index_record.indisvalid
              AND index_record.indisready AND NOT index_record.indisunique
              AND index_record.indnkeyatts = 2 AND index_record.indnatts = 2 AND index_record.indexprs IS NULL
              AND pg_catalog.pg_get_indexdef(index_relation.oid, 1, true) = 'retain_until' AND pg_catalog.pg_get_indexdef(index_relation.oid, 2, true) = 'id' AND pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid) = '(state = ANY (ARRAY[''completed''::text, ''failed''::text]))'
       ) OR pg_catalog.pg_get_function_result(functions[1]) IS DISTINCT FROM 'TABLE(user_id uuid, claim_token uuid)' OR pg_catalog.pg_get_function_result(functions[2]) IS DISTINCT FROM 'boolean' OR pg_catalog.pg_get_function_result(functions[3]) IS DISTINCT FROM 'boolean' OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_depend AS dependency
            JOIN pg_catalog.pg_class AS sequence_relation ON sequence_relation.oid = dependency.objid
            WHERE dependency.refobjid = target_table AND sequence_relation.relkind = 'S'
              AND dependency.deptype IN ('a', 'i')
       ) THEN RAISE EXCEPTION 'LL083: notification outbox checks or indexes changed'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
        WHERE relation.oid = target_table AND owner.rolname = 'postgres' AND owner.rolbypassrls
          AND relation.relrowsecurity AND NOT relation.relforcerowsecurity
    ) OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table)
       OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_class AS relation
            CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
                relation.relacl, pg_catalog.acldefault('r', relation.relowner))) AS privilege
            WHERE relation.oid = target_table AND privilege.grantee <> relation.relowner
       ) OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_attribute AS attribute
            CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
            WHERE attribute.attrelid = target_table AND attribute.attnum > 0
              AND NOT attribute.attisdropped
       ) OR EXISTS (
            SELECT 1 FROM pg_catalog.unnest(ARRAY['anon', 'authenticated', 'service_role'])
                AS role(role_name)
            WHERE pg_catalog.has_table_privilege(role.role_name, target_table,
                'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
               OR pg_catalog.has_any_column_privilege(
                role.role_name, target_table, 'SELECT, INSERT, UPDATE, REFERENCES')
       ) THEN RAISE EXCEPTION 'LL083: notification outbox owner, RLS, or ACL changed'; END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.unnest(functions) AS expected(function_oid)
        JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = expected.function_oid
        WHERE NOT procedure.prosecdef OR procedure.prokind <> 'f'
           OR pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
           OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
           OR NOT pg_catalog.has_function_privilege('service_role', expected.function_oid, 'EXECUTE')
           OR pg_catalog.has_function_privilege('anon', expected.function_oid, 'EXECUTE')
           OR pg_catalog.has_function_privilege('authenticated', expected.function_oid, 'EXECUTE')
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.unnest(functions) AS expected(function_oid)
        JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = expected.function_oid
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) AS privilege
        WHERE privilege.grantee NOT IN (
            procedure.proowner, (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
        )
    ) OR (
        SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public' AND procedure.proname = ANY (ARRAY[
            'claim_notification_delivery_outbox', 'complete_notification_delivery_outbox',
            'release_notification_delivery_outbox'
        ])
    ) <> 3 THEN RAISE EXCEPTION 'LL083: notification outbox RPC security changed'; END IF;
END;
$postconditions$;

-- Layer 1 only: do not wire Cron or apply this migration before Layer 2 runtime verification.
-- Rollback after stopping Layer 3 callers and waiting for active leases:
-- drop release RPC, complete RPC, claim RPC, retention index, then the outbox table.

COMMIT;
