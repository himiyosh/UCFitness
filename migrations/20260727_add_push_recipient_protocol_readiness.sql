BEGIN;
SET LOCAL search_path = '';

DO $preconditions$
DECLARE
    target_table regclass := pg_catalog.to_regclass('public.push_subscription_ownership');
    users_table regclass := pg_catalog.to_regclass('public.users');
    subscriptions_table regclass := pg_catalog.to_regclass('public.push_subscriptions');
    functions regprocedure[] := ARRAY[
        pg_catalog.to_regprocedure('public.save_push_subscription_with_generation(uuid,text,text,text,text,text)'),
        pg_catalog.to_regprocedure('public.release_push_subscription_with_generation(uuid,text,text,uuid,bigint)'),
        pg_catalog.to_regprocedure('public.read_push_subscription_generations(uuid,uuid[],text[])')];
    actual_columns text[];
    actual_checks text[];
BEGIN
    IF target_table IS NULL OR users_table IS NULL OR subscriptions_table IS NULL
       OR pg_catalog.array_position(functions, NULL::regprocedure) IS NOT NULL
       OR pg_catalog.to_regprocedure('public.save_push_subscription_with_generation(uuid,text,text,text,text,text,smallint)') IS NOT NULL
       OR pg_catalog.to_regprocedure('public.reset_push_recipient_protocol_version()') IS NOT NULL
    THEN RAISE EXCEPTION 'LL090: recipient protocol prerequisites are unavailable'; END IF;

    LOCK TABLE public.push_subscriptions IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.push_subscription_ownership IN ACCESS EXCLUSIVE MODE;

    SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s:%s:%s', attribute.attname,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull::text,
        (attribute.attgenerated = '')::text,
        COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '<none>'))
        ORDER BY attribute.attname) INTO actual_columns
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = target_table AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s', constraint_record.conname,
        constraint_record.convalidated::text,
        pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(constraint_record.oid, false),
            '[[:space:]()]', '', 'g')) ORDER BY constraint_record.conname) INTO actual_checks
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = target_table AND constraint_record.contype = 'c';
    IF actual_columns IS DISTINCT FROM ARRAY[
        'created_at:timestamp with time zone:true:true:now()', 'endpoint_digest:bytea:true:true:<none>',
        'owner_user_id:uuid:false:true:<none>', 'ownership_version:bigint:true:true:1',
        'recipient_generation:uuid:true:true:gen_random_uuid()', 'subscription_id:uuid:false:true:<none>',
        'updated_at:timestamp with time zone:true:true:now()']::text[]
       OR actual_checks IS DISTINCT FROM ARRAY[
        'push_subscription_ownership_digest_check:true:CHECKoctet_lengthendpoint_digest=32',
        'push_subscription_ownership_state_check:true:CHECKowner_user_idISNULL=subscription_idISNULL',
        'push_subscription_ownership_timeline_check:true:CHECKupdated_at>=created_at',
        'push_subscription_ownership_version_check:true:CHECKownership_version>0']::text[]
    THEN RAISE EXCEPTION 'LL090: recipient protocol catalog changed'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table AND contype = 'p'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = target_table AND attname = 'endpoint_digest')]::smallint[])
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table AND confrelid = users_table AND contype = 'f'
          AND convalidated AND confdeltype = 'c'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = target_table AND attname = 'owner_user_id')]::smallint[]
          AND confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = users_table AND attname = 'id')]::smallint[])
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS constraint_record
        JOIN pg_catalog.pg_index AS backing_index ON backing_index.indexrelid = constraint_record.conindid
        WHERE constraint_record.conrelid = target_table AND constraint_record.contype = 'u'
          AND constraint_record.convalidated AND NOT constraint_record.condeferrable
          AND NOT constraint_record.condeferred
          AND constraint_record.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = target_table AND attname = 'subscription_id')]::smallint[]
          AND backing_index.indisunique AND backing_index.indisvalid AND backing_index.indisready
          AND backing_index.indimmediate AND backing_index.indnkeyatts = 1
          AND backing_index.indnatts = 1 AND backing_index.indpred IS NULL
          AND backing_index.indexprs IS NULL)
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index AS index_record
        WHERE index_record.indexrelid = 'public.push_subscription_ownership_owner_idx'::regclass
          AND index_record.indrelid = target_table AND index_record.indisvalid
          AND index_record.indisready AND NOT index_record.indisunique
          AND index_record.indnkeyatts = 2 AND index_record.indnatts = 2
          AND pg_catalog.pg_get_indexdef(index_record.indexrelid, 1, true) = 'owner_user_id'
          AND pg_catalog.pg_get_indexdef(index_record.indexrelid, 2, true) = 'endpoint_digest'
          AND pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid) = '(owner_user_id IS NOT NULL)')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid = target_table AND NOT tgisinternal)
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
           WHERE conrelid = target_table) <> 7
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index
           WHERE indrelid = target_table) <> 3
    THEN RAISE EXCEPTION 'LL090: recipient protocol keys or triggers changed'; END IF;

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
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role(role_name)
        WHERE pg_catalog.has_table_privilege(role.role_name, target_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           OR pg_catalog.has_any_column_privilege(role.role_name, target_table,
            'SELECT, INSERT, UPDATE, REFERENCES'))
    THEN RAISE EXCEPTION 'LL090: recipient protocol table security changed'; END IF;

    IF pg_catalog.pg_get_function_result(functions[1]) IS DISTINCT FROM
        'TABLE(subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text, stored_auth text, stored_user_agent text, stored_created_at timestamp with time zone, recipient_generation uuid, ownership_version bigint)'
       OR pg_catalog.pg_get_function_result(functions[2]) IS DISTINCT FROM 'boolean'
       OR pg_catalog.pg_get_function_result(functions[3]) IS DISTINCT FROM
        'TABLE(subscription_id uuid, recipient_generation uuid, ownership_version bigint)'
       OR (SELECT procedure.provolatile FROM pg_catalog.pg_proc AS procedure
           WHERE procedure.oid = functions[3]) <> 's'
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
            'release_push_subscription_with_generation',
            'read_push_subscription_generations'])) <> 3
    THEN RAISE EXCEPTION 'LL090: recipient protocol RPC security changed'; END IF;
END; $preconditions$;

ALTER TABLE public.push_subscription_ownership
    ADD COLUMN recipient_protocol_version smallint NOT NULL DEFAULT 0,
    ADD CONSTRAINT push_subscription_ownership_protocol_check
        CHECK (recipient_protocol_version >= 0 AND recipient_protocol_version <= 1);

CREATE FUNCTION public.reset_push_recipient_protocol_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
    NEW.recipient_protocol_version := 0;
    RETURN NEW;
END; $function$;

CREATE TRIGGER push_subscription_ownership_protocol_reset
BEFORE INSERT OR UPDATE OF owner_user_id, subscription_id, recipient_generation, ownership_version
ON public.push_subscription_ownership
FOR EACH ROW EXECUTE FUNCTION public.reset_push_recipient_protocol_version();

CREATE FUNCTION public.save_push_subscription_with_generation(
    p_user_id uuid, p_endpoint text, p_ownership_key text, p_p256dh text, p_auth text,
    p_user_agent text, p_protocol_version smallint
) RETURNS TABLE (
    subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text,
    stored_auth text, stored_user_agent text, stored_created_at timestamptz,
    recipient_generation uuid, ownership_version bigint, recipient_protocol_version smallint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    v_saved record;
    v_protocol smallint;
    v_digest bytea;
BEGIN
    IF p_protocol_version IS NULL
       OR p_protocol_version <> ALL (ARRAY[1]::smallint[])
    THEN RAISE EXCEPTION 'Unsupported push recipient protocol version'; END IF;

    SELECT saved.* INTO STRICT v_saved
    FROM public.save_push_subscription_with_generation(
        p_user_id, p_endpoint, p_ownership_key, p_p256dh, p_auth, p_user_agent
    ) AS saved;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(p_ownership_key, 'UTF8'));
    UPDATE public.push_subscription_ownership AS ownership
    SET recipient_protocol_version = p_protocol_version
    WHERE ownership.endpoint_digest = v_digest
      AND ownership.owner_user_id = p_user_id
      AND ownership.subscription_id = v_saved.subscription_id
      AND ownership.recipient_generation = v_saved.recipient_generation
      AND ownership.ownership_version = v_saved.ownership_version
    RETURNING ownership.recipient_protocol_version INTO v_protocol;
    IF NOT FOUND THEN RAISE EXCEPTION 'Push recipient protocol authority changed'; END IF;

    RETURN QUERY SELECT v_saved.subscription_id, v_saved.stored_user_id,
        v_saved.stored_endpoint, v_saved.stored_p256dh, v_saved.stored_auth,
        v_saved.stored_user_agent, v_saved.stored_created_at,
        v_saved.recipient_generation, v_saved.ownership_version, v_protocol;
END; $function$;

DROP FUNCTION public.read_push_subscription_generations(uuid, uuid[], text[]);
CREATE FUNCTION public.read_push_subscription_generations(
    p_user_id uuid, p_subscription_ids uuid[], p_ownership_keys text[]
) RETURNS TABLE (
    subscription_id uuid, recipient_generation uuid, ownership_version bigint,
    recipient_protocol_version smallint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
    IF p_user_id IS NULL OR p_subscription_ids IS NULL OR p_ownership_keys IS NULL
       OR pg_catalog.cardinality(p_subscription_ids) NOT BETWEEN 1 AND 20
       OR pg_catalog.cardinality(p_subscription_ids) IS DISTINCT FROM pg_catalog.cardinality(p_ownership_keys)
       OR pg_catalog.array_position(p_subscription_ids, NULL::uuid) IS NOT NULL
       OR pg_catalog.array_position(p_ownership_keys, NULL::text) IS NOT NULL
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_ownership_keys) AS key(value)
        WHERE pg_catalog.length(key.value) NOT BETWEEN 9 AND 2048
           OR key.value !~ '^https://[^/?#]+' OR pg_catalog.strpos(key.value, '#') <> 0)
    THEN RAISE EXCEPTION 'Invalid push subscription generation read input'; END IF;

    RETURN QUERY SELECT DISTINCT ownership.subscription_id,
        ownership.recipient_generation, ownership.ownership_version,
        ownership.recipient_protocol_version
    FROM ROWS FROM (
        pg_catalog.unnest(p_subscription_ids), pg_catalog.unnest(p_ownership_keys)
    ) AS requested(subscription_id, ownership_key)
    JOIN public.push_subscription_ownership AS ownership
      ON ownership.endpoint_digest = pg_catalog.sha256(
        pg_catalog.convert_to(requested.ownership_key, 'UTF8'))
     AND ownership.owner_user_id = p_user_id
     AND ownership.subscription_id = requested.subscription_id
    JOIN public.push_subscriptions AS subscription
      ON subscription.id = requested.subscription_id AND subscription.user_id = p_user_id
    ORDER BY ownership.subscription_id;
END; $function$;

ALTER FUNCTION public.reset_push_recipient_protocol_version() OWNER TO postgres;
ALTER FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text, text, smallint) OWNER TO postgres;
ALTER FUNCTION public.read_push_subscription_generations(uuid, uuid[], text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reset_push_recipient_protocol_version() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text, text, smallint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_push_subscription_generations(uuid, uuid[], text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text, text, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_push_subscription_generations(uuid, uuid[], text[]) TO service_role;

DO $postconditions$
DECLARE
    target_table regclass := 'public.push_subscription_ownership'::regclass;
    users_table regclass := 'public.users'::regclass;
    functions regprocedure[] := ARRAY[
        'public.save_push_subscription_with_generation(uuid,text,text,text,text,text)'::regprocedure,
        'public.save_push_subscription_with_generation(uuid,text,text,text,text,text,smallint)'::regprocedure,
        'public.release_push_subscription_with_generation(uuid,text,text,uuid,bigint)'::regprocedure,
        'public.read_push_subscription_generations(uuid,uuid[],text[])'::regprocedure];
    trigger_function regprocedure := 'public.reset_push_recipient_protocol_version()'::regprocedure;
    actual_columns text[];
    actual_checks text[];
BEGIN
    SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s:%s:%s', attribute.attname,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull::text,
        (attribute.attgenerated = '')::text,
        COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '<none>'))
        ORDER BY attribute.attname) INTO actual_columns
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = target_table AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s', constraint_record.conname,
        constraint_record.convalidated::text,
        pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(constraint_record.oid, false),
            '[[:space:]()]', '', 'g')) ORDER BY constraint_record.conname) INTO actual_checks
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = target_table AND constraint_record.contype = 'c';
    IF actual_columns IS DISTINCT FROM ARRAY[
        'created_at:timestamp with time zone:true:true:now()', 'endpoint_digest:bytea:true:true:<none>',
        'owner_user_id:uuid:false:true:<none>', 'ownership_version:bigint:true:true:1',
        'recipient_generation:uuid:true:true:gen_random_uuid()',
        'recipient_protocol_version:smallint:true:true:0', 'subscription_id:uuid:false:true:<none>',
        'updated_at:timestamp with time zone:true:true:now()']::text[]
       OR actual_checks IS DISTINCT FROM ARRAY[
        'push_subscription_ownership_digest_check:true:CHECKoctet_lengthendpoint_digest=32',
        'push_subscription_ownership_protocol_check:true:CHECKrecipient_protocol_version>=0ANDrecipient_protocol_version<=1',
        'push_subscription_ownership_state_check:true:CHECKowner_user_idISNULL=subscription_idISNULL',
        'push_subscription_ownership_timeline_check:true:CHECKupdated_at>=created_at',
        'push_subscription_ownership_version_check:true:CHECKownership_version>0']::text[]
    THEN RAISE EXCEPTION 'LL090: recipient protocol columns or checks changed'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table AND contype = 'p'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = target_table AND attname = 'endpoint_digest')]::smallint[])
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table AND confrelid = users_table AND contype = 'f'
          AND convalidated AND confdeltype = 'c'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = target_table AND attname = 'owner_user_id')]::smallint[]
          AND confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = users_table AND attname = 'id')]::smallint[])
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS constraint_record
        JOIN pg_catalog.pg_index AS backing_index ON backing_index.indexrelid = constraint_record.conindid
        WHERE constraint_record.conrelid = target_table AND constraint_record.contype = 'u'
          AND constraint_record.convalidated AND NOT constraint_record.condeferrable
          AND NOT constraint_record.condeferred
          AND constraint_record.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = target_table AND attname = 'subscription_id')]::smallint[]
          AND backing_index.indisunique AND backing_index.indisvalid AND backing_index.indisready
          AND backing_index.indimmediate AND backing_index.indnkeyatts = 1
          AND backing_index.indnatts = 1 AND backing_index.indpred IS NULL
          AND backing_index.indexprs IS NULL)
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS trigger_record
        WHERE trigger_record.tgrelid = target_table
          AND trigger_record.tgname = 'push_subscription_ownership_protocol_reset'
          AND trigger_record.tgfoid = trigger_function AND trigger_record.tgenabled = 'O'
          AND trigger_record.tgtype = 23 AND trigger_record.tgattr::text = '2 3 4 5'
          AND trigger_record.tgnargs = 0 AND NOT trigger_record.tgisinternal)
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger
           WHERE tgrelid = target_table AND NOT tgisinternal) <> 1
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
           WHERE conrelid = target_table) <> 8
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index
           WHERE indrelid = target_table) <> 3
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index AS index_record
        WHERE index_record.indexrelid = 'public.push_subscription_ownership_owner_idx'::regclass
          AND index_record.indrelid = target_table AND index_record.indisvalid
          AND index_record.indisready AND NOT index_record.indisunique
          AND index_record.indnkeyatts = 2 AND index_record.indnatts = 2
          AND pg_catalog.pg_get_indexdef(index_record.indexrelid, 1, true) = 'owner_user_id'
          AND pg_catalog.pg_get_indexdef(index_record.indexrelid, 2, true) = 'endpoint_digest'
          AND pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid) = '(owner_user_id IS NOT NULL)')
    THEN RAISE EXCEPTION 'LL090: recipient protocol trigger or index changed'; END IF;

    IF pg_catalog.pg_get_function_result(functions[1]) IS DISTINCT FROM
        'TABLE(subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text, stored_auth text, stored_user_agent text, stored_created_at timestamp with time zone, recipient_generation uuid, ownership_version bigint)'
       OR pg_catalog.pg_get_function_result(functions[2]) IS DISTINCT FROM
        'TABLE(subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text, stored_auth text, stored_user_agent text, stored_created_at timestamp with time zone, recipient_generation uuid, ownership_version bigint, recipient_protocol_version smallint)'
       OR pg_catalog.pg_get_function_result(functions[3]) IS DISTINCT FROM 'boolean'
       OR pg_catalog.pg_get_function_result(functions[4]) IS DISTINCT FROM
        'TABLE(subscription_id uuid, recipient_generation uuid, ownership_version bigint, recipient_protocol_version smallint)'
       OR (SELECT procedure.provolatile FROM pg_catalog.pg_proc AS procedure
           WHERE procedure.oid = functions[4]) <> 's'
       OR pg_catalog.pg_get_function_result(trigger_function) IS DISTINCT FROM 'trigger'
       OR NOT (SELECT procedure.prosecdef AND procedure.prokind = 'f'
            AND pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
            AND procedure.proconfig = ARRAY['search_path=""']::text[]
           FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid = trigger_function)
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
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) AS privilege
        WHERE procedure.oid = trigger_function AND privilege.grantee <> procedure.proowner)
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public' AND procedure.proname = ANY (ARRAY[
            'save_push_subscription_with_generation',
            'release_push_subscription_with_generation',
            'read_push_subscription_generations',
            'reset_push_recipient_protocol_version'])) <> 5
    THEN RAISE EXCEPTION 'LL090: recipient protocol function contract changed'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
        WHERE relation.oid = target_table AND owner.rolname = 'postgres'
          AND owner.rolbypassrls AND relation.relrowsecurity AND NOT relation.relforcerowsecurity)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            relation.relacl, pg_catalog.acldefault('r', relation.relowner))) AS privilege
        WHERE relation.oid = target_table AND privilege.grantee <> relation.relowner)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        WHERE attribute.attrelid = target_table AND attribute.attnum > 0 AND NOT attribute.attisdropped)
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role(role_name)
        WHERE pg_catalog.has_table_privilege(role.role_name, target_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           OR pg_catalog.has_any_column_privilege(role.role_name, target_table,
            'SELECT, INSERT, UPDATE, REFERENCES'))
    THEN RAISE EXCEPTION 'LL090: recipient protocol RLS or ACL changed'; END IF;
END; $postconditions$;

-- Apply after 20260726 ownership Layer 2; runtime proof, server/client/SW wiring, and rollout remain mandatory before production.
-- Rollback after stopping new callers: restore the prior read RPC, drop the seven-argument save, trigger/function, check, then column.
COMMIT;
