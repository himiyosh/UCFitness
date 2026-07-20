BEGIN;
SET LOCAL search_path = '';
DO $preconditions$
DECLARE
  target CONSTANT regclass := pg_catalog.to_regclass('public.user_badges');
  users_table CONSTANT regclass := pg_catalog.to_regclass('public.users');
  badges_table CONSTANT regclass := pg_catalog.to_regclass('public.badges');
  groups_table CONSTANT regclass := pg_catalog.to_regclass('public.groups');
  award_function CONSTANT regprocedure :=
    pg_catalog.to_regprocedure('public.award_streak_milestones(date)');
  owner_oid oid;
  owner_name name;
  owner_bypass boolean;
  service_oid oid;
  service_bypass boolean;
  column_contract text[];
  default_contract text[];
BEGIN
  IF target IS NULL
     OR users_table IS NULL
     OR badges_table IS NULL
     OR groups_table IS NULL
     OR award_function IS NULL THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: required catalog objects are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = target AND relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: target must be an ordinary table';
  END IF;
  LOCK TABLE public.user_badges IN ACCESS EXCLUSIVE MODE;
  SELECT c.relowner, role.rolname, role.rolbypassrls
  INTO owner_oid, owner_name, owner_bypass
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_roles AS role ON role.oid = c.relowner
  WHERE c.oid = target;
  SELECT oid, rolbypassrls INTO service_oid, service_bypass
  FROM pg_catalog.pg_roles
  WHERE rolname = 'service_role';
  IF owner_name IS DISTINCT FROM 'postgres'
     OR owner_bypass IS DISTINCT FROM true
     OR service_oid IS NULL
     OR service_bypass IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: unsafe owner or service_role';
  END IF;
  SELECT pg_catalog.array_agg(
    pg_catalog.format(
      '%s:%s:%s:%s:%s',
      attname,
      pg_catalog.format_type(atttypid, atttypmod),
      attnotnull,
      atthasdef,
      attgenerated
    )
    ORDER BY attnum
  )
  INTO column_contract
  FROM pg_catalog.pg_attribute
  WHERE attrelid = target
    AND attnum > 0
    AND NOT attisdropped;
  IF column_contract IS DISTINCT FROM ARRAY[
    'id:uuid:t:t:', 'user_id:uuid:t:f:', 'badge_code:text:t:f:',
    'awarded_at:timestamp with time zone:t:t:', 'period_date:date:t:f:',
    'group_id:uuid:f:f:', 'created_at:timestamp with time zone:t:t:'
  ] THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: column contract mismatch';
  END IF;
  SELECT pg_catalog.array_agg(
    pg_catalog.format(
      '%s:%s',
      attribute.attname,
      pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)
    )
    ORDER BY attribute.attnum
  )
  INTO default_contract
  FROM pg_catalog.pg_attribute AS attribute
  JOIN pg_catalog.pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  WHERE attribute.attrelid = target
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;
  IF default_contract NOT IN (
    ARRAY['id:gen_random_uuid()',
      'awarded_at:timezone(''utc''::text, now())',
      'created_at:timezone(''utc''::text, now())'],
    ARRAY['id:public.uuid_generate_v4()',
      'awarded_at:timezone(''utc''::text, now())',
      'created_at:timezone(''utc''::text, now())'],
    ARRAY['id:extensions.uuid_generate_v4()',
      'awarded_at:timezone(''utc''::text, now())',
      'created_at:timezone(''utc''::text, now())']
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: default contract mismatch';
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = target
      AND contype IN ('p', 'u', 'f')
  ) <> 5 OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = target
      AND contype = 'p'
      AND convalidated
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = target AND attname = 'id')
      ]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = target
      AND contype = 'u'
      AND convalidated
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = target AND attname = 'user_id'),
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = target AND attname = 'badge_code'),
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = target AND attname = 'period_date')
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: primary or unique key mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = target
      AND contype = 'f'
      AND confrelid = users_table
      AND convalidated
      AND confdeltype = 'c'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = target AND attname = 'user_id')
      ]::smallint[]
      AND confkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = users_table AND attname = 'id')
      ]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = target
      AND contype = 'f'
      AND confrelid = badges_table
      AND convalidated
      AND confdeltype = 'c'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = target AND attname = 'badge_code')
      ]::smallint[]
      AND confkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = badges_table AND attname = 'code')
      ]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = target
      AND contype = 'f'
      AND confrelid = groups_table
      AND convalidated
      AND confdeltype = 'c'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = target AND attname = 'group_id')
      ]::smallint[]
      AND confkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = groups_table AND attname = 'id')
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: foreign key contract mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS sequence
    JOIN pg_catalog.pg_depend AS dependency
      ON dependency.objid = sequence.oid
     AND dependency.deptype IN ('a', 'i')
    WHERE sequence.relkind = 'S'
      AND dependency.refobjid = target
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: unexpected owned sequence';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = target AND (relrowsecurity OR relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: unexpected RLS state or policy';
  END IF;
  -- Phase 4 establishes this owner-executed boundary before Phase 5 enables RLS.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_roles AS role ON role.oid = proc.proowner
    JOIN pg_catalog.pg_language AS language ON language.oid = proc.prolang
    WHERE proc.oid = award_function
      AND proc.proowner = owner_oid
      AND proc.prosecdef
      AND role.rolbypassrls
      AND language.lanname = 'plpgsql'
      AND proc.proconfig = ARRAY['search_path=""']
      AND pg_catalog.has_function_privilege(
        'service_role', proc.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege('anon', proc.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', proc.oid, 'EXECUTE'
      )
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening aborted: atomic RPC is not owner-safe';
  END IF;
END
$preconditions$;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.user_badges FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.user_badges FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.user_badges FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.user_badges FROM service_role;
DO $revoke_columns$
DECLARE
  column_name name;
BEGIN
  FOR column_name IN
    SELECT attname
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.user_badges'::regclass
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.user_badges FROM PUBLIC, anon, authenticated, service_role',
      column_name
    );
  END LOOP;
END
$revoke_columns$;
GRANT SELECT (id, user_id, badge_code, awarded_at, period_date, group_id,
  created_at) ON TABLE public.user_badges TO service_role;
GRANT INSERT (user_id, badge_code, awarded_at, period_date, group_id)
  ON TABLE public.user_badges TO service_role;
GRANT UPDATE (user_id, badge_code, period_date)
  ON TABLE public.user_badges TO service_role;
DO $postconditions$
DECLARE
  target CONSTANT regclass := 'public.user_badges'::regclass;
  owner_oid oid;
  service_oid oid;
  column_name name;
  expected_insert boolean;
  expected_update boolean;
BEGIN
  SELECT relowner INTO owner_oid
  FROM pg_catalog.pg_class
  WHERE oid = target;
  SELECT oid INTO service_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'service_role';
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = target
      AND relrowsecurity
      AND NOT relforcerowsecurity
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening failed: RLS is not default-deny';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      VALUES ('service_role'), ('anon'), ('authenticated')
    ) AS role_name(name)
    CROSS JOIN (
      VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
        ('REFERENCES'), ('TRIGGER')
    ) AS privilege_name(name)
    WHERE pg_catalog.has_table_privilege(
      role_name.name, target, privilege_name.name
    )
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening failed: unexpected table privilege';
  END IF;
  FOR column_name IN
    SELECT attname
    FROM pg_catalog.pg_attribute
    WHERE attrelid = target
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    expected_insert := column_name IN (
      'user_id', 'badge_code', 'awarded_at', 'period_date', 'group_id'
    );
    expected_update := column_name IN (
      'user_id', 'badge_code', 'period_date'
    );
    IF NOT pg_catalog.has_column_privilege(
         'service_role', target, column_name, 'SELECT'
       )
       OR pg_catalog.has_column_privilege(
         'service_role', target, column_name, 'INSERT'
       ) IS DISTINCT FROM expected_insert
       OR pg_catalog.has_column_privilege(
         'service_role', target, column_name, 'UPDATE'
       ) IS DISTINCT FROM expected_update THEN
      RAISE EXCEPTION
        'F016 user_badges hardening failed: column ACL mismatch for %',
        column_name;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      pg_catalog.coalesce(
        class.relacl,
        pg_catalog.acldefault('r', class.relowner)
      )
    ) AS acl
    WHERE class.oid = target
      AND acl.grantee NOT IN (owner_oid, service_oid)
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      pg_catalog.coalesce(attribute.attacl, '{}'::aclitem[])
    ) AS acl
    WHERE attribute.attrelid = target
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND acl.grantee NOT IN (owner_oid, service_oid)
  ) THEN
    RAISE EXCEPTION
      'F016 user_badges hardening failed: unexpected ACL grantee';
  END IF;
END
$postconditions$;
COMMIT;
