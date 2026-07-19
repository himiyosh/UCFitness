BEGIN;

SET LOCAL search_path = '';

DO $migration$
DECLARE
    target_table regclass := pg_catalog.to_regclass('public.coin_transactions');
    users_table regclass := pg_catalog.to_regclass('public.users');
    mismatched_columns text[];
    table_owner name;
    id_default text;
    created_at_default text;
    type_definition text;
    allowed_types text[];
    service_role_bypasses_rls boolean;
BEGIN
    IF target_table IS NULL THEN
        RAISE EXCEPTION 'F016: public.coin_transactions does not exist';
    END IF;
    IF (SELECT relkind FROM pg_catalog.pg_class WHERE oid = target_table) <> 'r' THEN
        RAISE EXCEPTION 'F016: public.coin_transactions must be an ordinary table';
    END IF;
    LOCK TABLE public.coin_transactions IN ACCESS EXCLUSIVE MODE;
    IF users_table IS NULL THEN
        RAISE EXCEPTION 'F016: public.users does not exist';
    END IF;

    SELECT pg_catalog.array_agg(expected.column_name ORDER BY expected.column_name)
    INTO mismatched_columns
    FROM (
        VALUES
            ('id', 'uuid', true, true),
            ('user_id', 'uuid', true, false),
            ('date', 'date', true, false),
            ('type', 'text', true, false),
            ('amount', 'integer', true, false),
            ('description', 'text', false, false),
            ('idempotency_key', 'text', false, false),
            ('created_at', 'timestamp with time zone', false, true)
    ) AS expected(column_name, data_type, not_null, has_default)
    LEFT JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = target_table
     AND attribute.attname = expected.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    WHERE attribute.attname IS NULL
       OR pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
            <> expected.data_type
       OR attribute.attnotnull <> expected.not_null
       OR attribute.atthasdef <> expected.has_default
       OR attribute.attgenerated <> '';

    IF mismatched_columns IS NOT NULL OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_attribute
        WHERE attrelid = target_table AND attnum > 0 AND NOT attisdropped
    ) <> 8 THEN
        RAISE EXCEPTION 'F016: public.coin_transactions has incompatible columns: %',
            mismatched_columns;
    END IF;

    SELECT pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
    INTO id_default
    FROM pg_catalog.pg_attrdef AS attribute_default
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = attribute_default.adrelid
     AND attribute.attnum = attribute_default.adnum
    WHERE attribute_default.adrelid = target_table AND attribute.attname = 'id';
    SELECT pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
    INTO created_at_default
    FROM pg_catalog.pg_attrdef AS attribute_default
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = attribute_default.adrelid
     AND attribute.attnum = attribute_default.adnum
    WHERE attribute_default.adrelid = target_table AND attribute.attname = 'created_at';
    IF id_default NOT IN ('gen_random_uuid()', 'uuid_generate_v4()')
       OR created_at_default <> 'now()' THEN
        RAISE EXCEPTION 'F016: public.coin_transactions has incompatible defaults';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table
          AND contype = 'p'
          AND convalidated
          AND conkey = ARRAY[(
              SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'id'
          )]::smallint[]
    ) THEN
        RAISE EXCEPTION 'F016: coin_transactions.id must be the primary key';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table
          AND confrelid = users_table
          AND contype = 'f'
          AND convalidated
          AND conkey = ARRAY[(
              SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'user_id'
          )]::smallint[]
          AND confkey = ARRAY[(
              SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = users_table AND attname = 'id'
          )]::smallint[]
    ) THEN
        RAISE EXCEPTION 'F016: coin_transactions.user_id must reference public.users(id)';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_record
        JOIN pg_catalog.pg_class AS index_class
          ON index_class.oid = index_record.indexrelid
        WHERE index_record.indrelid = target_table
          AND index_class.relname = 'idx_coin_transactions_idempotency'
          AND index_record.indisunique
          AND index_record.indisvalid
          AND index_record.indisready
          AND index_record.indnkeyatts = 1
          AND index_record.indpred IS NULL
          AND index_record.indexprs IS NULL
          AND index_record.indkey::text = (
              SELECT attnum::text FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'idempotency_key'
          )
    ) THEN
        RAISE EXCEPTION 'F016: coin_transactions idempotency index is incompatible';
    END IF;

    SELECT pg_catalog.pg_get_constraintdef(oid, true)
    INTO type_definition
    FROM pg_catalog.pg_constraint
    WHERE conrelid = target_table
      AND conname = 'coin_transactions_type_check'
      AND contype = 'c'
      AND convalidated;
    SELECT pg_catalog.array_agg(matches[1] ORDER BY matches[1])
    INTO allowed_types
    FROM pg_catalog.regexp_matches(type_definition, '''([A-Z_]+)''', 'g') AS matches;
    IF allowed_types IS DISTINCT FROM ARRAY[
        'GIFT_RECEIVE', 'GIFT_SEND', 'GOAL_BONUS', 'LOGIN_BONUS',
        'MISSION_REWARD', 'PURCHASE', 'RANK_BONUS', 'STEPS',
        'STREAK_BONUS', 'STREAK_MILESTONE'
    ]::text[] THEN
        RAISE EXCEPTION 'F016: coin_transactions type constraint is incompatible';
    END IF;

    SELECT pg_catalog.pg_get_userbyid(relowner)
    INTO table_owner
    FROM pg_catalog.pg_class
    WHERE oid = target_table;
    IF table_owner IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION 'F016: public.coin_transactions has an unsafe owner: %',
            table_owner;
    END IF;
    IF (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table) THEN
        RAISE EXCEPTION 'F016: public.coin_transactions unexpectedly has FORCE RLS enabled';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table) THEN
        RAISE EXCEPTION 'F016: public.coin_transactions has unexpected existing policies';
    END IF;
    SELECT rolbypassrls
    INTO service_role_bypasses_rls
    FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role';
    IF service_role_bypasses_rls IS NOT TRUE THEN
        RAISE EXCEPTION 'F016: service_role must have BYPASSRLS';
    END IF;
END;
$migration$;

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.coin_transactions
    FROM PUBLIC, anon, authenticated, service_role;

DO $revoke_privileges$
DECLARE
    target_table regclass := 'public.coin_transactions'::regclass;
    item record;
BEGIN
    FOR item IN
        SELECT attname FROM pg_catalog.pg_attribute
        WHERE attrelid = target_table AND attnum > 0 AND NOT attisdropped
    LOOP
        EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES (%I) ON TABLE public.coin_transactions FROM PUBLIC, anon, authenticated, service_role',
            item.attname
        );
    END LOOP;
    FOR item IN
        SELECT sequence_class.oid::regclass AS sequence_name
        FROM pg_catalog.pg_class AS sequence_class
        JOIN pg_catalog.pg_depend AS dependency
          ON dependency.objid = sequence_class.oid
         AND dependency.deptype IN ('a', 'i')
         AND dependency.classid = 'pg_catalog.pg_class'::regclass
         AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
         AND dependency.objsubid = 0 AND dependency.refobjsubid > 0
        WHERE sequence_class.relkind = 'S' AND dependency.refobjid = target_table
    LOOP
        EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role',
            item.sequence_name
        );
    END LOOP;
END;
$revoke_privileges$;

GRANT SELECT (
    id, user_id, date, type, amount, description, idempotency_key, created_at
) ON TABLE public.coin_transactions TO service_role;
GRANT INSERT (
    user_id, date, type, amount, description, idempotency_key
) ON TABLE public.coin_transactions TO service_role;
GRANT UPDATE (
    user_id, date, type, amount, description, idempotency_key
) ON TABLE public.coin_transactions TO service_role;
GRANT DELETE ON TABLE public.coin_transactions TO service_role;

DO $assertions$
DECLARE
    target_table regclass := 'public.coin_transactions'::regclass;
    role_name name;
    item record;
    read_columns constant name[] := ARRAY[
        'id', 'user_id', 'date', 'type', 'amount', 'description',
        'idempotency_key', 'created_at'
    ]::name[];
    write_columns constant name[] := ARRAY[
        'user_id', 'date', 'type', 'amount', 'description', 'idempotency_key'
    ]::name[];
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table) THEN
        RAISE EXCEPTION 'F016: public.coin_transactions RLS state is incorrect';
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon'::name, 'authenticated'::name]
    LOOP
        IF pg_catalog.has_table_privilege(role_name, target_table, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           OR pg_catalog.has_any_column_privilege(role_name, target_table, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
            RAISE EXCEPTION 'F016: role % retains coin_transactions privileges',
                role_name;
        END IF;
    END LOOP;
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS target
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(target.relacl, pg_catalog.acldefault('r', target.relowner))
        ) AS privilege
        WHERE target.oid = target_table
          AND privilege.grantee NOT IN (
              target.relowner,
              (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
          )
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(attribute.attacl, '{}'::aclitem[])
        ) AS privilege
        WHERE attribute.attrelid = target_table
          AND attribute.attnum > 0
          AND privilege.grantee NOT IN (
              (SELECT relowner FROM pg_catalog.pg_class WHERE oid = target_table),
              (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
          )
    ) THEN
        RAISE EXCEPTION 'F016: an unexpected role retains coin_transactions privileges';
    END IF;

    IF pg_catalog.has_table_privilege('service_role', target_table, 'SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER')
       OR NOT pg_catalog.has_table_privilege('service_role', target_table, 'DELETE')
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_attribute AS attribute
            WHERE attribute.attrelid = target_table
              AND attribute.attnum > 0
              AND NOT attribute.attisdropped
              AND (
                  pg_catalog.has_column_privilege('service_role', target_table, attribute.attname, 'SELECT')
                      <> (attribute.attname = ANY(read_columns))
                  OR pg_catalog.has_column_privilege('service_role', target_table, attribute.attname, 'INSERT')
                      <> (attribute.attname = ANY(write_columns))
                  OR pg_catalog.has_column_privilege('service_role', target_table, attribute.attname, 'UPDATE')
                      <> (attribute.attname = ANY(write_columns))
                  OR pg_catalog.has_column_privilege('service_role', target_table, attribute.attname, 'REFERENCES')
              )
       ) THEN
        RAISE EXCEPTION 'F016: service_role coin_transactions privileges are incorrect';
    END IF;

    FOR item IN
        SELECT sequence_class.oid::regclass AS sequence_name
        FROM pg_catalog.pg_class AS sequence_class
        JOIN pg_catalog.pg_depend AS dependency
          ON dependency.objid = sequence_class.oid
         AND dependency.deptype IN ('a', 'i')
         AND dependency.classid = 'pg_catalog.pg_class'::regclass
         AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
         AND dependency.objsubid = 0 AND dependency.refobjsubid > 0
        WHERE sequence_class.relkind = 'S' AND dependency.refobjid = target_table
    LOOP
        EXECUTE pg_catalog.format(
            'GRANT USAGE ON SEQUENCE %s TO service_role',
            item.sequence_name
        );
        IF NOT pg_catalog.has_sequence_privilege('service_role', item.sequence_name, 'USAGE')
           OR pg_catalog.has_sequence_privilege('service_role', item.sequence_name, 'SELECT, UPDATE')
           OR pg_catalog.has_sequence_privilege('anon', item.sequence_name, 'USAGE, SELECT, UPDATE')
           OR pg_catalog.has_sequence_privilege('authenticated', item.sequence_name, 'USAGE, SELECT, UPDATE')
           OR EXISTS (
                SELECT 1
                FROM pg_catalog.pg_class AS sequence_class
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                    COALESCE(
                        sequence_class.relacl,
                        pg_catalog.acldefault('s', sequence_class.relowner)
                    )
                ) AS privilege
                WHERE sequence_class.oid = item.sequence_name
                  AND privilege.grantee NOT IN (
                      sequence_class.relowner,
                      (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
                  )
           ) THEN
            RAISE EXCEPTION 'F016: owned sequence privileges are incorrect';
        END IF;
    END LOOP;
END;
$assertions$;

COMMIT;
