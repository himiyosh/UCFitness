BEGIN;
SET LOCAL search_path = '';

DO $preconditions$
DECLARE
  target CONSTANT regclass := pg_catalog.to_regclass('public.badges');
  user_badges_table CONSTANT regclass :=
    pg_catalog.to_regclass('public.user_badges');
  owner_oid oid;
  owner_name name;
  owner_bypass boolean;
  service_oid oid;
  service_bypass boolean;
  column_contract text[];
  default_contract text[];
BEGIN
  IF target IS NULL OR user_badges_table IS NULL THEN
    RAISE EXCEPTION
      'F016 badges hardening aborted: required catalog objects are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = target AND relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'F016 badges hardening aborted: target must be an ordinary table';
  END IF;

  LOCK TABLE public.badges IN ACCESS EXCLUSIVE MODE;

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
      'F016 badges hardening aborted: unsafe owner or service_role';
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
    'id:uuid:t:t:', 'code:text:t:f:', 'name:text:t:f:',
    'description:text:f:f:', 'category:text:t:f:', 'type:text:t:f:',
    'rank:integer:t:f:', 'image_url:text:f:f:',
    'created_at:timestamp with time zone:t:t:'
  ] THEN
    RAISE EXCEPTION
      'F016 badges hardening aborted: column contract mismatch';
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
      'created_at:timezone(''utc''::text, now())'],
    ARRAY['id:public.uuid_generate_v4()',
      'created_at:timezone(''utc''::text, now())'],
    ARRAY['id:extensions.uuid_generate_v4()',
      'created_at:timezone(''utc''::text, now())']
  ) THEN
    RAISE EXCEPTION
      'F016 badges hardening aborted: default contract mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = target
      AND contype IN ('p', 'u', 'f', 'c', 'x')
  ) <> 2 OR NOT EXISTS (
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
         WHERE attrelid = target AND attname = 'code')
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'F016 badges hardening aborted: primary or unique key mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = user_badges_table
      AND contype = 'f'
      AND confrelid = target
      AND convalidated
      AND confdeltype = 'c'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = user_badges_table AND attname = 'badge_code')
      ]::smallint[]
      AND confkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = target AND attname = 'code')
      ]::smallint[]
  ) <> 1 THEN
    RAISE EXCEPTION
      'F016 badges hardening aborted: user_badges foreign key mismatch';
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
      'F016 badges hardening aborted: unexpected owned sequence';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = target AND (relrowsecurity OR relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION
      'F016 badges hardening aborted: unexpected RLS state or policy';
  END IF;
END
$preconditions$;

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.badges FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.badges FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.badges FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.badges FROM service_role;

DO $revoke_columns$
DECLARE
  column_name name;
BEGIN
  FOR column_name IN
    SELECT attname
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.badges'::regclass
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.badges FROM PUBLIC, anon, authenticated, service_role',
      column_name
    );
  END LOOP;
END
$revoke_columns$;

GRANT SELECT (id, code, name, description, category, type, rank, image_url)
  ON TABLE public.badges TO service_role;

DO $postconditions$
DECLARE
  target CONSTANT regclass := 'public.badges'::regclass;
  owner_oid oid;
  service_oid oid;
  column_name name;
  expected_select boolean;
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
      'F016 badges hardening failed: RLS is not default-deny';
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
  ) OR EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated')) AS role_name(name)
    WHERE pg_catalog.has_any_column_privilege(
      role_name.name, target, 'SELECT,INSERT,UPDATE,REFERENCES'
    )
  ) THEN
    RAISE EXCEPTION
      'F016 badges hardening failed: unexpected role privilege';
  END IF;

  FOR column_name IN
    SELECT attname
    FROM pg_catalog.pg_attribute
    WHERE attrelid = target
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    expected_select := column_name IN (
      'id', 'code', 'name', 'description', 'category', 'type', 'rank',
      'image_url'
    );
    IF pg_catalog.has_column_privilege(
         'service_role', target, column_name, 'SELECT'
       ) IS DISTINCT FROM expected_select
       OR pg_catalog.has_column_privilege(
         'service_role', target, column_name, 'INSERT'
       )
       OR pg_catalog.has_column_privilege(
         'service_role', target, column_name, 'UPDATE'
       )
       OR pg_catalog.has_column_privilege(
         'service_role', target, column_name, 'REFERENCES'
       ) THEN
      RAISE EXCEPTION
        'F016 badges hardening failed: column ACL mismatch for %',
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
      'F016 badges hardening failed: unexpected ACL grantee';
  END IF;
END
$postconditions$;

COMMIT;
