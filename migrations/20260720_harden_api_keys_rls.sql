BEGIN;

SET LOCAL search_path = '';

DO $migration$
DECLARE
    target_table regclass := pg_catalog.to_regclass('public.api_keys');
    missing_columns text[];
    table_owner name;
    service_role_bypasses_rls boolean;
BEGIN
    IF target_table IS NULL THEN
        RAISE EXCEPTION 'F016: public.api_keys does not exist';
    END IF;

    IF (SELECT relkind FROM pg_catalog.pg_class WHERE oid = target_table) <> 'r' THEN
        RAISE EXCEPTION 'F016: public.api_keys must be an ordinary table';
    END IF;

    IF (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table) THEN
        RAISE EXCEPTION 'F016: public.api_keys unexpectedly has FORCE RLS enabled';
    END IF;

    IF pg_catalog.to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'F016: public.users does not exist';
    END IF;

    SELECT pg_catalog.array_agg(expected.column_name ORDER BY expected.column_name)
    INTO missing_columns
    FROM pg_catalog.unnest(ARRAY[
        'id', 'user_id', 'key', 'key_hash', 'key_prefix', 'scopes',
        'is_admin', 'expires_at', 'revoked_at', 'last_used_at'
    ]) AS expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = target_table
          AND attribute.attname = expected.column_name
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'F016: public.api_keys is missing columns: %', missing_columns;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            VALUES
                ('key', 'text'),
                ('key_hash', 'text'),
                ('key_prefix', 'text'),
                ('is_admin', 'boolean'),
                ('expires_at', 'timestamp with time zone'),
                ('revoked_at', 'timestamp with time zone'),
                ('last_used_at', 'timestamp with time zone')
        ) AS expected(column_name, data_type)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = target_table
         AND attribute.attname = expected.column_name
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
        WHERE pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
              <> expected.data_type
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = target_table
          AND attribute.attname = 'scopes'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
              IN ('text[]', 'jsonb')
    ) THEN
        RAISE EXCEPTION 'F016: public.api_keys has incompatible column types';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.contype = 'f'
          AND constraint_record.conrelid = target_table
          AND constraint_record.confrelid = 'public.users'::regclass
          AND pg_catalog.cardinality(constraint_record.conkey) = 1
          AND pg_catalog.cardinality(constraint_record.confkey) = 1
          AND constraint_record.conkey[1] = (
              SELECT attnum
              FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table
                AND attname = 'user_id'
                AND NOT attisdropped
          )
          AND constraint_record.confkey[1] = (
              SELECT attnum
              FROM pg_catalog.pg_attribute
              WHERE attrelid = 'public.users'::regclass
                AND attname = 'id'
                AND NOT attisdropped
          )
    ) THEN
        RAISE EXCEPTION 'F016: api_keys.user_id must reference public.users(id)';
    END IF;

    SELECT pg_catalog.pg_get_userbyid(relowner)
    INTO table_owner
    FROM pg_catalog.pg_class
    WHERE oid = target_table;

    IF table_owner IN ('anon', 'authenticated', 'service_role') THEN
        RAISE EXCEPTION 'F016: public.api_keys has an unsafe owner: %', table_owner;
    END IF;

    SELECT rolbypassrls
    INTO service_role_bypasses_rls
    FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role';

    IF service_role_bypasses_rls IS NOT TRUE THEN
        RAISE EXCEPTION 'F016: service_role must have BYPASSRLS';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policy
        WHERE polrelid = target_table
    ) THEN
        RAISE EXCEPTION 'F016: public.api_keys has unexpected existing policies';
    END IF;
END;
$migration$;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.api_keys
    FROM PUBLIC, anon, authenticated, service_role;

DO $privileges$
DECLARE
    target_table regclass := 'public.api_keys'::regclass;
    column_record record;
    sequence_record record;
BEGIN
    FOR column_record IN
        SELECT attname
        FROM pg_catalog.pg_attribute
        WHERE attrelid = target_table
          AND attnum > 0
          AND NOT attisdropped
    LOOP
        EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES (%I) ON TABLE public.api_keys FROM PUBLIC, anon, authenticated, service_role',
            column_record.attname
        );
    END LOOP;

    FOR sequence_record IN
        SELECT sequence_class.oid::regclass AS sequence_name
        FROM pg_catalog.pg_class AS sequence_class
        JOIN pg_catalog.pg_depend AS dependency
          ON dependency.objid = sequence_class.oid
         AND dependency.deptype IN ('a', 'i')
        WHERE sequence_class.relkind = 'S'
          AND dependency.refobjid = target_table
    LOOP
        EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role',
            sequence_record.sequence_name
        );
    END LOOP;
END;
$privileges$;

GRANT SELECT (
    id,
    user_id,
    scopes,
    is_admin,
    expires_at,
    revoked_at,
    key_hash,
    key
) ON TABLE public.api_keys TO service_role;
GRANT UPDATE (last_used_at) ON TABLE public.api_keys TO service_role;

DO $assertions$
DECLARE
    target_table regclass := 'public.api_keys'::regclass;
    role_name name;
    required_select_columns constant name[] := ARRAY[
        'id', 'user_id', 'scopes', 'is_admin', 'expires_at', 'revoked_at',
        'key_hash', 'key'
    ]::name[];
    sequence_record record;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table) THEN
        RAISE EXCEPTION 'F016: public.api_keys RLS state is incorrect';
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon'::name, 'authenticated'::name]
    LOOP
        IF pg_catalog.has_table_privilege(role_name, target_table, 'SELECT')
           OR pg_catalog.has_table_privilege(role_name, target_table, 'INSERT')
           OR pg_catalog.has_table_privilege(role_name, target_table, 'UPDATE')
           OR pg_catalog.has_table_privilege(role_name, target_table, 'DELETE')
           OR pg_catalog.has_table_privilege(role_name, target_table, 'TRUNCATE')
           OR pg_catalog.has_table_privilege(role_name, target_table, 'REFERENCES')
           OR pg_catalog.has_table_privilege(role_name, target_table, 'TRIGGER')
           OR pg_catalog.has_any_column_privilege(role_name, target_table, 'SELECT')
           OR pg_catalog.has_any_column_privilege(role_name, target_table, 'INSERT')
           OR pg_catalog.has_any_column_privilege(role_name, target_table, 'UPDATE')
           OR pg_catalog.has_any_column_privilege(role_name, target_table, 'REFERENCES') THEN
            RAISE EXCEPTION 'F016: role % retains api_keys privileges', role_name;
        END IF;
    END LOOP;

    IF pg_catalog.has_table_privilege('service_role', target_table, 'SELECT')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'INSERT')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'TRUNCATE')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'REFERENCES')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'TRIGGER')
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.unnest(required_select_columns) AS required(column_name)
           WHERE NOT pg_catalog.has_column_privilege(
               'service_role',
               target_table,
               required.column_name,
               'SELECT'
           )
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_attribute AS attribute
           WHERE attribute.attrelid = target_table
             AND attribute.attnum > 0
             AND NOT attribute.attisdropped
             AND NOT (attribute.attname = ANY(required_select_columns))
             AND pg_catalog.has_column_privilege(
                 'service_role',
                 target_table,
                 attribute.attname,
                 'SELECT'
             )
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_attribute AS attribute
           WHERE attribute.attrelid = target_table
             AND attribute.attnum > 0
             AND NOT attribute.attisdropped
             AND attribute.attname <> 'last_used_at'
             AND pg_catalog.has_column_privilege(
                 'service_role',
                 target_table,
                 attribute.attname,
                 'UPDATE'
             )
       )
       OR pg_catalog.has_any_column_privilege(
           'service_role',
           target_table,
           'INSERT'
       )
       OR pg_catalog.has_any_column_privilege(
           'service_role',
           target_table,
           'REFERENCES'
       )
       OR NOT pg_catalog.has_column_privilege(
           'service_role',
           target_table,
           'last_used_at',
           'UPDATE'
       ) THEN
        RAISE EXCEPTION 'F016: service_role api_keys privileges are incorrect';
    END IF;

    FOR sequence_record IN
        SELECT sequence_class.oid::regclass AS sequence_name
        FROM pg_catalog.pg_class AS sequence_class
        JOIN pg_catalog.pg_depend AS dependency
          ON dependency.objid = sequence_class.oid
         AND dependency.deptype IN ('a', 'i')
        WHERE sequence_class.relkind = 'S'
          AND dependency.refobjid = target_table
    LOOP
        FOREACH role_name IN ARRAY ARRAY[
            'anon'::name,
            'authenticated'::name,
            'service_role'::name
        ]
        LOOP
            IF pg_catalog.has_sequence_privilege(
                role_name,
                sequence_record.sequence_name,
                'USAGE'
            )
               OR pg_catalog.has_sequence_privilege(
                   role_name,
                   sequence_record.sequence_name,
                   'SELECT'
               )
               OR pg_catalog.has_sequence_privilege(
                   role_name,
                   sequence_record.sequence_name,
                   'UPDATE'
               ) THEN
                RAISE EXCEPTION 'F016: role % retains api_keys sequence privileges',
                    role_name;
            END IF;
        END LOOP;
    END LOOP;
END;
$assertions$;

COMMIT;
