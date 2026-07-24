BEGIN; SET LOCAL search_path = '';
DO $preconditions$
DECLARE
    target_table regclass := pg_catalog.to_regclass('public.push_subscriptions'); users_table regclass := pg_catalog.to_regclass('public.users');
    actual_columns text[]; actual_defaults text[];
    select_columns constant text[] := ARRAY['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'];
    write_columns constant text[] := ARRAY['user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'];
BEGIN IF target_table IS NULL OR users_table IS NULL OR
       (SELECT relkind FROM pg_catalog.pg_class WHERE oid = target_table) <> 'r' OR
       (SELECT relnamespace FROM pg_catalog.pg_class WHERE oid = target_table) <> pg_catalog.to_regnamespace('public') THEN
        RAISE EXCEPTION 'LL080: push subscription schema is unavailable'; END IF;
    LOCK TABLE public.push_subscriptions IN ACCESS EXCLUSIVE MODE;
    SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s:%s', attribute.attname,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull::text,
        (attribute.attgenerated = '')::text) ORDER BY attribute.attname),
        pg_catalog.array_agg(pg_catalog.format('%s:%s', attribute.attname,
        COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '<none>'))
        ORDER BY attribute.attname) INTO actual_columns, actual_defaults
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS default_value ON
      default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = target_table AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    IF actual_columns IS DISTINCT FROM ARRAY[
        'auth:text:true:true', 'created_at:timestamp with time zone:false:true', 'endpoint:text:true:true',
        'id:uuid:true:true', 'p256dh:text:true:true', 'user_agent:text:false:true', 'user_id:uuid:true:true'
    ]::text[] OR actual_defaults IS DISTINCT FROM ARRAY['auth:<none>', 'created_at:now()',
        'endpoint:<none>', 'id:gen_random_uuid()', 'p256dh:<none>', 'user_agent:<none>',
        'user_id:<none>']::text[] THEN
        RAISE EXCEPTION 'LL080: push subscription columns or defaults changed'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table AND contype = 'p'
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'id')]::smallint[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table AND confrelid = users_table
          AND contype = 'f' AND convalidated AND confdeltype = 'c'
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
            (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = target_table AND attname = 'user_id'),
            (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = target_table AND attname = 'endpoint')]::smallint[]
          AND backing_index.indrelid = target_table AND backing_index.indisunique
          AND backing_index.indisvalid AND backing_index.indisready AND backing_index.indimmediate
          AND backing_index.indnkeyatts = 2 AND backing_index.indnatts = 2
          AND backing_index.indpred IS NULL AND backing_index.indexprs IS NULL
    ) THEN
        RAISE EXCEPTION 'LL080: push subscription keys or public.users FK changed'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
        WHERE relation.oid = target_table AND owner.rolname = 'postgres' AND owner.rolbypassrls
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND rolbypassrls
    ) OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table) THEN
        RAISE EXCEPTION 'LL080: push subscription owner or RLS state changed'; END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            relation.relacl, pg_catalog.acldefault('r', relation.relowner))) AS privilege
        WHERE relation.oid = target_table AND privilege.grantee = 0
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(attribute.attacl, '{}'::aclitem[])) AS privilege
        WHERE attribute.attrelid = target_table AND privilege.grantee = 0
    ) OR EXISTS (
        SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) AS role(role_name)
        WHERE pg_catalog.has_table_privilege(role.role_name, target_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           OR pg_catalog.has_any_column_privilege(role.role_name, target_table,
            'SELECT, INSERT, UPDATE, REFERENCES')
    ) OR pg_catalog.has_table_privilege('service_role', target_table, 'SELECT') OR pg_catalog.has_table_privilege('service_role', target_table, 'INSERT') OR pg_catalog.has_table_privilege('service_role', target_table, 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'TRUNCATE') OR pg_catalog.has_table_privilege('service_role', target_table, 'REFERENCES') OR pg_catalog.has_table_privilege('service_role', target_table, 'TRIGGER') OR NOT pg_catalog.has_table_privilege('service_role', target_table, 'DELETE')
       OR pg_catalog.has_column_privilege('service_role', target_table, 'id', 'INSERT')
       OR pg_catalog.has_column_privilege('service_role', target_table, 'id', 'UPDATE')
       OR pg_catalog.has_any_column_privilege('service_role', target_table, 'REFERENCES')
       OR EXISTS (
        SELECT 1 FROM unnest(select_columns) AS expected(column_name)
        WHERE NOT pg_catalog.has_column_privilege(
            'service_role', target_table, expected.column_name, 'SELECT')
    ) OR EXISTS (
        SELECT 1 FROM unnest(write_columns) AS expected(column_name)
        WHERE NOT pg_catalog.has_column_privilege('service_role', target_table,
            expected.column_name, 'INSERT') OR NOT pg_catalog.has_column_privilege(
            'service_role', target_table, expected.column_name, 'UPDATE')
    ) THEN
        RAISE EXCEPTION 'LL080: push subscription ACL changed'; END IF;
END; $preconditions$;
CREATE FUNCTION public.delete_push_subscription_if_unchanged(
    p_id uuid, p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_created_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE observed_row public.push_subscriptions%ROWTYPE;
BEGIN
    SELECT subscription.* INTO observed_row
    FROM public.push_subscriptions AS subscription
    WHERE subscription.id = p_id
    FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    IF observed_row.user_id IS NOT DISTINCT FROM p_user_id AND observed_row.endpoint IS NOT DISTINCT FROM p_endpoint
       AND observed_row.p256dh IS NOT DISTINCT FROM p_p256dh AND observed_row.auth IS NOT DISTINCT FROM p_auth
       AND observed_row.user_agent IS NOT DISTINCT FROM p_user_agent AND observed_row.created_at IS NOT DISTINCT FROM p_created_at THEN
        DELETE FROM public.push_subscriptions AS subscription
        WHERE subscription.id = p_id;
        RETURN FOUND;
    END IF;
    RETURN false;
END;
$function$;
ALTER FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz) TO service_role;
DO $postconditions$
DECLARE
    function_oid regprocedure :=
        'public.delete_push_subscription_if_unchanged(uuid,uuid,text,text,text,text,timestamp with time zone)'::regprocedure;
BEGIN
    IF (SELECT procedure.prosecdef
            AND procedure.prokind = 'f'
            AND procedure.prorettype = 'boolean'::regtype
            AND pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
            AND procedure.proconfig = ARRAY['search_path=""']::text[]
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid = function_oid) IS DISTINCT FROM TRUE
       OR NOT pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure
           JOIN pg_catalog.pg_namespace AS namespace
             ON namespace.oid = procedure.pronamespace
           WHERE namespace.nspname = 'public'
             AND procedure.proname = 'delete_push_subscription_if_unchanged') <> 1
       OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
        )) AS privilege
        WHERE procedure.oid = function_oid
          AND privilege.grantee NOT IN (
            procedure.proowner,
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
          )
    ) THEN
        RAISE EXCEPTION 'LL080: push subscription CAS RPC postcondition failed'; END IF;
END;
$postconditions$;
COMMIT;
