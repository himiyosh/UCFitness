BEGIN; SET LOCAL search_path = '';
DO $preconditions$ DECLARE
    subscriptions_table regclass := pg_catalog.to_regclass('public.push_subscriptions');
    users_table regclass := pg_catalog.to_regclass('public.users');
    cas_function regprocedure := pg_catalog.to_regprocedure(
        'public.delete_push_subscription_if_unchanged(uuid,uuid,text,text,text,text,timestamp with time zone)');
    actual_columns text[]; actual_defaults text[];
BEGIN
    IF subscriptions_table IS NULL OR users_table IS NULL OR cas_function IS NULL
       OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
       OR pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NULL
       OR pg_catalog.to_regprocedure('pg_catalog.hashtextextended(text,bigint)') IS NULL
       OR pg_catalog.to_regprocedure('pg_catalog.pg_advisory_xact_lock(bigint)') IS NULL THEN
        RAISE EXCEPTION 'LL085: push ownership prerequisites are unavailable'; END IF;
    IF pg_catalog.to_regclass('public.push_subscription_ownership') IS NOT NULL OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public' AND procedure.proname = ANY (ARRAY[
            'save_push_subscription_with_generation', 'release_push_subscription_with_generation'])
    ) THEN RAISE EXCEPTION 'LL085: push ownership objects already exist'; END IF;
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_roles
        WHERE rolname = ANY (ARRAY['postgres', 'service_role', 'anon', 'authenticated'])) <> 4
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres' AND rolbypassrls)
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND rolbypassrls)
    THEN RAISE EXCEPTION 'LL085: push ownership roles are unsafe'; END IF;
    LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.push_subscriptions IN ACCESS EXCLUSIVE MODE;
    SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s:%s', attribute.attname,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull::text,
        (attribute.attgenerated = '')::text) ORDER BY attribute.attname),
        pg_catalog.array_agg(pg_catalog.format('%s:%s', attribute.attname,
        COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '<none>'))
        ORDER BY attribute.attname) INTO actual_columns, actual_defaults
    FROM pg_catalog.pg_attribute AS attribute LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = subscriptions_table AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    IF actual_columns IS DISTINCT FROM ARRAY[
        'auth:text:true:true', 'created_at:timestamp with time zone:false:true', 'endpoint:text:true:true',
        'id:uuid:true:true', 'p256dh:text:true:true', 'user_agent:text:false:true', 'user_id:uuid:true:true'
    ]::text[] OR actual_defaults IS DISTINCT FROM ARRAY['auth:<none>', 'created_at:now()',
        'endpoint:<none>', 'id:gen_random_uuid()', 'p256dh:<none>', 'user_agent:<none>',
        'user_id:<none>']::text[] THEN
        RAISE EXCEPTION 'LL085: push subscription schema changed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = subscriptions_table AND contype = 'p'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = subscriptions_table AND attname = 'id')]::smallint[])
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = subscriptions_table AND confrelid = users_table
          AND contype = 'f' AND convalidated AND confdeltype = 'c'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = subscriptions_table AND attname = 'user_id')]::smallint[]
          AND confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = users_table AND attname = 'id')]::smallint[])
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS constraint_record
        JOIN pg_catalog.pg_index AS backing_index ON backing_index.indexrelid = constraint_record.conindid
        WHERE constraint_record.conrelid = subscriptions_table AND constraint_record.contype = 'u'
          AND constraint_record.convalidated AND NOT constraint_record.condeferrable
          AND NOT constraint_record.condeferred AND constraint_record.conkey = ARRAY[
            (SELECT attnum FROM pg_catalog.pg_attribute
             WHERE attrelid = subscriptions_table AND attname = 'user_id'),
            (SELECT attnum FROM pg_catalog.pg_attribute
             WHERE attrelid = subscriptions_table AND attname = 'endpoint')]::smallint[]
          AND backing_index.indisunique AND backing_index.indisvalid AND backing_index.indisready
          AND backing_index.indimmediate AND backing_index.indnkeyatts = 2
          AND backing_index.indnatts = 2 AND backing_index.indpred IS NULL
          AND backing_index.indexprs IS NULL)
    THEN RAISE EXCEPTION 'LL085: push subscription keys changed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
        WHERE relation.oid = subscriptions_table AND owner.rolname = 'postgres'
          AND owner.rolbypassrls AND relation.relrowsecurity AND NOT relation.relforcerowsecurity)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = subscriptions_table)
       OR NOT (SELECT procedure.prosecdef
                   AND pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
                   AND procedure.proconfig = ARRAY['search_path=""']::text[]
               FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid = cas_function)
       OR NOT pg_catalog.has_function_privilege('service_role', cas_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', cas_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', cas_function, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) AS privilege
        WHERE procedure.oid = cas_function AND privilege.grantee NOT IN (
            procedure.proowner,
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')))
    THEN RAISE EXCEPTION 'LL085: push subscription security contract changed'; END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY['anon', 'authenticated']) AS role(role_name)
        WHERE pg_catalog.has_table_privilege(role.role_name, subscriptions_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           OR pg_catalog.has_any_column_privilege(role.role_name, subscriptions_table,
            'SELECT, INSERT, UPDATE, REFERENCES'))
       OR pg_catalog.has_table_privilege('service_role', subscriptions_table, 'SELECT')
       OR pg_catalog.has_table_privilege('service_role', subscriptions_table, 'INSERT')
       OR pg_catalog.has_table_privilege('service_role', subscriptions_table, 'UPDATE')
       OR NOT pg_catalog.has_table_privilege('service_role', subscriptions_table, 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', subscriptions_table,
            'TRUNCATE, REFERENCES, TRIGGER')
       OR pg_catalog.has_any_column_privilege(
            'service_role', subscriptions_table, 'REFERENCES')
       OR pg_catalog.has_column_privilege('service_role', subscriptions_table, 'id', 'INSERT')
       OR pg_catalog.has_column_privilege('service_role', subscriptions_table, 'id', 'UPDATE')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            relation.relacl, pg_catalog.acldefault('r', relation.relowner))) AS privilege
        WHERE relation.oid = subscriptions_table AND privilege.grantee NOT IN (
            relation.relowner, (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        WHERE attribute.attrelid = subscriptions_table AND attribute.attnum > 0
          AND NOT attribute.attisdropped AND privilege.grantee NOT IN (
            relation.relowner, (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')))
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY[
            'id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'
        ]) AS expected(column_name) WHERE NOT pg_catalog.has_column_privilege(
            'service_role', subscriptions_table, expected.column_name, 'SELECT'))
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY[
            'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'
        ]) AS expected(column_name) WHERE NOT pg_catalog.has_column_privilege(
            'service_role', subscriptions_table, expected.column_name, 'INSERT')
           OR NOT pg_catalog.has_column_privilege(
            'service_role', subscriptions_table, expected.column_name, 'UPDATE'))
    THEN RAISE EXCEPTION 'LL085: push subscription ACL changed'; END IF;
    IF EXISTS (SELECT 1 FROM public.push_subscriptions
        WHERE endpoint = '' OR pg_catalog.length(endpoint) > 2048)
       OR EXISTS (SELECT 1 FROM public.push_subscriptions
        GROUP BY pg_catalog.sha256(pg_catalog.convert_to(endpoint, 'UTF8'))
        HAVING pg_catalog.count(DISTINCT endpoint) > 1)
    THEN RAISE EXCEPTION 'LL085: push endpoint digest input is unsafe'; END IF;
END; $preconditions$;
CREATE TABLE public.push_subscription_ownership (
    endpoint_digest bytea NOT NULL,
    owner_user_id uuid,
    recipient_generation uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    ownership_version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT push_subscription_ownership_pkey PRIMARY KEY (endpoint_digest),
    CONSTRAINT push_subscription_ownership_owner_fkey FOREIGN KEY (owner_user_id)
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT push_subscription_ownership_digest_check
        CHECK (pg_catalog.octet_length(endpoint_digest) = 32),
    CONSTRAINT push_subscription_ownership_version_check CHECK (ownership_version > 0),
    CONSTRAINT push_subscription_ownership_timeline_check CHECK (updated_at >= created_at)
);
ALTER TABLE public.push_subscription_ownership OWNER TO postgres;
CREATE INDEX push_subscription_ownership_owner_idx
    ON public.push_subscription_ownership(owner_user_id, endpoint_digest)
    WHERE owner_user_id IS NOT NULL;
ALTER TABLE public.push_subscription_ownership ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.push_subscription_ownership
    FROM PUBLIC, anon, authenticated, service_role;
DO $backfill$ DECLARE quarantined_count bigint;
BEGIN
    INSERT INTO public.push_subscription_ownership (endpoint_digest, owner_user_id)
    SELECT pg_catalog.sha256(pg_catalog.convert_to(subscription.endpoint, 'UTF8')),
        CASE WHEN pg_catalog.count(DISTINCT subscription.user_id) = 1
             THEN pg_catalog.min(subscription.user_id::text)::uuid END
    FROM public.push_subscriptions AS subscription
    GROUP BY pg_catalog.sha256(pg_catalog.convert_to(subscription.endpoint, 'UTF8'));
    SELECT pg_catalog.count(*) INTO quarantined_count
    FROM public.push_subscription_ownership WHERE owner_user_id IS NULL;
    RAISE NOTICE 'LL085: quarantined % ambiguous push endpoint digests', quarantined_count;
END; $backfill$;
CREATE FUNCTION public.save_push_subscription_with_generation(
    p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) RETURNS TABLE (
    subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text,
    stored_auth text, stored_user_agent text, stored_created_at timestamptz,
    recipient_generation uuid, ownership_version bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    v_authority public.push_subscription_ownership%ROWTYPE;
    v_subscription public.push_subscriptions%ROWTYPE;
    v_digest bytea; v_candidate_owner uuid; v_authority_exists boolean; v_existing boolean;
    v_locked_users uuid[]; v_raw_count bigint; v_generation uuid; v_version bigint;
    v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
    IF p_user_id IS NULL OR p_endpoint IS NULL OR pg_catalog.length(p_endpoint) NOT BETWEEN 1 AND 2048
       OR p_p256dh IS NULL OR pg_catalog.length(p_p256dh) NOT BETWEEN 1 AND 256
       OR p_auth IS NULL OR pg_catalog.length(p_auth) NOT BETWEEN 1 AND 128
       OR pg_catalog.length(p_user_agent) > 2048
    THEN RAISE EXCEPTION 'Invalid push subscription input'; END IF;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(p_endpoint, 'UTF8'));
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(pg_catalog.encode(v_digest, 'hex'), 0));
    SELECT ownership.owner_user_id INTO v_candidate_owner
    FROM public.push_subscription_ownership AS ownership
    WHERE ownership.endpoint_digest = v_digest;
    SELECT pg_catalog.array_agg(locked_user.id ORDER BY locked_user.id) INTO v_locked_users
    FROM (SELECT app_user.id FROM public.users AS app_user
        WHERE app_user.id = p_user_id OR app_user.id = v_candidate_owner
           OR EXISTS (SELECT 1 FROM public.push_subscriptions AS subscription
               WHERE subscription.endpoint = p_endpoint AND subscription.user_id = app_user.id)
        ORDER BY app_user.id FOR UPDATE OF app_user) AS locked_user;
    IF v_locked_users IS NULL OR p_user_id <> ALL (v_locked_users)
    THEN RAISE EXCEPTION 'Push subscription user is unavailable'; END IF;
    SELECT ownership.* INTO v_authority FROM public.push_subscription_ownership AS ownership
    WHERE ownership.endpoint_digest = v_digest FOR UPDATE;
    v_authority_exists := FOUND;
    IF v_authority_exists AND v_authority.owner_user_id IS NOT NULL
       AND v_authority.owner_user_id <> ALL (v_locked_users)
    THEN RAISE EXCEPTION 'Push subscription ownership changed'; END IF;
    PERFORM 1 FROM public.push_subscriptions AS subscription
    WHERE subscription.user_id = p_user_id AND subscription.endpoint = p_endpoint FOR UPDATE;
    v_existing := FOUND;
    IF NOT v_existing THEN
        SELECT pg_catalog.count(*) INTO v_raw_count FROM public.push_subscriptions AS subscription
        WHERE subscription.user_id = p_user_id;
        IF v_raw_count >= 20 THEN RAISE EXCEPTION 'Push subscription limit reached'; END IF;
    END IF;
    DELETE FROM public.push_subscriptions AS subscription
    WHERE subscription.endpoint = p_endpoint AND subscription.user_id <> p_user_id;
    INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
    VALUES (p_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent, v_now)
    ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, created_at = EXCLUDED.created_at
    RETURNING * INTO v_subscription;
    IF NOT v_authority_exists THEN
        INSERT INTO public.push_subscription_ownership AS ownership (
            endpoint_digest, owner_user_id, created_at, updated_at)
        VALUES (v_digest, p_user_id, v_now, v_now)
        RETURNING ownership.recipient_generation, ownership.ownership_version
        INTO v_generation, v_version;
    ELSIF v_authority.owner_user_id IS DISTINCT FROM p_user_id THEN
        UPDATE public.push_subscription_ownership AS ownership SET owner_user_id = p_user_id,
            recipient_generation = pg_catalog.gen_random_uuid(),
            ownership_version = ownership.ownership_version + 1, updated_at = v_now
        WHERE ownership.endpoint_digest = v_digest
        RETURNING ownership.recipient_generation, ownership.ownership_version
        INTO v_generation, v_version;
    ELSE
        UPDATE public.push_subscription_ownership AS ownership
        SET ownership_version = ownership.ownership_version + 1, updated_at = v_now
        WHERE ownership.endpoint_digest = v_digest
        RETURNING ownership.recipient_generation, ownership.ownership_version
        INTO v_generation, v_version;
    END IF;
    RETURN QUERY SELECT v_subscription.id, v_subscription.user_id, v_subscription.endpoint,
        v_subscription.p256dh, v_subscription.auth, v_subscription.user_agent,
        v_subscription.created_at, v_generation, v_version;
END; $function$;
CREATE FUNCTION public.release_push_subscription_with_generation(
    p_user_id uuid, p_endpoint text, p_recipient_generation uuid, p_ownership_version bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_authority public.push_subscription_ownership%ROWTYPE; v_digest bytea;
BEGIN
    IF p_user_id IS NULL OR p_endpoint IS NULL OR pg_catalog.length(p_endpoint) NOT BETWEEN 1 AND 2048
       OR p_recipient_generation IS NULL OR p_ownership_version IS NULL
    THEN RAISE EXCEPTION 'Invalid push subscription release input'; END IF;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(p_endpoint, 'UTF8'));
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(pg_catalog.encode(v_digest, 'hex'), 0));
    PERFORM app_user.id FROM public.users AS app_user
    WHERE app_user.id = p_user_id FOR UPDATE OF app_user;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT ownership.* INTO v_authority FROM public.push_subscription_ownership AS ownership
    WHERE ownership.endpoint_digest = v_digest FOR UPDATE;
    IF NOT FOUND OR v_authority.owner_user_id IS DISTINCT FROM p_user_id
       OR v_authority.recipient_generation IS DISTINCT FROM p_recipient_generation
       OR v_authority.ownership_version IS DISTINCT FROM p_ownership_version
    THEN RETURN false; END IF;
    DELETE FROM public.push_subscriptions AS subscription
    WHERE subscription.user_id = p_user_id AND subscription.endpoint = p_endpoint;
    UPDATE public.push_subscription_ownership AS ownership
    SET owner_user_id = NULL, recipient_generation = pg_catalog.gen_random_uuid(),
        ownership_version = ownership.ownership_version + 1,
        updated_at = pg_catalog.clock_timestamp()
    WHERE ownership.endpoint_digest = v_digest;
    RETURN true;
END; $function$;
ALTER FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.release_push_subscription_with_generation(uuid, text, uuid, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_push_subscription_with_generation(uuid, text, uuid, bigint)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.release_push_subscription_with_generation(uuid, text, uuid, bigint)
    TO service_role;
COMMENT ON TABLE public.push_subscription_ownership IS
    'Endpoint-digest authority for current Push recipient ownership and generation.';
DO $postconditions$ DECLARE
    target_table regclass := 'public.push_subscription_ownership'::regclass;
    users_table regclass := 'public.users'::regclass; actual_columns text[];
    functions regprocedure[] := ARRAY[
        'public.save_push_subscription_with_generation(uuid,text,text,text,text)'::regprocedure,
        'public.release_push_subscription_with_generation(uuid,text,uuid,bigint)'::regprocedure];
BEGIN
    SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s:%s', attribute.attname,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull::text,
        COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '<none>'))
        ORDER BY attribute.attname) INTO actual_columns
    FROM pg_catalog.pg_attribute AS attribute LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = target_table AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    IF actual_columns IS DISTINCT FROM ARRAY['created_at:timestamp with time zone:true:now()',
        'endpoint_digest:bytea:true:<none>', 'owner_user_id:uuid:false:<none>',
        'ownership_version:bigint:true:1', 'recipient_generation:uuid:true:gen_random_uuid()',
        'updated_at:timestamp with time zone:true:now()']::text[]
    THEN RAISE EXCEPTION 'LL085: push ownership columns changed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = target_table
        AND contype = 'p' AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = target_table AND attname = 'endpoint_digest')]::smallint[])
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = target_table
        AND confrelid = users_table AND contype = 'f' AND convalidated AND confdeltype = 'c'
        AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = target_table AND attname = 'owner_user_id')]::smallint[]
        AND confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = users_table AND attname = 'id')]::smallint[])
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
           WHERE conrelid = target_table AND contype = 'c' AND convalidated) <> 3
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index AS index_record
        WHERE index_record.indexrelid = 'public.push_subscription_ownership_owner_idx'::regclass
          AND index_record.indrelid = target_table AND index_record.indisvalid
          AND index_record.indisready AND NOT index_record.indisunique
          AND index_record.indnkeyatts = 2 AND index_record.indnatts = 2
          AND index_record.indexprs IS NULL
          AND pg_catalog.pg_get_indexdef(index_record.indexrelid, 1, true) = 'owner_user_id'
          AND pg_catalog.pg_get_indexdef(index_record.indexrelid, 2, true) = 'endpoint_digest'
          AND pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid)
              = '(owner_user_id IS NOT NULL)')
    THEN RAISE EXCEPTION 'LL085: push ownership keys changed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
        WHERE relation.oid = target_table AND owner.rolname = 'postgres' AND owner.rolbypassrls
          AND relation.relrowsecurity AND NOT relation.relforcerowsecurity)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            relation.relacl, pg_catalog.acldefault('r', relation.relowner))) AS privilege
        WHERE relation.oid = target_table AND privilege.grantee <> relation.relowner)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        WHERE attribute.attrelid = target_table AND attribute.attnum > 0 AND NOT attribute.attisdropped)
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(
        ARRAY['anon', 'authenticated', 'service_role']) AS role(role_name)
        WHERE pg_catalog.has_table_privilege(role.role_name, target_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           OR pg_catalog.has_any_column_privilege(
            role.role_name, target_table, 'SELECT, INSERT, UPDATE, REFERENCES'))
    THEN RAISE EXCEPTION 'LL085: push ownership table security changed'; END IF;
    IF pg_catalog.pg_get_function_result(functions[1]) IS DISTINCT FROM
       'TABLE(subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text, stored_auth text, stored_user_agent text, stored_created_at timestamp with time zone, recipient_generation uuid, ownership_version bigint)'
       OR pg_catalog.pg_get_function_result(functions[2]) IS DISTINCT FROM 'boolean'
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(functions) AS expected(function_oid)
        JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = expected.function_oid
        WHERE NOT procedure.prosecdef OR procedure.prokind <> 'f'
           OR pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
           OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
           OR NOT pg_catalog.has_function_privilege('service_role', expected.function_oid, 'EXECUTE')
           OR pg_catalog.has_function_privilege('anon', expected.function_oid, 'EXECUTE')
           OR pg_catalog.has_function_privilege('authenticated', expected.function_oid, 'EXECUTE'))
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(functions) AS expected(function_oid)
        JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = expected.function_oid
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) AS privilege
        WHERE privilege.grantee NOT IN (procedure.proowner,
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')))
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public' AND procedure.proname = ANY (ARRAY[
            'save_push_subscription_with_generation',
            'release_push_subscription_with_generation'])) <> 2
    THEN RAISE EXCEPTION 'LL085: push ownership RPC security changed'; END IF;
END; $postconditions$;
-- Layer 1 only: runtime PostgreSQL verification and generation-bound app/SW wiring remain mandatory.
-- Rollback after stopping Layer 3 callers: release RPC, save RPC, owner index, then authority table.
COMMIT;
