BEGIN;

SET LOCAL search_path = '';

DO $migration$
DECLARE
    target_table regclass := pg_catalog.to_regclass('public.push_subscriptions');
    users_table regclass := pg_catalog.to_regclass('public.users');
    missing_columns text[];
    table_owner name;
    service_role_bypasses_rls boolean;
BEGIN
    IF target_table IS NULL THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions does not exist';
    END IF;
    IF (SELECT relkind FROM pg_catalog.pg_class WHERE oid = target_table) <> 'r' THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions must be an ordinary table';
    END IF;
    LOCK TABLE public.push_subscriptions IN ACCESS EXCLUSIVE MODE;
    IF (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table) THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions unexpectedly has FORCE RLS enabled';
    END IF;
    IF users_table IS NULL THEN
        RAISE EXCEPTION 'F016: public.users does not exist';
    END IF;

    SELECT pg_catalog.array_agg(expected.column_name ORDER BY expected.column_name)
    INTO missing_columns
    FROM (
        VALUES
            ('id', 'uuid', true),
            ('user_id', 'uuid', true),
            ('endpoint', 'text', true),
            ('p256dh', 'text', true),
            ('auth', 'text', true),
            ('user_agent', 'text', false),
            ('created_at', 'timestamp with time zone', false)
    ) AS expected(column_name, data_type, not_null)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = target_table
          AND attribute.attname = expected.column_name
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions is missing columns: %',
            missing_columns;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            VALUES
                ('id', 'uuid', true),
                ('user_id', 'uuid', true),
                ('endpoint', 'text', true),
                ('p256dh', 'text', true),
                ('auth', 'text', true),
                ('user_agent', 'text', false),
                ('created_at', 'timestamp with time zone', false)
        ) AS expected(column_name, data_type, not_null)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = target_table
         AND attribute.attname = expected.column_name
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
        WHERE pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
                  <> expected.data_type
           OR attribute.attnotnull <> expected.not_null
    ) THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions has incompatible column definitions';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute
        WHERE attrelid = target_table
          AND attname = 'id'
          AND atthasdef
          AND attgenerated = ''
          AND NOT attisdropped
    ) THEN
        RAISE EXCEPTION 'F016: push_subscriptions.id must have a default';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.contype = 'f'
          AND constraint_record.convalidated
          AND constraint_record.conrelid = target_table
          AND constraint_record.confrelid = users_table
          AND constraint_record.confdeltype = 'c'
          AND constraint_record.conkey = ARRAY[(
              SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'user_id'
          )]::smallint[]
          AND constraint_record.confkey = ARRAY[(
              SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = users_table AND attname = 'id'
          )]::smallint[]
    ) THEN
        RAISE EXCEPTION 'F016: push_subscriptions.user_id must reference public.users(id) ON DELETE CASCADE';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table
          AND contype = 'p'
          AND conkey = ARRAY[(
              SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'id'
          )]::smallint[]
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table
          AND contype = 'u'
          AND pg_catalog.cardinality(conkey) = 2
          AND (SELECT attnum FROM pg_catalog.pg_attribute
               WHERE attrelid = target_table AND attname = 'user_id') = ANY(conkey)
          AND (SELECT attnum FROM pg_catalog.pg_attribute
               WHERE attrelid = target_table AND attname = 'endpoint') = ANY(conkey)
    ) THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions required indexes are missing';
    END IF;

    SELECT pg_catalog.pg_get_userbyid(relowner)
    INTO table_owner
    FROM pg_catalog.pg_class
    WHERE oid = target_table;
    IF table_owner IS NULL OR table_owner IN ('anon', 'authenticated', 'service_role') THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions has an unsafe owner: %',
            table_owner;
    END IF;

    SELECT rolbypassrls
    INTO service_role_bypasses_rls
    FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role';
    IF service_role_bypasses_rls IS NOT TRUE THEN
        RAISE EXCEPTION 'F016: service_role must have BYPASSRLS';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table
    ) THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions has unexpected existing policies';
    END IF;
END;
$migration$;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.push_subscriptions
    FROM PUBLIC, anon, authenticated, service_role;

DO $revoke_privileges$
DECLARE
    target_table regclass := 'public.push_subscriptions'::regclass;
    item record;
BEGIN
    FOR item IN
        SELECT attname
        FROM pg_catalog.pg_attribute
        WHERE attrelid = target_table AND attnum > 0 AND NOT attisdropped
    LOOP
        EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES (%I) ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated, service_role',
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
        WHERE sequence_class.relkind = 'S'
          AND dependency.refobjid = target_table
    LOOP
        EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role',
            item.sequence_name
        );
    END LOOP;
END;
$revoke_privileges$;

GRANT SELECT (
    id, user_id, endpoint, p256dh, auth, user_agent, created_at
) ON TABLE public.push_subscriptions TO service_role;
GRANT INSERT (
    user_id, endpoint, p256dh, auth, user_agent, created_at
) ON TABLE public.push_subscriptions TO service_role;
GRANT UPDATE (
    user_id, endpoint, p256dh, auth, user_agent, created_at
) ON TABLE public.push_subscriptions TO service_role;
GRANT DELETE ON TABLE public.push_subscriptions TO service_role;

DO $grant_sequences$
DECLARE
    target_table regclass := 'public.push_subscriptions'::regclass;
    sequence_record record;
BEGIN
    FOR sequence_record IN
        SELECT sequence_class.oid::regclass AS sequence_name
        FROM pg_catalog.pg_class AS sequence_class
        JOIN pg_catalog.pg_depend AS dependency
          ON dependency.objid = sequence_class.oid
         AND dependency.deptype IN ('a', 'i')
         AND dependency.classid = 'pg_catalog.pg_class'::regclass
         AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
         AND dependency.objsubid = 0 AND dependency.refobjsubid > 0
        WHERE sequence_class.relkind = 'S'
          AND dependency.refobjid = target_table
    LOOP
        EXECUTE pg_catalog.format(
            'GRANT USAGE ON SEQUENCE %s TO service_role',
            sequence_record.sequence_name
        );
    END LOOP;
END;
$grant_sequences$;

DO $assertions$
DECLARE
    target_table regclass := 'public.push_subscriptions'::regclass;
    role_name name;
    sequence_record record;
    select_columns constant name[] := ARRAY[
        'id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'
    ]::name[];
    write_columns constant name[] := ARRAY[
        'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at'
    ]::name[];
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table) THEN
        RAISE EXCEPTION 'F016: public.push_subscriptions RLS state is incorrect';
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
            RAISE EXCEPTION 'F016: role % retains push_subscriptions privileges',
                role_name;
        END IF;
    END LOOP;

    IF pg_catalog.has_table_privilege('service_role', target_table, 'SELECT')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'INSERT')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'UPDATE')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'TRUNCATE')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'REFERENCES')
       OR pg_catalog.has_table_privilege('service_role', target_table, 'TRIGGER')
       OR NOT pg_catalog.has_table_privilege('service_role', target_table, 'DELETE')
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_attribute AS attribute
           WHERE attribute.attrelid = target_table
             AND attribute.attnum > 0
             AND NOT attribute.attisdropped
             AND (
                 pg_catalog.has_column_privilege('service_role', target_table, attribute.attname, 'SELECT')
                     <> (attribute.attname = ANY(select_columns))
                 OR pg_catalog.has_column_privilege('service_role', target_table, attribute.attname, 'INSERT')
                     <> (attribute.attname = ANY(write_columns))
                 OR pg_catalog.has_column_privilege('service_role', target_table, attribute.attname, 'UPDATE')
                     <> (attribute.attname = ANY(write_columns))
                 OR pg_catalog.has_column_privilege('service_role', target_table, attribute.attname, 'REFERENCES')
             )
       ) THEN
        RAISE EXCEPTION 'F016: service_role push_subscriptions privileges are incorrect';
    END IF;

    FOR sequence_record IN
        SELECT sequence_class.oid::regclass AS sequence_name
        FROM pg_catalog.pg_class AS sequence_class
        JOIN pg_catalog.pg_depend AS dependency
          ON dependency.objid = sequence_class.oid
         AND dependency.deptype IN ('a', 'i')
         AND dependency.classid = 'pg_catalog.pg_class'::regclass
         AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
         AND dependency.objsubid = 0 AND dependency.refobjsubid > 0
        WHERE sequence_class.relkind = 'S'
          AND dependency.refobjid = target_table
    LOOP
        IF NOT pg_catalog.has_sequence_privilege(
            'service_role', sequence_record.sequence_name, 'USAGE'
        ) OR pg_catalog.has_sequence_privilege(
            'service_role', sequence_record.sequence_name, 'SELECT'
        ) OR pg_catalog.has_sequence_privilege(
            'service_role', sequence_record.sequence_name, 'UPDATE'
        ) THEN
            RAISE EXCEPTION 'F016: service_role owned sequence privileges are incorrect';
        END IF;
        FOREACH role_name IN ARRAY ARRAY['anon'::name, 'authenticated'::name]
        LOOP
            IF pg_catalog.has_sequence_privilege(
                role_name, sequence_record.sequence_name, 'USAGE'
            ) OR pg_catalog.has_sequence_privilege(
                role_name, sequence_record.sequence_name, 'SELECT'
            ) OR pg_catalog.has_sequence_privilege(
                role_name, sequence_record.sequence_name, 'UPDATE'
            ) THEN
                RAISE EXCEPTION 'F016: role % retains owned sequence privileges',
                    role_name;
            END IF;
        END LOOP;
    END LOOP;
END;
$assertions$;

COMMIT;
