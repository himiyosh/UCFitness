BEGIN;

SET LOCAL search_path = '';

DO $migration$
DECLARE
    target_table regclass := pg_catalog.to_regclass('public.coin_balances');
    users_table regclass := pg_catalog.to_regclass('public.users');
    expected_function text;
    function_oid regprocedure;
    mismatched_columns text[];
    table_owner oid; table_owner_name name;
    table_owner_bypasses_rls boolean; service_role_oid oid;
    service_role_bypasses_rls boolean;
BEGIN
    IF target_table IS NULL THEN
        RAISE EXCEPTION 'F016: public.coin_balances does not exist';
    END IF;
    IF (SELECT relkind FROM pg_catalog.pg_class WHERE oid = target_table) <> 'r' THEN
        RAISE EXCEPTION 'F016: public.coin_balances must be an ordinary table';
    END IF;
    LOCK TABLE public.coin_balances IN ACCESS EXCLUSIVE MODE;
    IF users_table IS NULL THEN
        RAISE EXCEPTION 'F016: public.users does not exist';
    END IF;

    SELECT pg_catalog.array_agg(expected.column_name ORDER BY expected.column_name)
    INTO mismatched_columns
    FROM (
        VALUES
            ('user_id', 'uuid', true, NULL::text),
            ('total_balance', 'bigint', true, '0'), ('total_earned', 'bigint', true, '0'),
            ('total_bonus', 'bigint', true, '0'), ('current_streak', 'integer', true, '0'),
            ('best_streak', 'integer', true, '0'),
            ('investor_rank', 'text', true, '''BEGINNER''::text'),
            ('updated_at', 'timestamp with time zone', true, 'now()')
    ) AS expected(column_name, data_type, not_null, default_expression)
    LEFT JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = target_table
     AND attribute.attname = expected.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attname IS NULL
       OR pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
            <> expected.data_type
       OR attribute.attnotnull <> expected.not_null
       OR attribute.atthasdef <> (expected.default_expression IS NOT NULL)
       OR pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
            IS DISTINCT FROM expected.default_expression
       OR attribute.attgenerated <> '';
    IF mismatched_columns IS NOT NULL OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_attribute
        WHERE attrelid = target_table AND attnum > 0 AND NOT attisdropped
    ) <> 8 THEN
        RAISE EXCEPTION 'F016: public.coin_balances has incompatible columns: %',
            mismatched_columns;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table
          AND contype = 'p'
          AND convalidated
          AND conkey = ARRAY[(
              SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = target_table AND attname = 'user_id'
          )]::smallint[]
    ) THEN
        RAISE EXCEPTION 'F016: coin_balances.user_id must be the primary key';
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
        RAISE EXCEPTION 'F016: coin_balances.user_id must reference public.users(id)';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conrelid = target_table
          AND conname = 'coin_balances_non_negative_balance'
          AND contype = 'c'
          AND convalidated
          AND pg_catalog.regexp_replace(
              pg_catalog.pg_get_constraintdef(oid, false),
              '[[:space:]()]', '', 'g'
          ) = 'CHECKtotal_balance>=0'
    ) THEN
        RAISE EXCEPTION 'F016: coin_balances non-negative balance check is incompatible';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS sequence_class
        JOIN pg_catalog.pg_depend AS dependency
          ON dependency.objid = sequence_class.oid
         AND dependency.deptype IN ('a', 'i')
         AND dependency.classid = 'pg_catalog.pg_class'::regclass
         AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
         AND dependency.objsubid = 0
         AND dependency.refobjsubid > 0
        WHERE sequence_class.relkind = 'S'
          AND dependency.refobjid = target_table
    ) THEN
        RAISE EXCEPTION 'F016: public.coin_balances must not own sequences';
    END IF;
    SELECT relowner, pg_catalog.pg_get_userbyid(relowner)
    INTO table_owner, table_owner_name
    FROM pg_catalog.pg_class
    WHERE oid = target_table;
    SELECT rolbypassrls
    INTO table_owner_bypasses_rls
    FROM pg_catalog.pg_roles
    WHERE oid = table_owner;
    SELECT oid, rolbypassrls
    INTO service_role_oid, service_role_bypasses_rls
    FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role';
    IF table_owner_name IS DISTINCT FROM 'postgres'
       OR table_owner_bypasses_rls IS NOT TRUE THEN
        RAISE EXCEPTION 'F016: public.coin_balances has an unsafe owner: %',
            table_owner_name;
    END IF;
    IF service_role_oid IS NULL OR service_role_bypasses_rls IS NOT TRUE THEN
        RAISE EXCEPTION 'F016: service_role must have BYPASSRLS';
    END IF;
    IF (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table) THEN
        RAISE EXCEPTION 'F016: public.coin_balances unexpectedly has FORCE RLS enabled';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table) THEN
        RAISE EXCEPTION 'F016: public.coin_balances has unexpected existing policies';
    END IF;

    FOREACH expected_function IN ARRAY ARRAY[
        'public.recalculate_coin_balance(uuid,integer)',
        'public.deduct_balance(uuid,integer,text,text,text)',
        'public.credit_balance(uuid,integer,text,text,text,date)',
        'public.award_streak_milestones(date)'
    ]
    LOOP
        function_oid := pg_catalog.to_regprocedure(expected_function);
        IF function_oid IS NULL THEN
            RAISE EXCEPTION 'F016: required balance writer is missing: %',
                expected_function;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc AS procedure
            JOIN pg_catalog.pg_language AS language
              ON language.oid = procedure.prolang
            JOIN pg_catalog.pg_roles AS owner_role
              ON owner_role.oid = procedure.proowner
            WHERE procedure.oid = function_oid
              AND (
                  procedure.proowner <> table_owner
                  OR owner_role.rolbypassrls IS NOT TRUE
                  OR language.lanname <> 'plpgsql'
                  OR procedure.proconfig IS DISTINCT FROM
                     ARRAY['search_path=""']::text[]
              )
        ) OR NOT pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE')
          OR pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
          OR pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc AS procedure
            CROSS JOIN LATERAL pg_catalog.aclexplode(
                COALESCE(
                    procedure.proacl,
                    pg_catalog.acldefault('f', procedure.proowner)
                )
            ) AS privilege
            WHERE procedure.oid = function_oid
              AND privilege.grantee NOT IN (table_owner, service_role_oid)
        ) THEN
            RAISE EXCEPTION 'F016: balance writer security contract is unsafe: %',
                expected_function;
        END IF;
    END LOOP;
END;
$migration$;

ALTER FUNCTION public.recalculate_coin_balance(uuid, integer) SECURITY DEFINER;
ALTER FUNCTION public.deduct_balance(uuid, integer, text, text, text) SECURITY DEFINER;
ALTER FUNCTION public.credit_balance(uuid, integer, text, text, text, date) SECURITY DEFINER;
ALTER FUNCTION public.award_streak_milestones(date) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.recalculate_coin_balance(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.deduct_balance(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.credit_balance(uuid, integer, text, text, text, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.award_streak_milestones(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_coin_balance(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_balance(uuid, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid, integer, text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_streak_milestones(date) TO service_role;

ALTER TABLE public.coin_balances ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.coin_balances
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (
    user_id, total_balance, total_earned, total_bonus,
    current_streak, best_streak, investor_rank, updated_at
) ON TABLE public.coin_balances FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (
    user_id, total_balance, total_earned, total_bonus,
    current_streak, best_streak, investor_rank
) ON TABLE public.coin_balances TO service_role;

DO $assertions$
DECLARE
    target_table regclass := 'public.coin_balances'::regclass;
    table_owner oid; service_role_oid oid; role_name name;
    expected_function text; function_oid regprocedure;
    read_columns constant name[] := ARRAY[
        'user_id', 'total_balance', 'total_earned', 'total_bonus',
        'current_streak', 'best_streak', 'investor_rank'
    ]::name[];
BEGIN
    SELECT relowner INTO table_owner
    FROM pg_catalog.pg_class
    WHERE oid = target_table;
    SELECT oid INTO service_role_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role';
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = target_table)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_table) THEN
        RAISE EXCEPTION 'F016: public.coin_balances RLS state is incorrect';
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon'::name, 'authenticated'::name]
    LOOP
        IF pg_catalog.has_table_privilege(
            role_name, target_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        ) OR pg_catalog.has_any_column_privilege(
            role_name, target_table, 'SELECT, INSERT, UPDATE, REFERENCES'
        ) THEN
            RAISE EXCEPTION 'F016: role % retains coin_balances privileges',
                role_name;
        END IF;
    END LOOP;
    IF pg_catalog.has_table_privilege(
        'service_role', target_table,
        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    ) OR pg_catalog.has_any_column_privilege(
        'service_role', target_table, 'INSERT, UPDATE, REFERENCES'
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = target_table
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND pg_catalog.has_column_privilege(
              'service_role', target_table, attribute.attname, 'SELECT'
          ) <> (attribute.attname = ANY(read_columns))
    ) THEN
        RAISE EXCEPTION 'F016: service_role coin_balances privileges are incorrect';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS target
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(target.relacl, pg_catalog.acldefault('r', target.relowner))
        ) AS privilege
        WHERE target.oid = target_table
          AND privilege.grantee NOT IN (table_owner, service_role_oid)
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(attribute.attacl, '{}'::aclitem[])
        ) AS privilege
        WHERE attribute.attrelid = target_table
          AND attribute.attnum > 0
          AND privilege.grantee NOT IN (table_owner, service_role_oid)
    ) THEN
        RAISE EXCEPTION 'F016: an unexpected role retains coin_balances privileges';
    END IF;
    FOREACH expected_function IN ARRAY ARRAY[
        'public.recalculate_coin_balance(uuid,integer)',
        'public.deduct_balance(uuid,integer,text,text,text)',
        'public.credit_balance(uuid,integer,text,text,text,date)',
        'public.award_streak_milestones(date)'
    ]
    LOOP
        function_oid := expected_function::regprocedure;
        IF NOT (
            SELECT procedure.prosecdef
               AND procedure.proowner = table_owner
               AND procedure.proconfig IS NOT DISTINCT FROM
                   ARRAY['search_path=""']::text[]
            FROM pg_catalog.pg_proc AS procedure
            WHERE procedure.oid = function_oid
        ) OR NOT pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE')
          OR pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
          OR pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE') THEN
            RAISE EXCEPTION 'F016: balance writer postcondition failed: %',
                expected_function;
        END IF;
    END LOOP;
END;
$assertions$;

COMMIT;
