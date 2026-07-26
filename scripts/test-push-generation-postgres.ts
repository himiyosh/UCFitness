import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client, type QueryResultRow } from 'pg';

const MIGRATION_SHA256 = '918c6f9a6aefaf556d60c241f2f6db0f59037192b484e55f4b86e39795aa6b51';
const CAS_SHA256 = '8906b26cc66ccdceeb13703320740ce9c5e264cb311371d650c550500ab9cbd0';
const HARDENING_SHA256 = '5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66';
const DATABASE_PATTERN = /^ucfitness_push_generation_[0-9a-f]{32}$/;
const roles = [['anon', 'CREATE ROLE anon NOLOGIN NOBYPASSRLS'], ['authenticated', 'CREATE ROLE authenticated NOLOGIN NOBYPASSRLS'],
    ['service_role', 'CREATE ROLE service_role NOLOGIN BYPASSRLS']] as const;
const [USER_A, USER_B, USER_C] = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'];
const CANONICAL_KEY = 'https://push.example.test/v1/~device?token=A';
const aliases = [['https://PUSH.EXAMPLE.TEST/v1/~device?token=A', CANONICAL_KEY], ['https://push.example.test:443/v1/~device?token=A', CANONICAL_KEY],
    ['https://push.example.test/v1/%7Edevice?token=A', CANONICAL_KEY], ['https://push.example.test/v1/~device?token=A#queued', CANONICAL_KEY]] as const;
const saveSql = 'SELECT * FROM public.save_push_subscription_with_generation($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text)';
const releaseSql = 'SELECT public.release_push_subscription_with_generation($1::uuid,$2::text,$3::text,$4::uuid,$5::bigint) released';
const readSql = 'SELECT * FROM public.read_push_subscription_generations($1::uuid,$2::uuid[],$3::text[])';
const casSql = 'SELECT public.delete_push_subscription_if_unchanged($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::timestamptz) deleted';
const rollbackSql = `BEGIN;
REVOKE ALL ON FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.release_push_subscription_with_generation(uuid,text,text,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_push_subscription_with_generation(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
DROP FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]);
DROP FUNCTION public.release_push_subscription_with_generation(uuid,text,text,uuid,bigint);
DROP FUNCTION public.save_push_subscription_with_generation(uuid,text,text,text,text,text);
DROP INDEX public.push_subscription_ownership_owner_idx;
DROP TABLE public.push_subscription_ownership;COMMIT`;

interface Config { host: string; port: number; user: string; password: string }
interface Saved extends QueryResultRow { subscription_id: string; stored_user_id: string; stored_endpoint: string; stored_p256dh: string; stored_auth: string; stored_user_agent: string | null; stored_created_at: Date | null; recipient_generation: string; ownership_version: string }
interface Authority extends QueryResultRow { digest: string; owner_user_id: string | null; subscription_id: string | null; recipient_generation: string; ownership_version: string }
interface Fixture { name: string; from: string; to: string; marker: string; setup?: string }
let migration = '', casMigration = '', hardeningMigration = '', config: Config | undefined, activeCase = 'bootstrap';
const databases = new Set<string>();

function sha(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex') }
function loadMigrations(): void {
    activeCase = 'migration-digest';
    const target = readFileSync(join(process.cwd(), 'migrations/20260726_create_push_subscription_ownership.sql'));
    const cas = readFileSync(join(process.cwd(), 'migrations/20260725_delete_push_subscription_if_unchanged.sql'));
    assert.equal(sha(target), MIGRATION_SHA256); assert.equal(sha(cas), CAS_SHA256);
    const hardening = readFileSync(join(process.cwd(), 'migrations/20260720_harden_push_subscriptions_rls.sql'));
    assert.equal(sha(hardening), HARDENING_SHA256);
    migration = target.toString('utf8'); casMigration = cas.toString('utf8'); hardeningMigration = hardening.toString('utf8');
}
function parseConfig(env: NodeJS.ProcessEnv): Config {
    if (env.UCFITNESS_POSTGRES_RUNTIME_TEST !== '1' || !env.PUSH_GENERATION_POSTGRES_URL) throw new Error('PostgreSQL runtime verification requires the explicit test-only gate');
    const url = new URL(env.PUSH_GENERATION_POSTGRES_URL);
    if (url.protocol !== 'postgresql:' || url.search || url.hash || url.pathname !== '/postgres' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.port !== '5432' || url.username !== 'postgres' || url.password !== 'postgres') throw new Error('PostgreSQL runtime verification requires the fixed test database');
    return { host: url.hostname === '[::1]' ? '::1' : url.hostname, port: 5432, user: url.username, password: url.password };
}
function safetyGates(): Config {
    const valid = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
    const invalid = [valid, undefined, 'postgresql://postgres:postgres@external.invalid:5432/postgres', 'postgresql://postgres:postgres@127.0.0.1:5432/template1',
        'postgresql://other:postgres@127.0.0.1:5432/postgres', 'postgresql://postgres:other@127.0.0.1:5432/postgres',
        'postgresql://postgres:postgres@127.0.0.1:5433/postgres', `${valid}?sslmode=require`, `${valid}#unsafe`] as const;
    for (const [index, url] of invalid.entries()) assert.throws(() => parseConfig({ ...process.env, PUSH_GENERATION_POSTGRES_URL: url,
        UCFITNESS_POSTGRES_RUNTIME_TEST: index === 0 ? undefined : '1' }));
    return parseConfig(process.env);
}
function quoteDatabase(value: string): string { assert.match(value, DATABASE_PATTERN); return `"${value}"` }
async function connect(database: string): Promise<Client> {
    assert(config); const client = new Client({ ...config, database, ssl: false, connectionTimeoutMillis: 5_000, application_name: 'ucfitness_push_generation_runtime' });
    await client.connect(); await client.query("SET statement_timeout='8s';SET lock_timeout='6s'"); return client;
}
async function one<T extends QueryResultRow>(client: Client, sql: string, values: unknown[] = []): Promise<T> {
    const result = await client.query<T>(sql, values); assert.equal(result.rowCount, 1); assert(result.rows[0]); return result.rows[0];
}
async function run(name: string, test: () => Promise<void>): Promise<void> { activeCase = name; await test(); console.info(`OK: ${name}`) }
async function expectFailure(operation: Promise<unknown>, message?: string): Promise<void> {
    let actual: string | undefined; try { await operation } catch (error: unknown) {
        if (typeof error === 'object' && error) { const value = Reflect.get(error, 'message'); if (typeof value === 'string') actual = value }
    } if (message) assert.equal(actual, message); else assert(actual);
}
async function rolesAbsent(client: Client): Promise<void> {
    if ((await client.query('SELECT FROM pg_roles WHERE rolname=ANY($1::name[])', [roles.map(([name]) => name)])).rowCount) throw new Error('PostgreSQL runtime test roles already exist');
}
async function createRoles(client: Client, created: string[]): Promise<void> { for (const [name, sql] of roles) { await client.query(sql); created.push(name) } }
async function dropRoles(client: Client, created: string[]): Promise<void> { while (created.length) { await client.query(`DROP ROLE ${created.at(-1)}`); created.pop() } }
async function prepare(client: Client): Promise<void> {
    await client.query(`CREATE EXTENSION pgcrypto;CREATE TABLE public.users(id uuid NOT NULL PRIMARY KEY);
CREATE TABLE public.push_subscriptions(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,user_id uuid NOT NULL,endpoint text NOT NULL,p256dh text NOT NULL,
auth text NOT NULL,user_agent text,created_at timestamptz DEFAULT now(),CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY(user_id)
REFERENCES public.users(id) ON DELETE CASCADE,CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE(user_id,endpoint));
ALTER TABLE public.push_subscriptions OWNER TO postgres`);
    await client.query(hardeningMigration); await client.query(casMigration);
}
async function withDatabase(admin: Client, test: (client: Client, database: string) => Promise<void>, prepared = true): Promise<void> {
    const database = `ucfitness_push_generation_${randomUUID().replaceAll('-', '')}`; await admin.query(`CREATE DATABASE ${quoteDatabase(database)} TEMPLATE template0 ENCODING 'UTF8'`); databases.add(database);
    let client: Client | undefined; try { client = await connect(database); if (prepared) await prepare(client); await test(client, database) }
    finally { await client?.end(); await admin.query(`DROP DATABASE ${quoteDatabase(database)} WITH (FORCE)`); databases.delete(database) }
}
function mutate(fixture: Fixture): string { const index = migration.indexOf(fixture.from); assert.notEqual(index, -1); return migration.slice(0, index) + fixture.to + migration.slice(index + fixture.from.length) }
async function migrationFails(client: Client, sql: string, marker: string): Promise<void> {
    let code: string | undefined, message: string | undefined; try { await client.query(sql) } catch (error: unknown) {
        if (typeof error === 'object' && error) { code = String(Reflect.get(error, 'code')); message = String(Reflect.get(error, 'message')) }
    } await client.query('ROLLBACK'); assert.equal(code, 'P0001'); assert.ok(message?.includes(marker));
}
async function service<T extends QueryResultRow>(client: Client, sql: string, values: unknown[]): Promise<T[]> {
    await client.query('SET ROLE service_role'); try { return (await client.query<T>(sql, values)).rows } finally { await client.query('RESET ROLE') }
}
async function saveDirect(client: Client, user: string, endpoint: string, key: string, suffix: string): Promise<Saved> {
    return one<Saved>(client, saveSql, [user, endpoint, key, `p256dh-${suffix}`, `auth-${suffix}`, `agent-${suffix}`]);
}
async function save(client: Client, user: string, endpoint: string, key: string, suffix: string): Promise<Saved> {
    const rows = await service<Saved>(client, saveSql, [user, endpoint, key, `p256dh-${suffix}`, `auth-${suffix}`, `agent-${suffix}`]); assert.equal(rows.length, 1); return rows[0]!;
}
async function release(client: Client, user: string, endpoint: string, key: string, generation: string, version: string): Promise<boolean> {
    return (await service<{ released: boolean }>(client, releaseSql, [user, endpoint, key, generation, version]))[0]!.released;
}
async function authority(client: Client, key: string): Promise<Authority> {
    return one<Authority>(client, `SELECT encode(endpoint_digest,'hex') digest,owner_user_id,subscription_id,recipient_generation,ownership_version
FROM public.push_subscription_ownership WHERE endpoint_digest=digest($1,'sha256')`, [key]);
}
async function snapshot(client: Client, key: string): Promise<string> {
    return (await one<{ value: string }>(client, `SELECT encode(digest(ROW(endpoint_digest,owner_user_id,subscription_id,recipient_generation,
ownership_version,created_at,updated_at)::text,'sha256'),'hex') value FROM public.push_subscription_ownership WHERE endpoint_digest=digest($1,'sha256')`, [key])).value;
}
async function users(client: Client, ids: string[]): Promise<void> { await client.query('INSERT INTO public.users SELECT * FROM unnest($1::uuid[])', [ids]) }
async function raw(client: Client, user: string, endpoint: string, suffix: string): Promise<void> {
    await client.query('INSERT INTO public.push_subscriptions(user_id,endpoint,p256dh,auth,user_agent) VALUES($1,$2,$3,$4,$5)',
        [user, endpoint, `p256dh-${suffix}`, `auth-${suffix}`, 'runtime-agent']);
}
async function rejectCheck(client: Client, sql: string, values: unknown[] = []): Promise<void> {
    let code: string | undefined; try { await client.query(sql, values) } catch (error: unknown) { if (typeof error === 'object' && error) code = String(Reflect.get(error, 'code')) }
    if (code !== '23514') throw new Error('Push ownership check boundary changed');
}
async function checks(client: Client): Promise<void> {
    await users(client, [USER_C]); const insert = 'INSERT INTO public.push_subscription_ownership(endpoint_digest,owner_user_id,subscription_id,recipient_generation,ownership_version,created_at,updated_at)';
    await rejectCheck(client, `${insert} VALUES(decode(repeat('00',31),'hex'),NULL,NULL,gen_random_uuid(),1,now(),now())`);
    await rejectCheck(client, `${insert} VALUES(digest('version','sha256'),NULL,NULL,gen_random_uuid(),0,now(),now())`);
    await rejectCheck(client, `${insert} VALUES(digest('timeline','sha256'),NULL,NULL,gen_random_uuid(),1,now(),now()-interval '1 second')`);
    await rejectCheck(client, `${insert} VALUES(digest('state','sha256'),$1,NULL,gen_random_uuid(),1,now(),now())`, [USER_C]);
}
async function catalog(client: Client): Promise<void> {
    const row = await one<{ columns: string; constraints: string; indexes: string; acl: string; contracts: boolean[]; functions: string[] }>(client, `
WITH t AS(SELECT 'public.push_subscription_ownership'::regclass oid),f AS(SELECT p.*,l.lanname,pg_get_function_result(p.oid) result FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
'save_push_subscription_with_generation','release_push_subscription_with_generation','read_push_subscription_generations']))
SELECT encode(digest((SELECT string_agg(format('%s:%s:%s:%s',a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
COALESCE(pg_get_expr(d.adbin,d.adrelid),'<none>')),E'\n' ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid
AND d.adnum=a.attnum,t WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),'sha256'),'hex') columns,
encode(digest((SELECT string_agg(format('%s:%s:%s:%s:%s:%s',conname,contype,convalidated,condeferrable,condeferred,
pg_get_constraintdef(c.oid,true)),E'\n' ORDER BY conname) FROM pg_constraint c,t WHERE c.conrelid=t.oid),'sha256'),'hex') constraints,
encode(digest((SELECT string_agg(format('%s:%s:%s:%s:%s:%s:%s',c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,
i.indisunique,i.indimmediate,i.indnullsnotdistinct),E'\n' ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid,t
WHERE i.indrelid=t.oid),'sha256'),'hex') indexes,encode(digest(COALESCE((SELECT string_agg(format('table:%s:%s:%s:%s',x.grantor::regrole,
x.grantee::regrole,x.privilege_type,x.is_grantable),E'\n' ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable) FROM pg_class c,t,
LATERAL aclexplode(c.relacl)x WHERE c.oid=t.oid),'')||E'\n'||COALESCE((SELECT string_agg(format('column:%s:%s:%s:%s:%s',a.attname,
x.grantor::regrole,x.grantee::regrole,x.privilege_type,x.is_grantable),E'\n' ORDER BY a.attname,x.grantor,x.grantee,x.privilege_type,x.is_grantable)
FROM pg_attribute a,t,LATERAL aclexplode(a.attacl)x WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),'')||E'\n'||
COALESCE((SELECT string_agg(format('function:%s:%s:%s:%s:%s',f.proname,x.grantor::regrole,x.grantee::regrole,x.privilege_type,
x.is_grantable),E'\n' ORDER BY f.proname,x.grantor,x.grantee,x.privilege_type,x.is_grantable) FROM f,LATERAL aclexplode(f.proacl)x),''),
'sha256'),'hex') acl,ARRAY[EXISTS(SELECT FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner,t WHERE c.oid=t.oid AND r.rolname='postgres'
AND r.rolbypassrls AND c.relrowsecurity AND NOT c.relforcerowsecurity),NOT EXISTS(SELECT FROM pg_policy p,t WHERE p.polrelid=t.oid),
NOT EXISTS(SELECT FROM pg_attribute a,t,LATERAL aclexplode(a.attacl)x WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
NOT EXISTS(SELECT FROM t,unnest(ARRAY['anon','authenticated','service_role']) role WHERE has_table_privilege(role,t.oid,
'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(role,t.oid,'SELECT,INSERT,UPDATE,REFERENCES')),
NOT EXISTS(SELECT FROM pg_depend d JOIN pg_class s ON s.oid=d.objid,t WHERE d.refobjid=t.oid AND s.relkind='S' AND d.deptype IN('a','i')),
(SELECT count(*)=3 FROM f),NOT EXISTS(SELECT FROM f WHERE NOT prosecdef OR prokind<>'f' OR lanname<>'plpgsql'
OR pg_get_userbyid(proowner)<>'postgres' OR proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] OR NOT has_function_privilege(
'service_role',oid,'EXECUTE') OR has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE'))] contracts,
(SELECT array_agg(proname||':'||result||':'||provolatile::text ORDER BY proname) FROM f) functions FROM t`);
    assert.equal(row.columns, '719e6c82d6aa2f663c05a9d21c87591adbb452f3ff5e544cba027f3d42c175b8');
    assert.equal(row.constraints, '8de46e6c048e8253c33430827870260f5ee7f818036b36a53880914f2b97c6d1');
    assert.equal(row.indexes, 'fa58fdcaa73d45f34cf6b751f6a815f6df596e45ed610efad175685a99385baa');
    assert.equal(row.acl, '1f3e73328ec9ce4326334f5c1ef74094311f197becba9d71a4c5f88aff996bea'); assert.deepEqual(row.contracts, Array(7).fill(true));
    assert.deepEqual(row.functions, ['read_push_subscription_generations:TABLE(subscription_id uuid, recipient_generation uuid, ownership_version bigint):s',
        'release_push_subscription_with_generation:boolean:v',
        'save_push_subscription_with_generation:TABLE(subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text, stored_auth text, stored_user_agent text, stored_created_at timestamp with time zone, recipient_generation uuid, ownership_version bigint):v']);
    await checks(client);
}
async function canonicalBehavior(client: Client): Promise<void> {
    await users(client, [USER_A, USER_B]); let previous: Saved | undefined;
    for (const [index, [endpoint, key]] of aliases.entries()) { const current = await save(client, USER_A, endpoint, key, `alias-${index}`);
        if (previous) { assert.equal(current.recipient_generation, previous.recipient_generation); assert.equal(BigInt(current.ownership_version), BigInt(previous.ownership_version) + BigInt(1)); assert.notEqual(current.subscription_id, previous.subscription_id) } previous = current }
    assert(previous); assert.equal((await authority(client, CANONICAL_KEY)).digest, sha(CANONICAL_KEY));
    for (const [endpoint] of aliases) assert.equal((await one<{ count: number }>(client, "SELECT count(*)::int count FROM public.push_subscription_ownership WHERE endpoint_digest=digest($1,'sha256')", [endpoint])).count, 0);
    const reserved = await save(client, USER_A, 'https://push.example.test/v1/a%2Fb', 'https://push.example.test/v1/a%2Fb', 'reserved');
    const material = await save(client, USER_A, 'https://push.example.test/v1/a/b', 'https://push.example.test/v1/a/b', 'material');
    assert.notEqual(reserved.recipient_generation, material.recipient_generation);
    const transferred = await save(client, USER_B, aliases[0][0], CANONICAL_KEY, 'transfer');
    assert.notEqual(transferred.recipient_generation, previous.recipient_generation); assert.equal((await authority(client, CANONICAL_KEY)).owner_user_id, USER_B);
    for (const invalid of ['https://', 'http://push.example.test/a', `${CANONICAL_KEY}#fragment`, `https://push.example.test/${'a'.repeat(2030)}`])
        await expectFailure(save(client, USER_A, 'https://raw.test/input', invalid, 'invalid'), 'Invalid push subscription input');
    await expectFailure(service(client, readSql, [USER_A, [randomUUID()], [`${CANONICAL_KEY}#x`]]), 'Invalid push subscription generation read input');
    await expectFailure(release(client, USER_A, 'https://raw.test/input', 'http://push.example.test/a', randomUUID(), '1'), 'Invalid push subscription release input');
}
async function capOrLegacy(client: Client, legacy: boolean): Promise<void> {
    await users(client, [USER_A, USER_B, USER_C]);
    if (legacy) { await raw(client, USER_A, 'https://push.test/legacy', 'a'); await raw(client, USER_B, 'https://push.test/legacy', 'b'); await client.query(migration);
        assert.equal((await one<{ count: number }>(client, 'SELECT count(*)::int count FROM public.push_subscription_ownership')).count, 0);
        await save(client, USER_A, 'https://push.test/legacy', 'https://push.test/legacy-key', 'winner');
        assert.equal((await one<{ count: number }>(client, 'SELECT count(*)::int count FROM public.push_subscriptions')).count, 1);
        assert.equal((await authority(client, 'https://push.test/legacy-key')).owner_user_id, USER_A); return }
    for (let index = 0; index < 19; index++) await raw(client, USER_C, `https://push.test/cap-${index}`, `cap-${index}`);
    await save(client, USER_C, 'https://push.test/cap-19', 'https://push.test/key-19', 'cap-19');
    await expectFailure(save(client, USER_C, 'https://push.test/cap-20', 'https://push.test/key-20', 'cap-20'), 'Push subscription limit reached');
    await save(client, USER_C, 'https://push.test/cap-0', 'https://push.test/key-0', 'update');
    assert.equal((await one<{ count: number }>(client, 'SELECT count(*)::int count FROM public.push_subscriptions WHERE user_id=$1', [USER_C])).count, 20);
}
async function readRelease(client: Client): Promise<void> {
    await users(client, [USER_A, USER_B]); const a = await save(client, USER_A, 'https://push.test/a', 'https://push.test/key-a', 'a');
    const b = await save(client, USER_A, 'https://push.test/b', 'https://push.test/key-b', 'b'); const before = await snapshot(client, 'https://push.test/key-a');
    const exact = await service<{ subscription_id: string; recipient_generation: string; ownership_version: string }>(client, readSql, [USER_A, [b.subscription_id, a.subscription_id, a.subscription_id],
        ['https://push.test/key-b', 'https://push.test/key-a', 'https://push.test/key-a']]);
    assert.deepEqual(exact.map(({ subscription_id }) => subscription_id), [a.subscription_id, b.subscription_id].sort()); assert.equal(await snapshot(client, 'https://push.test/key-a'), before);
    assert.deepEqual(new Map(exact.map((row) => [row.subscription_id, [row.recipient_generation, row.ownership_version]])),
        new Map([[a.subscription_id, [a.recipient_generation, a.ownership_version]], [b.subscription_id, [b.recipient_generation, b.ownership_version]]]));
    assert.equal((await service(client, readSql, [USER_A, [a.subscription_id, b.subscription_id, randomUUID()],
        ['https://push.test/wrong', 'https://push.test/key-b', 'https://push.test/key-a']])).length, 1);
    assert.equal((await service(client, readSql, [USER_B, [a.subscription_id], ['https://push.test/key-a']])).length, 0);
    await service(client, readSql, [USER_A, Array(20).fill(a.subscription_id), Array(20).fill('https://push.test/key-a')]);
    await expectFailure(service(client, readSql, [USER_A, Array(21).fill(a.subscription_id), Array(21).fill('https://push.test/key-a')]), 'Invalid push subscription generation read input');
    const stale: Array<[string, string, string, string, string]> = [[USER_B, a.stored_endpoint, 'https://push.test/key-a', a.recipient_generation, a.ownership_version],
        [USER_A, 'https://push.test/wrong', 'https://push.test/key-a', a.recipient_generation, a.ownership_version],
        [USER_A, a.stored_endpoint, 'https://push.test/wrong', a.recipient_generation, a.ownership_version],
        [USER_A, a.stored_endpoint, 'https://push.test/key-a', randomUUID(), a.ownership_version],
        [USER_A, a.stored_endpoint, 'https://push.test/key-a', a.recipient_generation, String(BigInt(a.ownership_version) + BigInt(1))]];
    for (const values of stale) assert.equal(await release(client, ...values), false); assert.equal(await snapshot(client, 'https://push.test/key-a'), before);
    const transfer = await save(client, USER_B, 'https://push.test/new', 'https://push.test/key-a', 'transfer');
    assert.equal(await release(client, USER_A, a.stored_endpoint, 'https://push.test/key-a', a.recipient_generation, a.ownership_version), false);
    const moved = await save(client, USER_B, 'https://push.test/current', 'https://push.test/key-a', 'current');
    assert.equal(await release(client, USER_B, transfer.stored_endpoint, 'https://push.test/key-a', moved.recipient_generation, moved.ownership_version), false);
    assert.equal(await release(client, USER_B, moved.stored_endpoint, 'https://push.test/key-a', moved.recipient_generation, moved.ownership_version), true);
    const released = await authority(client, 'https://push.test/key-a'); assert.equal(released.owner_user_id, null); assert.equal(released.subscription_id, null);
    assert.notEqual(released.recipient_generation, moved.recipient_generation); assert.equal(BigInt(released.ownership_version), BigInt(moved.ownership_version) + BigInt(1));
}
function deadline<T>(promise: Promise<T>): Promise<T> { return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bounded PostgreSQL operation timed out')), 7_000); timer.unref();
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error: unknown) => { clearTimeout(timer); reject(error) });
}) }
async function waitLocks(client: Client, pids: number[]): Promise<void> {
    const expires = Date.now() + 4_000; while (Date.now() < expires) {
        if ((await one<{ waiting: boolean }>(client, "SELECT count(*)=cardinality($1::int[]) AND bool_and(wait_event_type='Lock') waiting FROM pg_stat_activity WHERE pid=ANY($1::int[])", [pids])).waiting) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    } throw new Error('expected PostgreSQL lock wait was not observed');
}
async function tx(database: string, serviceRole = true): Promise<Client> { const client = await connect(database); await client.query(serviceRole ? 'BEGIN;SET ROLE service_role' : 'BEGIN'); return client }
async function blockedPair(monitor: Client, database: string, operations: Array<[string, string, string, string]>): Promise<void> {
    const gate = await tx(database, false), clients = await Promise.all([tx(database), tx(database)]);
    const pending: Array<{ client: Client; promise: Promise<{ client: Client; value: Saved }> }> = [];
    try { await gate.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [USER_A]);
        const pids = await Promise.all(clients.map((client) => one<{ pid: number }>(client, 'SELECT pg_backend_pid() pid').then(({ pid }) => pid)));
        operations.forEach(([user, endpoint, key, suffix], index) => { const client = clients[index]!;
            pending.push({ client, promise: saveDirect(client, user, endpoint, key, suffix).then((value) => ({ client, value })) }) });
        await waitLocks(monitor, pids); await gate.query('COMMIT'); const winner = await deadline(Promise.race(pending.map(({ promise }) => promise)));
        await winner.client.query('COMMIT'); const loser = await deadline(pending.find(({ client }) => client !== winner.client)!.promise); await loser.client.query('COMMIT');
    } finally { await Promise.allSettled([gate, ...clients].map((client) => client.query('ROLLBACK')));
        await Promise.allSettled(pending.map(({ promise }) => deadline(promise))); await Promise.all([gate.end(), ...clients.map((client) => client.end())]) }
}
async function concurrency(client: Client, database: string): Promise<void> {
    await users(client, [USER_A, USER_B]); await save(client, USER_A, 'https://push.test/shared', 'https://push.test/shared-key', 'shared');
    await blockedPair(client, database, [[USER_A, 'https://push.test/shared', 'https://push.test/shared-key', 'claim-a'],
        [USER_B, 'https://push.test/shared', 'https://push.test/shared-key', 'claim-b']]);
    assert([USER_A, USER_B].includes((await authority(client, 'https://push.test/shared-key')).owner_user_id ?? ''));
    assert.equal((await one<{ count: number }>(client, "SELECT count(*)::int count FROM public.push_subscriptions WHERE endpoint='https://push.test/shared'")).count, 1);
    await blockedPair(client, database, [[USER_A, 'https://push.test/device-a', 'https://push.test/device-key-a', 'device-a'],
        [USER_A, 'https://push.test/device-b', 'https://push.test/device-key-b', 'device-b']]);
    assert.equal((await one<{ count: number }>(client, "SELECT count(*)::int count FROM public.push_subscription_ownership WHERE endpoint_digest=ANY(ARRAY[digest('https://push.test/device-key-a','sha256'),digest('https://push.test/device-key-b','sha256')])")).count, 2);
    await save(client, USER_A, 'https://push.test/left', 'https://push.test/left-key', 'left'); await save(client, USER_B, 'https://push.test/right', 'https://push.test/right-key', 'right');
    await blockedPair(client, database, [[USER_B, 'https://push.test/left-new', 'https://push.test/left-key', 'left-transfer'],
        [USER_A, 'https://push.test/right-new', 'https://push.test/right-key', 'right-transfer']]);
    assert.equal((await authority(client, 'https://push.test/left-key')).owner_user_id, USER_B); assert.equal((await authority(client, 'https://push.test/right-key')).owner_user_id, USER_A);
}
async function userDeletion(client: Client, database: string): Promise<void> {
    await users(client, [USER_A, USER_B]); await save(client, USER_A, 'https://push.test/delete-owner', 'https://push.test/delete-key', 'delete');
    const transfer = await tx(database), deleter = await tx(database, false); let pending: Promise<number | null> | undefined;
    try { await saveDirect(transfer, USER_B, 'https://push.test/delete-winner', 'https://push.test/delete-key', 'transfer');
        const pid = await one<{ pid: number }>(deleter, 'SELECT pg_backend_pid() pid'); pending = deleter.query('DELETE FROM public.users WHERE id=$1', [USER_A]).then(({ rowCount }) => rowCount);
        await waitLocks(client, [pid.pid]); await transfer.query('COMMIT'); assert.equal(await deadline(pending), 1); await deleter.query('COMMIT');
        assert.equal((await authority(client, 'https://push.test/delete-key')).owner_user_id, USER_B);
        assert.equal((await one<{ count: number }>(client, 'SELECT count(*)::int count FROM public.push_subscription_ownership o LEFT JOIN public.users u ON u.id=o.owner_user_id WHERE o.owner_user_id IS NOT NULL AND u.id IS NULL')).count, 0);
        await client.query('DELETE FROM public.users WHERE id=$1', [USER_B]); assert.equal((await one<{ count: number }>(client, 'SELECT count(*)::int count FROM public.push_subscription_ownership')).count, 0);
    } finally { await Promise.allSettled([transfer.query('ROLLBACK'), deleter.query('ROLLBACK')]); if (pending) await deadline(pending).catch(() => undefined); await Promise.all([transfer.end(), deleter.end()]) }
}
async function casDirect(client: Client, row: Saved): Promise<boolean> {
    const observed = await one<{ created_at: string | null }>(client,
        'SELECT created_at::text FROM public.push_subscriptions WHERE id=$1', [row.subscription_id]);
    return (await one<{ deleted: boolean }>(client, casSql, [row.subscription_id, row.stored_user_id, row.stored_endpoint, row.stored_p256dh,
        row.stored_auth, row.stored_user_agent, observed.created_at])).deleted;
}
async function casInteraction(client: Client, database: string): Promise<void> {
    await users(client, [USER_A]); const initial = await save(client, USER_A, 'https://push.test/cas', 'https://push.test/cas-key', 'old');
    const cleanup = await tx(database), resave = await tx(database); let pendingSave: Promise<Saved> | undefined;
    try { assert.equal(await casDirect(cleanup, initial), true); assert.equal((await one<{ count: number }>(client, 'SELECT count(*)::int count FROM public.push_subscription_ownership')).count, 1);
        const pid = await one<{ pid: number }>(resave, 'SELECT pg_backend_pid() pid'); pendingSave = saveDirect(resave, USER_A, initial.stored_endpoint, 'https://push.test/cas-key', 'healed');
        await waitLocks(client, [pid.pid]); await cleanup.query('COMMIT'); const healed = await deadline(pendingSave); await resave.query('COMMIT');
        assert.notEqual(healed.subscription_id, initial.subscription_id); assert.equal(healed.recipient_generation, initial.recipient_generation);
        const updater = await tx(database), stale = await tx(database); let pendingCas: Promise<boolean> | undefined;
        try { const winner = await saveDirect(updater, USER_A, healed.stored_endpoint, 'https://push.test/cas-key', 'winner');
            const stalePid = await one<{ pid: number }>(stale, 'SELECT pg_backend_pid() pid'); pendingCas = casDirect(stale, healed); await waitLocks(client, [stalePid.pid]);
            await updater.query('COMMIT'); assert.equal(await deadline(pendingCas), false); await stale.query('COMMIT');
            const final = await authority(client, 'https://push.test/cas-key'); assert.equal(final.subscription_id, winner.subscription_id); assert.equal(final.recipient_generation, winner.recipient_generation);
        } finally { await Promise.allSettled([updater.query('ROLLBACK'), stale.query('ROLLBACK')]); if (pendingCas) await deadline(pendingCas).catch(() => undefined); await Promise.all([updater.end(), stale.end()]) }
    } finally { await Promise.allSettled([cleanup.query('ROLLBACK'), resave.query('ROLLBACK')]); if (pendingSave) await deadline(pendingSave).catch(() => undefined); await Promise.all([cleanup.end(), resave.end()]) }
}
const fixtures: Fixture[] = [
    { name: 'default', from: 'recipient_generation uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),', to: "recipient_generation uuid NOT NULL DEFAULT '20000000-0000-4000-8000-000000000001'::uuid,", marker: 'columns changed' },
    { name: 'foreign-key', from: 'REFERENCES public.users(id) ON DELETE CASCADE,', to: 'REFERENCES public.other_users(id) ON DELETE CASCADE,', setup: 'CREATE TABLE public.other_users(id uuid PRIMARY KEY)', marker: 'keys changed' },
    { name: 'index', from: 'ON public.push_subscription_ownership(owner_user_id, endpoint_digest)', to: 'ON public.push_subscription_ownership(endpoint_digest, owner_user_id)', marker: 'keys changed' },
    { name: 'owner', from: 'ALTER TABLE public.push_subscription_ownership OWNER TO postgres;', to: 'ALTER TABLE public.push_subscription_ownership OWNER TO anon;', marker: 'table security changed' },
    { name: 'rls', from: 'ALTER TABLE public.push_subscription_ownership ENABLE ROW LEVEL SECURITY;', to: 'ALTER TABLE public.push_subscription_ownership DISABLE ROW LEVEL SECURITY;', marker: 'table security changed' },
    { name: 'policy', from: 'ALTER TABLE public.push_subscription_ownership ENABLE ROW LEVEL SECURITY;', to: 'ALTER TABLE public.push_subscription_ownership ENABLE ROW LEVEL SECURITY;\nCREATE POLICY unexpected ON public.push_subscription_ownership USING(true);', marker: 'table security changed' },
    { name: 'acl', from: 'FROM PUBLIC, anon, authenticated, service_role;', to: 'FROM PUBLIC, anon, authenticated, service_role;\nGRANT SELECT ON public.push_subscription_ownership TO service_role;', marker: 'table security changed' },
    { name: 'output', from: ') RETURNS TABLE (subscription_id uuid, recipient_generation uuid, ownership_version bigint)', to: ') RETURNS TABLE (subscription_id uuid, recipient_generation uuid, ownership_version bigint, unexpected boolean)', marker: 'RPC security changed' },
];
async function main(): Promise<void> {
    loadMigrations(); await run('safety-gates', async () => { config = safetyGates() }); activeCase = 'connect-maintenance';
    const admin = await connect('postgres'), createdRoles: string[] = [];
    try { await rolesAbsent(admin); await createRoles(admin, createdRoles);
        await run('preexisting-role-rejection', () => expectFailure(rolesAbsent(admin), 'PostgreSQL runtime test roles already exist'));
        await run('negative-prerequisites', () => withDatabase(admin, (client) => migrationFails(client, migration, 'prerequisites are unavailable'), false));
        await run('negative-function-preexists', () => withDatabase(admin, async (client) => {
            await client.query("CREATE FUNCTION public.read_push_subscription_generations() RETURNS boolean LANGUAGE sql AS 'SELECT false'");
            await migrationFails(client, migration, 'objects already exist');
        }));
        await run('negative-role-safety', async () => {
            try { await withDatabase(admin, async (client) => { await client.query('ALTER ROLE service_role NOBYPASSRLS'); await migrationFails(client, migration, 'roles are unsafe') }) }
            finally { await admin.query('ALTER ROLE service_role BYPASSRLS') }
        });
        for (const fixture of fixtures) await run(`negative-${fixture.name}`, () => withDatabase(admin, async (client) => {
            if (fixture.setup) await client.query(fixture.setup); await migrationFails(client, mutate(fixture), fixture.marker);
        }));
        await run('negative-check-clause', () => withDatabase(admin, async (client) => {
            await client.query(migration.replace('CHECK (ownership_version > 0)', 'CHECK (ownership_version >= 0)'));
            await expectFailure(checks(client), 'Push ownership check boundary changed');
        }));
        for (const [name, sql] of [['unknown-table-acl', 'GRANT SELECT ON public.push_subscription_ownership TO PUBLIC'],
            ['unknown-column-acl', 'GRANT SELECT(endpoint_digest) ON public.push_subscription_ownership TO service_role'],
            ['function-search-path', 'ALTER FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) RESET ALL'],
            ['function-execute-grant', 'GRANT EXECUTE ON FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) TO anon']])
            await run(`negative-${name}`, () => withDatabase(admin, async (client) => { await client.query(migration); await client.query(sql); await expectFailure(catalog(client)) }));
        await run('catalog-checks-security', () => withDatabase(admin, async (client) => { await client.query(migration); await catalog(client) }));
        await run('canonical-save-transfer', () => withDatabase(admin, async (client) => { await client.query(migration); await canonicalBehavior(client) }));
        await run('raw-cap-update', () => withDatabase(admin, async (client) => { await client.query(migration); await capOrLegacy(client, false) }));
        await run('legacy-quarantine', () => withDatabase(admin, (client) => capOrLegacy(client, true)));
        await run('read-release-fencing', () => withDatabase(admin, async (client) => { await client.query(migration); await readRelease(client) }));
        await run('concurrent-claims-order', () => withDatabase(admin, async (client, database) => { await client.query(migration); await concurrency(client, database) }));
        await run('user-delete-transfer', () => withDatabase(admin, async (client, database) => { await client.query(migration); await userDeletion(client, database) }));
        await run('cas-save-lock-order', () => withDatabase(admin, async (client, database) => { await client.query(migration); await casInteraction(client, database) }));
        await run('rollback-order', () => withDatabase(admin, async (client) => {
            await client.query(migration); await users(client, [USER_A]); await save(client, USER_A, 'https://push.test/rollback', 'https://push.test/rollback-key', 'rollback'); await client.query(rollbackSql);
            assert.deepEqual(await one(client, `SELECT to_regclass('public.push_subscription_ownership') IS NULL ownership_absent,
to_regclass('public.push_subscriptions') IS NOT NULL subscriptions_intact,to_regclass('public.users') IS NOT NULL users_intact,
to_regprocedure('public.delete_push_subscription_if_unchanged(uuid,uuid,text,text,text,text,timestamptz)') IS NOT NULL cas_intact,
(SELECT count(*)=1 FROM public.push_subscriptions) rows_intact`), { ownership_absent: true, subscriptions_intact: true, users_intact: true, cas_intact: true, rows_intact: true });
        }));
        await run('partial-failure-cleanup', async () => { let failed = '';
            await expectFailure(withDatabase(admin, async (_client, database) => { failed = database; throw new Error('PostgreSQL runtime injected partial failure') }), 'PostgreSQL runtime injected partial failure');
            assert.equal((await one<{ absent: boolean }>(admin, 'SELECT NOT EXISTS(SELECT FROM pg_database WHERE datname=$1) absent', [failed])).absent, true);
            assert.equal(databases.size, 0); await dropRoles(admin, createdRoles); await rolesAbsent(admin);
        });
    } finally { const interrupted = activeCase; try { for (const database of databases) await admin.query(`DROP DATABASE ${quoteDatabase(database)} WITH (FORCE)`); await dropRoles(admin, createdRoles) }
        catch (error: unknown) { activeCase = 'cleanup'; throw error } finally { await admin.end() } activeCase = interrupted }
}
main().catch(() => { console.error(`ERR: ${activeCase}`); process.exitCode = 1 });
