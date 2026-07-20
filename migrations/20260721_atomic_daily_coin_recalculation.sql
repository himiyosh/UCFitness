BEGIN;
SET LOCAL search_path = '';

DO $preconditions$
DECLARE
    transactions_table regclass := pg_catalog.to_regclass('public.coin_transactions');
    balances_table regclass := pg_catalog.to_regclass('public.coin_balances'); users_table regclass := pg_catalog.to_regclass('public.users');
    table_owner oid; service_role_oid oid; actual_columns text[];
    id_default text; created_at_default text; allowed_types text[];
    writer record; writer_oid regprocedure; writer_definition text;
BEGIN
    IF transactions_table IS NULL OR balances_table IS NULL OR users_table IS NULL THEN
        RAISE EXCEPTION 'F016: required coin recalculation table is missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_class
        WHERE oid IN (transactions_table, balances_table, users_table) AND relkind <> 'r'
    ) THEN
        RAISE EXCEPTION 'F016: coin recalculation requires ordinary tables';
    END IF;
    LOCK TABLE public.users, public.coin_transactions, public.coin_balances
        IN ACCESS EXCLUSIVE MODE;

    SELECT pg_catalog.array_agg(pg_catalog.format('%s|%s|%s|%s|%s', attname,
        pg_catalog.format_type(atttypid, atttypmod), attnotnull, atthasdef, attgenerated)
        ORDER BY attname) INTO actual_columns
    FROM pg_catalog.pg_attribute
    WHERE attrelid = transactions_table AND attnum > 0 AND NOT attisdropped;
    IF actual_columns IS DISTINCT FROM ARRAY[
        'amount|integer|t|f|', 'created_at|timestamp with time zone|f|t|',
        'date|date|t|f|', 'description|text|f|f|', 'id|uuid|t|t|',
        'idempotency_key|text|f|f|', 'type|text|t|f|', 'user_id|uuid|t|f|'
    ] THEN
        RAISE EXCEPTION 'F016: public.coin_transactions schema is incompatible';
    END IF;

    SELECT pg_catalog.array_agg(pg_catalog.format('%s|%s|%s|%s|%s', attribute.attname,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
        attribute.attnotnull,
        COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), ''),
        attribute.attgenerated) ORDER BY attribute.attname) INTO actual_columns
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
     AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = balances_table
      AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    IF actual_columns IS DISTINCT FROM ARRAY[
        'best_streak|integer|t|0|', 'current_streak|integer|t|0|',
        'investor_rank|text|t|''BEGINNER''::text|', 'total_balance|bigint|t|0|',
        'total_bonus|bigint|t|0|', 'total_earned|bigint|t|0|',
        'updated_at|timestamp with time zone|t|now()|', 'user_id|uuid|t||'
    ] THEN
        RAISE EXCEPTION 'F016: public.coin_balances schema is incompatible';
    END IF;

    SELECT pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) INTO id_default
    FROM pg_catalog.pg_attrdef AS default_value
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = default_value.adrelid
     AND attribute.attnum = default_value.adnum
    WHERE default_value.adrelid = transactions_table AND attribute.attname = 'id';
    SELECT pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) INTO created_at_default
    FROM pg_catalog.pg_attrdef AS default_value
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = default_value.adrelid
     AND attribute.attnum = default_value.adnum
    WHERE default_value.adrelid = transactions_table
      AND attribute.attname = 'created_at';
    SELECT pg_catalog.array_agg(matches[1] ORDER BY matches[1]) INTO allowed_types
    FROM pg_catalog.pg_constraint AS constraint_record
    CROSS JOIN LATERAL pg_catalog.regexp_matches(
        pg_catalog.pg_get_constraintdef(constraint_record.oid, true),
        '''([A-Z_]+)''', 'g'
    ) AS matches
    WHERE constraint_record.conrelid = transactions_table
      AND constraint_record.conname = 'coin_transactions_type_check'
      AND constraint_record.contype = 'c' AND constraint_record.convalidated;
    IF id_default NOT IN ('gen_random_uuid()', 'uuid_generate_v4()')
       OR created_at_default <> 'now()'
       OR allowed_types IS DISTINCT FROM ARRAY[
            'GIFT_RECEIVE', 'GIFT_SEND', 'GOAL_BONUS', 'LOGIN_BONUS',
            'MISSION_REWARD', 'PURCHASE', 'RANK_BONUS', 'STEPS',
            'STREAK_BONUS', 'STREAK_MILESTONE'
       ]::text[] THEN
        RAISE EXCEPTION 'F016: coin transaction defaults or types are incompatible';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = users_table AND attname = 'id' AND attnum > 0
          AND NOT attisdropped AND attnotnull AND attgenerated = ''
          AND pg_catalog.format_type(atttypid, atttypmod) = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = users_table AND contype = 'p' AND convalidated
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = users_table AND attname = 'id')]::smallint[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = transactions_table AND confrelid = users_table
          AND contype = 'f' AND convalidated
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = transactions_table AND attname = 'user_id')]::smallint[]
          AND confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = users_table AND attname = 'id')]::smallint[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = balances_table AND confrelid = users_table
          AND contype = 'f' AND convalidated
          AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = balances_table AND attname = 'user_id')]::smallint[]
          AND confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
              WHERE attrelid = users_table AND attname = 'id')]::smallint[]
    ) OR (
        SELECT count(*) FROM pg_catalog.pg_constraint
        WHERE contype = 'p' AND convalidated AND (
            (conrelid = transactions_table AND conkey = ARRAY[(SELECT attnum
                FROM pg_catalog.pg_attribute
                WHERE attrelid = transactions_table AND attname = 'id')]::smallint[])
            OR (conrelid = balances_table AND conkey = ARRAY[(SELECT attnum
                FROM pg_catalog.pg_attribute
                WHERE attrelid = balances_table AND attname = 'user_id')]::smallint[])
        )
    ) <> 2 OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_index AS index_record
        JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_record.indexrelid
        WHERE index_record.indrelid = transactions_table
          AND index_class.relname = 'idx_coin_transactions_idempotency'
          AND index_record.indisunique AND index_record.indisvalid
          AND index_record.indisready AND index_record.indpred IS NULL
          AND index_record.indexprs IS NULL AND index_record.indnkeyatts = 1
          AND index_record.indkey::text = (SELECT attnum::text
              FROM pg_catalog.pg_attribute
              WHERE attrelid = transactions_table AND attname = 'idempotency_key')
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = balances_table
          AND conname = 'coin_balances_non_negative_balance'
          AND contype = 'c' AND convalidated
          AND pg_catalog.regexp_replace(
              pg_catalog.pg_get_constraintdef(oid, false), '[[:space:]()]', '', 'g'
          ) = 'CHECKtotal_balance>=0'
    ) THEN
        RAISE EXCEPTION 'F016: coin recalculation constraints are incompatible';
    END IF;

    SELECT relowner INTO table_owner FROM pg_catalog.pg_class WHERE oid = transactions_table;
    SELECT oid INTO service_role_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role' AND rolbypassrls;
    IF pg_catalog.pg_get_userbyid(table_owner) <> 'postgres'
       OR service_role_oid IS NULL
       OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_class
            WHERE oid IN (transactions_table, balances_table)
              AND (relowner <> table_owner OR NOT relrowsecurity OR relforcerowsecurity)
       )
       OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_policy
            WHERE polrelid IN (transactions_table, balances_table)
       )
       OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles AS role
            WHERE role.rolname IN ('anon', 'authenticated')
              AND (
                  pg_catalog.has_table_privilege(role.rolname, transactions_table,
                      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                  OR pg_catalog.has_any_column_privilege(role.rolname, transactions_table,
                      'SELECT, INSERT, UPDATE, REFERENCES')
                  OR pg_catalog.has_table_privilege(role.rolname, balances_table,
                      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                  OR pg_catalog.has_any_column_privilege(role.rolname, balances_table,
                      'SELECT, INSERT, UPDATE, REFERENCES')
              )
       ) THEN
        RAISE EXCEPTION 'F016: coin ownership or RLS contract is unsafe';
    END IF;

    FOR writer IN SELECT * FROM (VALUES
        ('public.recalculate_coin_balance(uuid,integer)',
         'FROM public\.users WHERE id = p_user_id FOR UPDATE'),
        ('public.deduct_balance(uuid,integer,text,text,text)',
         'FROM public\.users WHERE id = p_user_id FOR UPDATE'),
        ('public.credit_balance(uuid,integer,text,text,text,date)',
         'FROM public\.users WHERE id = p_user_id FOR UPDATE'),
        ('public.award_streak_milestones(date)',
         'FROM public\.users WHERE id = v_user_id FOR UPDATE')
    ) AS expected(signature, lock_pattern) LOOP
        writer_oid := pg_catalog.to_regprocedure(writer.signature);
        writer_definition := CASE WHEN writer_oid IS NULL THEN NULL
            ELSE pg_catalog.pg_get_functiondef(writer_oid) END;
        IF writer_oid IS NULL
           OR NOT (SELECT procedure.prosecdef AND procedure.proowner = table_owner
                    AND procedure.proconfig = ARRAY['search_path=""']::text[]
                   FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid = writer_oid)
           OR writer_definition !~ writer.lock_pattern
           OR NOT pg_catalog.has_function_privilege('service_role', writer_oid, 'EXECUTE')
           OR pg_catalog.has_function_privilege('anon', writer_oid, 'EXECUTE')
           OR pg_catalog.has_function_privilege('authenticated', writer_oid, 'EXECUTE') THEN
            RAISE EXCEPTION 'F016: coin writer lock or ACL is unsafe: %', writer.signature;
        END IF;
    END LOOP;
    IF pg_catalog.to_regprocedure(
        'public.apply_daily_coin_recalculation(uuid,date,integer,jsonb)'
    ) IS NOT NULL THEN
        RAISE EXCEPTION 'F016: daily coin recalculation function already exists';
    END IF;
END;
$preconditions$;

CREATE FUNCTION public.apply_daily_coin_recalculation(
    p_user_id uuid, p_date date, p_streak integer, p_transactions jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    total_earned bigint; total_bonus bigint; total_balance bigint;
    best_streak integer; investor_rank text; written_count integer;
BEGIN
    IF p_user_id IS NULL OR p_date IS NULL OR p_streak IS NULL OR p_streak < 0
       OR p_transactions IS NULL
       OR jsonb_typeof(p_transactions) <> 'array'
       OR jsonb_array_length(p_transactions) NOT BETWEEN 1 AND 4 THEN
        RAISE EXCEPTION 'Invalid daily coin recalculation input';
    END IF;
    PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Daily coin recalculation user does not exist'; END IF;
    PERFORM 1 FROM public.coin_balances WHERE user_id = p_user_id FOR UPDATE;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_transactions) AS items(item)
        WHERE jsonb_typeof(item) <> 'object'
           OR NOT item ?& ARRAY['type', 'amount', 'description']
           OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 3
           OR jsonb_typeof(item->'type') <> 'string'
           OR jsonb_typeof(item->'amount') <> 'number'
           OR jsonb_typeof(item->'description') <> 'string'
    ) OR EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_transactions)
            AS input(type text, amount numeric, description text)
        WHERE type <> ALL (ARRAY['STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'RANK_BONUS'])
           OR amount < 0 OR amount <> trunc(amount) OR amount > 2147483647
           OR (type <> 'STEPS' AND amount = 0) OR description = ''
    ) OR EXISTS (
        SELECT type FROM jsonb_to_recordset(p_transactions)
            AS input(type text, amount numeric, description text)
        GROUP BY type HAVING count(*) > 1
    ) OR NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_transactions)
            AS input(type text, amount numeric, description text)
        WHERE type = 'STEPS'
    ) THEN
        RAISE EXCEPTION 'Invalid daily coin transaction shape';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_transactions)
            AS input(type text, amount numeric, description text)
        JOIN public.coin_transactions AS existing
          ON existing.idempotency_key = 'coins:' || p_user_id::text || ':'
             || p_date::text || ':' || input.type
        WHERE existing.user_id <> p_user_id
           OR existing.date <> p_date
           OR existing.type <> input.type
    ) THEN
        RAISE EXCEPTION 'Daily coin idempotency key conflicts with another transaction';
    END IF;

    DELETE FROM public.coin_transactions
    WHERE user_id = p_user_id AND date = p_date
      AND type IN ('STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'RANK_BONUS');
    WITH input AS (
        SELECT type, amount::integer AS amount, description
        FROM jsonb_to_recordset(p_transactions)
            AS record(type text, amount numeric, description text)
    ), written AS (
        INSERT INTO public.coin_transactions (
            user_id, date, type, amount, description, idempotency_key
        )
        SELECT p_user_id, p_date, input.type, input.amount, input.description,
            'coins:' || p_user_id::text || ':' || p_date::text || ':' || input.type
        FROM input
        ON CONFLICT (idempotency_key) DO UPDATE SET
            amount = EXCLUDED.amount, description = EXCLUDED.description
        WHERE coin_transactions.user_id = p_user_id
          AND coin_transactions.date = p_date
          AND coin_transactions.type = EXCLUDED.type
        RETURNING 1
    )
    SELECT count(*) INTO written_count FROM written;
    IF written_count <> jsonb_array_length(p_transactions) THEN
        RAISE EXCEPTION 'Daily coin transaction upsert was rejected';
    END IF;

    SELECT
        COALESCE(sum(amount) FILTER (WHERE type = 'STEPS'), 0),
        COALESCE(sum(amount) FILTER (WHERE type <> 'STEPS' AND amount > 0), 0),
        COALESCE(sum(amount), 0)
    INTO total_earned, total_bonus, total_balance
    FROM public.coin_transactions WHERE user_id = p_user_id;
    IF total_earned < 0 OR total_bonus < 0 OR total_balance < 0
       OR total_earned > 9007199254740991 OR total_bonus > 9007199254740991
       OR total_balance > 9007199254740991 THEN
        RAISE EXCEPTION 'Daily coin recalculation exceeds the safe integer range';
    END IF;

    SELECT GREATEST(p_streak, COALESCE(current.best_streak, 0)) INTO best_streak
    FROM public.coin_balances AS current
    WHERE current.user_id = p_user_id;
    best_streak := COALESCE(best_streak, p_streak);
    investor_rank := CASE
        WHEN total_earned + total_bonus >= 5000000 THEN 'TYCOON'
        WHEN total_earned + total_bonus >= 1000000 THEN 'DIAMOND'
        WHEN total_earned + total_bonus >= 500000 THEN 'FUND_MANAGER'
        WHEN total_earned + total_bonus >= 100000 THEN 'BUSINESS'
        ELSE 'BEGINNER'
    END;
    INSERT INTO public.coin_balances (
        user_id, total_balance, total_earned, total_bonus,
        current_streak, best_streak, investor_rank, updated_at
    ) VALUES (
        p_user_id, total_balance, total_earned, total_bonus,
        p_streak, best_streak, investor_rank, now()
    ) ON CONFLICT (user_id) DO UPDATE SET
        total_balance = EXCLUDED.total_balance, total_earned = EXCLUDED.total_earned,
        total_bonus = EXCLUDED.total_bonus, current_streak = EXCLUDED.current_streak,
        best_streak = EXCLUDED.best_streak, investor_rank = EXCLUDED.investor_rank,
        updated_at = EXCLUDED.updated_at;
    RETURN pg_catalog.jsonb_build_object('success', true);
END;
$function$;

ALTER FUNCTION public.apply_daily_coin_recalculation(uuid, date, integer, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.apply_daily_coin_recalculation(uuid, date, integer, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_daily_coin_recalculation(uuid, date, integer, jsonb) TO service_role;
REVOKE UPDATE (user_id, date, type, amount, description, idempotency_key)
    ON TABLE public.coin_transactions FROM service_role;

DO $postconditions$
DECLARE
    function_oid regprocedure :=
        'public.apply_daily_coin_recalculation(uuid,date,integer,jsonb)'::regprocedure;
BEGIN
    IF NOT (
        SELECT procedure.prosecdef
           AND pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
           AND procedure.proconfig = ARRAY['search_path=""']::text[]
        FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid = function_oid
    )
       OR NOT pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
       OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_proc AS procedure
            CROSS JOIN LATERAL pg_catalog.aclexplode(
                COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
            ) AS privilege
            WHERE procedure.oid = function_oid
              AND privilege.grantee NOT IN (
                  procedure.proowner,
                  (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
              )
       )
       OR pg_catalog.has_any_column_privilege(
            'service_role', 'public.coin_transactions', 'UPDATE'
       ) THEN
        RAISE EXCEPTION 'F016: daily coin recalculation postcondition failed';
    END IF;
END;
$postconditions$;
COMMIT;
