BEGIN; SET LOCAL search_path = '';
DO $preconditions$
DECLARE
    transactions_table regclass := pg_catalog.to_regclass('public.coin_transactions');
    balances_table regclass := pg_catalog.to_regclass('public.coin_balances');
    users_table regclass := pg_catalog.to_regclass('public.users');
    table_owner oid; service_role_oid oid; actual_columns text[];
    id_default text; created_at_default text; user_id_default text;
    type_definition text; allowed_types text[];
    writer record; writer_oid regprocedure; writer_definition text;
BEGIN
    IF transactions_table IS NULL OR balances_table IS NULL OR users_table IS NULL THEN
        RAISE EXCEPTION 'F016: required coin backfill table is missing';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class
        WHERE oid IN (transactions_table, balances_table, users_table) AND relkind <> 'r') THEN
        RAISE EXCEPTION 'F016: coin backfill requires ordinary tables';
    END IF;
    LOCK TABLE public.users, public.coin_transactions, public.coin_balances IN ACCESS EXCLUSIVE MODE;
    SELECT pg_catalog.array_agg(pg_catalog.format('%s|%s|%s|%s|%s', attname,
        pg_catalog.format_type(atttypid, atttypmod), attnotnull, atthasdef, attgenerated)
        ORDER BY attname) INTO actual_columns FROM pg_catalog.pg_attribute
    WHERE attrelid = transactions_table AND attnum > 0 AND NOT attisdropped;
    IF actual_columns IS DISTINCT FROM ARRAY[
        'amount|integer|t|f|', 'created_at|timestamp with time zone|f|t|', 'date|date|t|f|',
        'description|text|f|f|', 'id|uuid|t|t|', 'idempotency_key|text|f|f|',
        'type|text|t|f|', 'user_id|uuid|t|f|'
    ] THEN RAISE EXCEPTION 'F016: public.coin_transactions schema is incompatible'; END IF;
    SELECT pg_catalog.array_agg(pg_catalog.format('%s|%s|%s|%s|%s', attribute.attname,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull,
        COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), ''),
        attribute.attgenerated) ORDER BY attribute.attname) INTO actual_columns
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS default_value ON default_value.adrelid = attribute.attrelid
        AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = balances_table AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    IF actual_columns IS DISTINCT FROM ARRAY[
        'best_streak|integer|t|0|', 'current_streak|integer|t|0|',
        'investor_rank|text|t|''BEGINNER''::text|', 'total_balance|bigint|t|0|',
        'total_bonus|bigint|t|0|', 'total_earned|bigint|t|0|',
        'updated_at|timestamp with time zone|t|now()|', 'user_id|uuid|t||'
    ] THEN RAISE EXCEPTION 'F016: public.coin_balances schema is incompatible'; END IF;
    SELECT pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) INTO user_id_default
    FROM pg_catalog.pg_attrdef AS default_value JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = default_value.adrelid AND attribute.attnum = default_value.adnum
    WHERE default_value.adrelid = users_table AND attribute.attname = 'id';
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = users_table
        AND attname = 'id' AND attnum > 0 AND NOT attisdropped AND attnotnull
        AND attgenerated = '' AND pg_catalog.format_type(atttypid, atttypmod) = 'uuid')
       OR user_id_default IS NULL
       OR user_id_default NOT IN ('gen_random_uuid()', 'uuid_generate_v4()') THEN
        RAISE EXCEPTION 'F016: public.users id schema is incompatible';
    END IF;
    SELECT pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) INTO id_default
    FROM pg_catalog.pg_attrdef AS default_value JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = default_value.adrelid AND attribute.attnum = default_value.adnum
    WHERE default_value.adrelid = transactions_table AND attribute.attname = 'id';
    SELECT pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) INTO created_at_default
    FROM pg_catalog.pg_attrdef AS default_value JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = default_value.adrelid AND attribute.attnum = default_value.adnum
    WHERE default_value.adrelid = transactions_table AND attribute.attname = 'created_at';
    SELECT pg_catalog.pg_get_expr(conbin, conrelid, true) INTO type_definition
    FROM pg_catalog.pg_constraint WHERE conrelid = transactions_table
      AND conname = 'coin_transactions_type_check' AND contype = 'c' AND convalidated;
    SELECT pg_catalog.array_agg(matches[1] ORDER BY matches[1]) INTO allowed_types
    FROM pg_catalog.regexp_matches(type_definition, '''([A-Z_]+)''', 'g') AS matches;
    IF id_default IS NULL OR id_default NOT IN ('gen_random_uuid()', 'uuid_generate_v4()')
       OR created_at_default IS DISTINCT FROM 'now()'
       OR allowed_types IS DISTINCT FROM ARRAY[
        'GIFT_RECEIVE', 'GIFT_SEND', 'GOAL_BONUS', 'LOGIN_BONUS', 'MISSION_REWARD',
        'PURCHASE', 'RANK_BONUS', 'STEPS', 'STREAK_BONUS', 'STREAK_MILESTONE'
       ]::text[]
       OR pg_catalog.regexp_replace(pg_catalog.regexp_replace(
            type_definition, '::text', '', 'g'), '[[:space:]()]', '', 'g')
            IS DISTINCT FROM 'type=ANYARRAY[''STEPS'',''GOAL_BONUS'',''STREAK_BONUS'',''STREAK_MILESTONE'',''RANK_BONUS'',''LOGIN_BONUS'',''MISSION_REWARD'',''PURCHASE'',''GIFT_SEND'',''GIFT_RECEIVE'']' THEN
        RAISE EXCEPTION 'F016: coin transaction defaults or types are incompatible';
    END IF;
    IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE contype = 'p' AND convalidated AND (
        (conrelid = users_table AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = users_table AND attname = 'id')]::smallint[])
        OR (conrelid = transactions_table AND conkey = ARRAY[(SELECT attnum
            FROM pg_catalog.pg_attribute WHERE attrelid = transactions_table
            AND attname = 'id')]::smallint[])
        OR (conrelid = balances_table AND conkey = ARRAY[(SELECT attnum
            FROM pg_catalog.pg_attribute WHERE attrelid = balances_table
            AND attname = 'user_id')]::smallint[]))) <> 3
       OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE contype = 'f' AND convalidated
        AND confrelid = users_table AND confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = users_table AND attname = 'id')]::smallint[] AND (
            (conrelid = transactions_table AND conkey = ARRAY[(SELECT attnum
                FROM pg_catalog.pg_attribute WHERE attrelid = transactions_table
                AND attname = 'user_id')]::smallint[])
            OR (conrelid = balances_table AND conkey = ARRAY[(SELECT attnum
                FROM pg_catalog.pg_attribute WHERE attrelid = balances_table
                AND attname = 'user_id')]::smallint[]))) <> 2
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index AS index_record
        JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_record.indexrelid
        WHERE index_record.indrelid = transactions_table
          AND index_class.relname = 'idx_coin_transactions_idempotency'
          AND index_record.indisunique AND index_record.indisvalid AND index_record.indisready
          AND index_record.indpred IS NULL AND index_record.indexprs IS NULL
          AND index_record.indnkeyatts = 1 AND index_record.indkey::text = (SELECT attnum::text
            FROM pg_catalog.pg_attribute WHERE attrelid = transactions_table
            AND attname = 'idempotency_key'))
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = balances_table
        AND conname = 'coin_balances_non_negative_balance' AND contype = 'c' AND convalidated
        AND pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(oid, false),
            '[[:space:]()]', '', 'g') = 'CHECKtotal_balance>=0') THEN
        RAISE EXCEPTION 'F016: coin backfill constraints are incompatible';
    END IF;
    SELECT relowner INTO table_owner FROM pg_catalog.pg_class WHERE oid = transactions_table;
    SELECT oid INTO service_role_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role' AND rolbypassrls;
    IF pg_catalog.pg_get_userbyid(table_owner) <> 'postgres' OR service_role_oid IS NULL
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class
        WHERE oid IN (transactions_table, balances_table, users_table)
          AND (relowner <> table_owner OR NOT relrowsecurity OR relforcerowsecurity))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy
        WHERE polrelid IN (transactions_table, balances_table))
       OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid = users_table) <> 1
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = users_table
        AND polname = 'Allow public read users' AND polcmd = 'r' AND polpermissive
        AND polroles = ARRAY[0::oid]
        AND pg_catalog.pg_get_expr(polqual, polrelid, true) = 'true' AND polwithcheck IS NULL)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS role
        WHERE role.rolname IN ('anon', 'authenticated') AND (
            pg_catalog.has_table_privilege(role.rolname, transactions_table,
                'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR pg_catalog.has_any_column_privilege(role.rolname, transactions_table,
                'SELECT, INSERT, UPDATE, REFERENCES')
            OR pg_catalog.has_table_privilege(role.rolname, balances_table,
                'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR pg_catalog.has_any_column_privilege(role.rolname, balances_table,
                'SELECT, INSERT, UPDATE, REFERENCES')
            OR pg_catalog.has_table_privilege(role.rolname, users_table,
                'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR pg_catalog.has_any_column_privilege(role.rolname, users_table,
                'INSERT, UPDATE, REFERENCES')))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) AS privilege
        WHERE relation.oid IN (transactions_table, balances_table)
          AND privilege.grantee NOT IN (table_owner, service_role_oid))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(attribute.attacl, ARRAY[]::aclitem[])) AS privilege
        WHERE attribute.attrelid IN (transactions_table, balances_table)
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
          AND privilege.grantee NOT IN (table_owner, service_role_oid)) THEN
        RAISE EXCEPTION 'F016: coin backfill ownership, RLS, or ACL is unsafe';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS role
        CROSS JOIN pg_catalog.pg_attribute AS attribute
        WHERE role.rolname IN ('anon', 'authenticated') AND attribute.attrelid = users_table
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
          AND pg_catalog.has_column_privilege(
            role.rolname, users_table, attribute.attname, 'SELECT'
          ) IS DISTINCT FROM (attribute.attname = ANY (ARRAY[
            'id', 'name', 'email', 'image', 'username', 'group_keyword',
            'step_goal', 'created_at', 'updated_at'
          ]))) OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) AS privilege
        WHERE relation.oid = users_table AND privilege.grantee NOT IN (
            table_owner, service_role_oid,
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        )) OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(attribute.attacl, ARRAY[]::aclitem[])) AS privilege
        WHERE attribute.attrelid = users_table AND attribute.attnum > 0
          AND NOT attribute.attisdropped AND privilege.grantee NOT IN (
            table_owner, service_role_oid,
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        )) THEN RAISE EXCEPTION 'F016: public.users ACL is incompatible'; END IF;
    IF NOT pg_catalog.has_table_privilege('service_role', transactions_table, 'DELETE')
       OR pg_catalog.has_table_privilege('service_role', transactions_table,
            'SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER')
       OR pg_catalog.has_any_column_privilege('service_role', transactions_table,
            'UPDATE, REFERENCES')
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY[
            'id', 'user_id', 'date', 'type', 'amount', 'description', 'idempotency_key', 'created_at'
        ]) AS column_name WHERE NOT pg_catalog.has_column_privilege(
            'service_role', transactions_table, column_name, 'SELECT'))
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY[
            'user_id', 'date', 'type', 'amount', 'description', 'idempotency_key'
        ]) AS column_name WHERE NOT pg_catalog.has_column_privilege(
            'service_role', transactions_table, column_name, 'INSERT'))
       OR pg_catalog.has_column_privilege('service_role', transactions_table, 'id', 'INSERT')
       OR pg_catalog.has_column_privilege('service_role', transactions_table, 'created_at', 'INSERT')
       OR pg_catalog.has_table_privilege('service_role', balances_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       OR pg_catalog.has_any_column_privilege('service_role', balances_table,
            'INSERT, UPDATE, REFERENCES')
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY[
            'user_id', 'total_balance', 'total_earned', 'total_bonus',
            'current_streak', 'best_streak', 'investor_rank'
        ]) AS column_name WHERE NOT pg_catalog.has_column_privilege(
            'service_role', balances_table, column_name, 'SELECT'))
       OR pg_catalog.has_column_privilege('service_role', balances_table, 'updated_at', 'SELECT') THEN
        RAISE EXCEPTION 'F016: service_role coin table ACL is incompatible';
    END IF;
    FOR writer IN SELECT * FROM (VALUES
        ('public.recalculate_coin_balance(uuid,integer)', 'FROM public\.users WHERE id = p_user_id FOR UPDATE'),
        ('public.deduct_balance(uuid,integer,text,text,text)', 'FROM public\.users WHERE id = p_user_id FOR UPDATE'),
        ('public.credit_balance(uuid,integer,text,text,text,date)', 'FROM public\.users WHERE id = p_user_id FOR UPDATE'),
        ('public.award_streak_milestones(date)', 'FROM public\.users WHERE id = v_user_id FOR UPDATE'),
        ('public.apply_daily_coin_recalculation(uuid,date,integer,jsonb)', 'FROM public\.users WHERE id = p_user_id FOR UPDATE')
    ) AS expected(signature, lock_pattern) LOOP
        writer_oid := pg_catalog.to_regprocedure(writer.signature);
        writer_definition := CASE WHEN writer_oid IS NULL THEN NULL
            ELSE pg_catalog.pg_get_functiondef(writer_oid) END;
        IF writer_oid IS NULL OR (SELECT procedure.prosecdef
            AND procedure.proowner = table_owner
            AND procedure.proconfig = ARRAY['search_path=""']::text[]
            FROM pg_catalog.pg_proc AS procedure
            WHERE procedure.oid = writer_oid) IS DISTINCT FROM TRUE
           OR writer_definition !~ writer.lock_pattern
           OR NOT pg_catalog.has_function_privilege('service_role', writer_oid, 'EXECUTE')
           OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS procedure
            CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
                procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) AS privilege
            WHERE procedure.oid = writer_oid
              AND privilege.grantee NOT IN (procedure.proowner, service_role_oid)) THEN
            RAISE EXCEPTION 'F016: coin writer lock or ACL is unsafe: %', writer.signature;
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public' AND procedure.proname = 'apply_coin_backfill') THEN
        RAISE EXCEPTION 'F016: coin backfill function already exists';
    END IF;
END;
$preconditions$;
CREATE FUNCTION public.apply_coin_backfill(
    p_user_id uuid, p_current_streak integer, p_transactions jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    total_earned bigint; total_bonus bigint; total_balance bigint;
    best_streak integer; investor_rank text; written_count integer;
BEGIN
    IF p_user_id IS NULL OR p_current_streak IS NULL OR p_current_streak < 0
       OR p_transactions IS NULL OR pg_catalog.jsonb_typeof(p_transactions) <> 'array'
       OR pg_catalog.jsonb_array_length(p_transactions) NOT BETWEEN 1 AND 50000 THEN
        RAISE EXCEPTION 'Invalid coin backfill input';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_transactions) AS items(item)
        WHERE pg_catalog.jsonb_typeof(item) <> 'object'
          OR NOT item ?& ARRAY['date', 'type', 'amount', 'description']
          OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(item)) <> 4
          OR pg_catalog.jsonb_typeof(item->'date') <> 'string'
          OR pg_catalog.jsonb_typeof(item->'type') <> 'string'
          OR pg_catalog.jsonb_typeof(item->'amount') <> 'number'
          OR pg_catalog.jsonb_typeof(item->'description') <> 'string') THEN
        RAISE EXCEPTION 'Invalid coin backfill transaction shape';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_transactions)
        AS input(date text, type text, amount numeric, description text)
        WHERE CASE WHEN date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN true
            ELSE pg_catalog.to_char(pg_catalog.to_date(date, 'FXYYYY-MM-DD'), 'YYYY-MM-DD') <> date
              OR pg_catalog.to_date(date, 'FXYYYY-MM-DD')
                > (now() AT TIME ZONE 'Asia/Tokyo')::date END
          OR type <> ALL (ARRAY['STEPS', 'GOAL_BONUS', 'STREAK_BONUS'])
          OR amount < 0 OR amount <> pg_catalog.trunc(amount) OR amount > 2147483647
          OR (type <> 'STEPS' AND amount = 0) OR pg_catalog.btrim(description) = '')
       OR EXISTS (SELECT date, type FROM pg_catalog.jsonb_to_recordset(p_transactions)
        AS input(date text, type text, amount numeric, description text)
        GROUP BY date, type HAVING count(*) > 1)
       OR EXISTS (SELECT date FROM pg_catalog.jsonb_to_recordset(p_transactions)
        AS input(date text, type text, amount numeric, description text)
        GROUP BY date HAVING count(*) FILTER (WHERE type = 'STEPS') <> 1) THEN
        RAISE EXCEPTION 'Invalid coin backfill transaction values';
    END IF;
    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Coin backfill user does not exist'; END IF;
    LOCK TABLE public.coin_transactions IN SHARE ROW EXCLUSIVE MODE NOWAIT;
    PERFORM 1 FROM public.coin_balances WHERE user_id = p_user_id FOR UPDATE;
    IF EXISTS (SELECT date FROM public.coin_transactions WHERE user_id = p_user_id
        AND type IN ('STEPS', 'GOAL_BONUS', 'STREAK_BONUS') GROUP BY date
        HAVING count(*) FILTER (WHERE type = 'STEPS') <> 1
          OR count(*) <> count(DISTINCT type) OR min(amount) < 0
          OR pg_catalog.bool_or(type <> 'STEPS' AND amount = 0)) THEN
        RAISE EXCEPTION 'Existing coin backfill ledger is inconsistent';
    END IF;
    IF EXISTS (
        WITH existing_totals AS (
            SELECT date, COALESCE(sum(amount) FILTER (WHERE type = 'STEPS'), 0) AS steps,
                COALESCE(sum(amount) FILTER (WHERE type = 'GOAL_BONUS'), 0) AS goal_bonus,
                COALESCE(sum(amount) FILTER (WHERE type = 'STREAK_BONUS'), 0) AS streak_bonus,
                pg_catalog.bool_or(type = 'STEPS') AS has_steps
            FROM public.coin_transactions WHERE user_id = p_user_id
              AND type IN ('STEPS', 'GOAL_BONUS', 'STREAK_BONUS') GROUP BY date
        ), incoming_totals AS (
            SELECT pg_catalog.to_date(date, 'FXYYYY-MM-DD') AS date,
                COALESCE(sum(amount::bigint) FILTER (WHERE type = 'STEPS'), 0) AS steps,
                COALESCE(sum(amount::bigint) FILTER (WHERE type = 'GOAL_BONUS'), 0) AS goal_bonus,
                COALESCE(sum(amount::bigint) FILTER (WHERE type = 'STREAK_BONUS'), 0) AS streak_bonus,
                pg_catalog.bool_or(type = 'STEPS') AS has_steps
            FROM pg_catalog.jsonb_to_recordset(p_transactions)
                AS input(date text, type text, amount numeric, description text)
            GROUP BY pg_catalog.to_date(date, 'FXYYYY-MM-DD')
        )
        SELECT 1 FROM existing_totals AS existing FULL JOIN incoming_totals AS incoming USING (date)
        WHERE existing.has_steps IS TRUE AND (incoming.has_steps IS DISTINCT FROM TRUE
          OR incoming.steps < existing.steps OR (incoming.steps = existing.steps
            AND (incoming.goal_bonus < existing.goal_bonus
              OR incoming.streak_bonus < existing.streak_bonus)))
    ) THEN RAISE EXCEPTION 'Stale coin backfill cannot reduce earned coins'; END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_transactions)
        AS input(date text, type text, amount numeric, description text)
        JOIN public.coin_transactions AS existing
          ON existing.idempotency_key = 'coins:' || p_user_id::text || ':'
            || input.date || ':' || input.type
        WHERE existing.user_id <> p_user_id
          OR existing.date <> pg_catalog.to_date(input.date, 'FXYYYY-MM-DD')
          OR existing.type <> input.type) THEN
        RAISE EXCEPTION 'Coin backfill idempotency key conflicts with another transaction';
    END IF;
    DELETE FROM public.coin_transactions WHERE user_id = p_user_id
      AND type IN ('STEPS', 'GOAL_BONUS', 'STREAK_BONUS');
    INSERT INTO public.coin_transactions (user_id, date, type, amount, description, idempotency_key)
    SELECT p_user_id, pg_catalog.to_date(input.date, 'FXYYYY-MM-DD'), input.type,
        input.amount::integer, input.description,
        'coins:' || p_user_id::text || ':' || input.date || ':' || input.type
    FROM pg_catalog.jsonb_to_recordset(p_transactions)
        AS input(date text, type text, amount numeric, description text);
    GET DIAGNOSTICS written_count = ROW_COUNT;
    IF written_count <> pg_catalog.jsonb_array_length(p_transactions) THEN
        RAISE EXCEPTION 'Coin backfill insert count mismatch';
    END IF;
    SELECT COALESCE(sum(amount) FILTER (WHERE type = 'STEPS'), 0),
        COALESCE(sum(amount) FILTER (WHERE type <> 'STEPS' AND amount > 0), 0),
        COALESCE(sum(amount), 0) INTO total_earned, total_bonus, total_balance
    FROM public.coin_transactions WHERE user_id = p_user_id;
    IF total_earned < 0 OR total_bonus < 0 OR total_balance < 0
       OR total_earned > 9007199254740991 OR total_bonus > 9007199254740991
       OR total_balance > 9007199254740991 THEN
        RAISE EXCEPTION 'Coin backfill exceeds the safe integer range';
    END IF;
    SELECT GREATEST(p_current_streak, COALESCE(current.best_streak, 0)) INTO best_streak
    FROM public.coin_balances AS current WHERE current.user_id = p_user_id;
    best_streak := COALESCE(best_streak, p_current_streak);
    investor_rank := CASE
        WHEN total_earned + total_bonus >= 5000000 THEN 'TYCOON'
        WHEN total_earned + total_bonus >= 1000000 THEN 'DIAMOND'
        WHEN total_earned + total_bonus >= 500000 THEN 'FUND_MANAGER'
        WHEN total_earned + total_bonus >= 100000 THEN 'BUSINESS'
        ELSE 'BEGINNER' END;
    INSERT INTO public.coin_balances (user_id, total_balance, total_earned, total_bonus,
        current_streak, best_streak, investor_rank, updated_at)
    VALUES (p_user_id, total_balance, total_earned, total_bonus, p_current_streak,
        best_streak, investor_rank, now()) ON CONFLICT (user_id) DO UPDATE SET
        total_balance = EXCLUDED.total_balance, total_earned = EXCLUDED.total_earned,
        total_bonus = EXCLUDED.total_bonus, current_streak = EXCLUDED.current_streak,
        best_streak = EXCLUDED.best_streak, investor_rank = EXCLUDED.investor_rank,
        updated_at = EXCLUDED.updated_at;
    RETURN pg_catalog.jsonb_build_object('success', true);
END;
$function$;
ALTER FUNCTION public.apply_coin_backfill(uuid, integer, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.apply_coin_backfill(uuid, integer, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_coin_backfill(uuid, integer, jsonb) TO service_role;
DO $postconditions$
DECLARE function_oid regprocedure := 'public.apply_coin_backfill(uuid,integer,jsonb)'::regprocedure;
BEGIN
    IF (SELECT procedure.prosecdef
        AND pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
        AND procedure.proconfig = ARRAY['search_path=""']::text[]
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid = function_oid) IS DISTINCT FROM TRUE
       OR NOT pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE')
       OR (SELECT count(*) FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public' AND procedure.proname = 'apply_coin_backfill') <> 1
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
            procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) AS privilege
        WHERE procedure.oid = function_oid AND privilege.grantee NOT IN (
            procedure.proowner,
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role'))) THEN
        RAISE EXCEPTION 'F016: coin backfill postcondition failed';
    END IF;
END;
$postconditions$;
COMMIT;
