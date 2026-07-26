import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client, type ClientConfig, type QueryResultRow } from 'pg';

const HARDENING_SHA256 = '5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66';
const CAS_SHA256 = '8906b26cc66ccdceeb13703320740ce9c5e264cb311371d650c550500ab9cbd0';
const OWNERSHIP_SHA256 = '918c6f9a6aefaf556d60c241f2f6db0f59037192b484e55f4b86e39795aa6b51';
const PROTOCOL_SHA256 = 'e55909943fb6e9c9218afae31c10bb90695e2551a970872cdaa361ef48c0981b';
const DATABASE_PATTERN = /^ucfitness_push_protocol_[0-9a-f]{32}$/;
const roles = [['anon', 'CREATE ROLE anon NOLOGIN NOBYPASSRLS'], ['authenticated', 'CREATE ROLE authenticated NOLOGIN NOBYPASSRLS'],
    ['service_role', 'CREATE ROLE service_role NOLOGIN BYPASSRLS']] as const;
const [USER_A, USER_B] = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
const legacySaveSql = 'SELECT * FROM public.save_push_subscription_with_generation($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text)';
const protocolSaveSql = `${legacySaveSql.slice(0, -1)},$7::smallint)`;
const releaseSql = 'SELECT public.release_push_subscription_with_generation($1::uuid,$2::text,$3::text,$4::uuid,$5::bigint) released';
const readSql = 'SELECT * FROM public.read_push_subscription_generations($1::uuid,$2::uuid[],$3::text[])';

interface Config { host: string; port: number; user: string; password: string }
interface LegacySaved extends QueryResultRow { subscription_id: string; stored_user_id: string; stored_endpoint: string; recipient_generation: string; ownership_version: string }
interface Saved extends LegacySaved { recipient_protocol_version: number }
interface Authority extends QueryResultRow { owner_user_id: string | null; subscription_id: string | null; recipient_generation: string; ownership_version: string; recipient_protocol_version: number }
interface Readiness extends QueryResultRow { subscription_id: string; recipient_generation: string; ownership_version: string; recipient_protocol_version: number }
interface Fixture { name: string; from: string; to: string; marker: string }
let hardening = '', cas = '', ownership = '', protocol = '', config: Config | undefined, activeCase = 'bootstrap';
const databases = new Set<string>();

function sha(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex') }
function loadMigrations(): void {
    activeCase = 'migration-digest';
    const files = [
        ['migrations/20260720_harden_push_subscriptions_rls.sql', HARDENING_SHA256],
        ['migrations/20260725_delete_push_subscription_if_unchanged.sql', CAS_SHA256],
        ['migrations/20260726_create_push_subscription_ownership.sql', OWNERSHIP_SHA256],
        ['migrations/20260727_add_push_recipient_protocol_readiness.sql', PROTOCOL_SHA256],
    ] as const;
    [hardening, cas, ownership, protocol] = files.map(([path, digest]) => {
        const bytes = readFileSync(join(process.cwd(), path)); assert.equal(sha(bytes), digest); return bytes.toString('utf8');
    });
}
function parseConfig(env: NodeJS.ProcessEnv): Config {
    if (env.UCFITNESS_POSTGRES_RUNTIME_TEST !== '1' || !env.PUSH_PROTOCOL_POSTGRES_URL)
        throw new Error('PostgreSQL runtime verification requires the explicit test-only gate');
    const url = new URL(env.PUSH_PROTOCOL_POSTGRES_URL);
    if (url.protocol !== 'postgresql:' || url.search || url.hash || url.pathname !== '/postgres'
        || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '5432'
        || url.username !== 'postgres' || url.password !== 'postgres')
        throw new Error('PostgreSQL runtime verification requires the fixed test database');
    return { host: url.hostname === '[::1]' ? '::1' : url.hostname, port: 5432, user: url.username, password: url.password };
}
function clientConfig(base: Config, database: string): ClientConfig {
    const value = { ...base, database, ssl: false, connectionTimeoutMillis: 5_000, application_name: 'ucfitness_push_protocol_runtime' } satisfies ClientConfig;
    assert.deepEqual(Object.keys(value).sort(), ['application_name', 'connectionTimeoutMillis', 'database', 'host', 'password', 'port', 'ssl', 'user']);
    assert.equal(value.ssl, false); return value;
}
function safetyGates(): Config {
    const valid = '******127.0.0.1:5432/postgres';
    const invalid = [valid, undefined, '******external.invalid:5432/postgres', '******127.0.0.1:5432/template1',
        '******127.0.0.1:5432/postgres', '******127.0.0.1:5432/postgres', '******127.0.0.1:5433/postgres',
        `${valid}?sslmode=require`, `${valid}#unsafe`] as const;
    for (const [index, url] of invalid.entries()) assert.throws(() => parseConfig({
        ...process.env, PUSH_PROTOCOL_POSTGRES_URL: url, UCFITNESS_POSTGRES_RUNTIME_TEST: index === 0 ? undefined : '1',
    }));
    assert.throws(() => quoteDatabase('postgres'));
    const parsed = parseConfig(process.env); assert.equal(clientConfig(parsed, 'postgres').database, 'postgres'); return parsed;
}
function quoteDatabase(value: string): string { assert.match(value, DATABASE_PATTERN); return `"${value}"` }
function quoteRole(value: string): string { assert(roles.some(([name]) => name === value)); return `"${value}"` }
async function connect(database: string): Promise<Client> {
    assert(config); const client = new Client(clientConfig(config, database)); await client.connect();
    await client.query("SET statement_timeout='8s';SET lock_timeout='6s'"); return client;
}
async function one<T extends QueryResultRow>(client: Client, sql: string, values: unknown[] = []): Promise<T> {
    const result = await client.query<T>(sql, values); assert.equal(result.rowCount, 1); assert(result.rows[0]); return result.rows[0];
}
async function run(name: string, test: () => Promise<void>): Promise<void> { activeCase = name; await test(); console.info(`OK: ${name}`) }
async function expectFailure(operation: Promise<unknown>, message?: string): Promise<void> {
    let actual: string | undefined; try { await operation } catch (error: unknown) {
        if (typeof error === 'object' && error) { const value = Reflect.get(error, 'message'); if (typeof value === 'string') actual = value }
    }
    if (message) assert.equal(actual, message); else assert(actual);
}
async function expectSqlState(operation: Promise<unknown>, expected: string): Promise<void> {
    let actual: string | undefined; try { await operation } catch (error: unknown) {
        if (typeof error === 'object' && error) actual = String(Reflect.get(error, 'code'));
    }
    assert.equal(actual, expected);
}
async function rolesAbsent(client: Client): Promise<void> {
    if ((await client.query('SELECT FROM pg_roles WHERE rolname=ANY($1::name[])', [roles.map(([name]) => name)])).rowCount)
        throw new Error('PostgreSQL runtime test roles already exist');
}
async function createRoles(client: Client, created: string[]): Promise<void> { for (const [name, sql] of roles) { await client.query(sql); created.push(name) } }
async function dropRoles(client: Client, created: string[]): Promise<void> {
    while (created.length) { const role = created.at(-1); assert(role); await client.query(`DROP ROLE ${quoteRole(role)}`); created.pop() }
}
async function prepare(client: Client, includeOwnership = true): Promise<void> {
    await client.query(`CREATE EXTENSION pgcrypto;CREATE TABLE public.users(id uuid NOT NULL PRIMARY KEY);
CREATE TABLE public.push_subscriptions(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,user_id uuid NOT NULL,endpoint text NOT NULL,p256dh text NOT NULL,
auth text NOT NULL,user_agent text,created_at timestamptz DEFAULT now(),CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY(user_id)
REFERENCES public.users(id) ON DELETE CASCADE,CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE(user_id,endpoint));
ALTER TABLE public.push_subscriptions OWNER TO postgres`);
    await client.query(hardening); await client.query(cas); if (includeOwnership) await client.query(ownership);
}
async function withDatabase(admin: Client, test: (client: Client, database: string) => Promise<void>, includeOwnership = true): Promise<void> {
    const database = `ucfitness_push_protocol_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${quoteDatabase(database)} TEMPLATE template0 ENCODING 'UTF8'`); databases.add(database);
    let client: Client | undefined;
    try { client = await connect(database); await prepare(client, includeOwnership); await test(client, database) }
    finally { await client?.end(); await admin.query(`DROP DATABASE ${quoteDatabase(database)} WITH (FORCE)`); databases.delete(database) }
}
function mutate(source: string, fixture: Fixture): string {
    const index = source.indexOf(fixture.from); assert.notEqual(index, -1);
    return source.slice(0, index) + fixture.to + source.slice(index + fixture.from.length);
}
async function migrationFails(client: Client, sql: string, marker: string): Promise<void> {
    let code: string | undefined, message: string | undefined; try { await client.query(sql) } catch (error: unknown) {
        if (typeof error === 'object' && error) { code = String(Reflect.get(error, 'code')); message = String(Reflect.get(error, 'message')) }
    }
    await client.query('ROLLBACK'); assert.equal(code, 'P0001'); assert.ok(message?.includes(marker));
}
async function service<T extends QueryResultRow>(client: Client, sql: string, values: unknown[]): Promise<T[]> {
    await client.query('SET ROLE service_role'); try { return (await client.query<T>(sql, values)).rows } finally { await client.query('RESET ROLE') }
}
async function users(client: Client): Promise<void> { await client.query('INSERT INTO public.users VALUES($1),($2)', [USER_A, USER_B]) }
async function legacySave(client: Client, user: string, endpoint: string, key: string, suffix: string): Promise<LegacySaved> {
    const rows = await service<LegacySaved>(client, legacySaveSql, [user, endpoint, key, `p256dh-${suffix}`, `auth-${suffix}`, `agent-${suffix}`]);
    assert.equal(rows.length, 1); const row = rows[0]; assert(row); return row;
}
async function protocolSave(client: Client, user: string, endpoint: string, key: string, suffix: string, version: number | null = 1): Promise<Saved> {
    const rows = await service<Saved>(client, protocolSaveSql, [user, endpoint, key, `p256dh-${suffix}`, `auth-${suffix}`, `agent-${suffix}`, version]);
    assert.equal(rows.length, 1); const row = rows[0]; assert(row); return row;
}
async function protocolSaveDirect(client: Client, user: string, endpoint: string, key: string, suffix: string): Promise<Saved> {
    return one<Saved>(client, protocolSaveSql, [user, endpoint, key, `p256dh-${suffix}`, `auth-${suffix}`, `agent-${suffix}`, 1]);
}
async function read(client: Client, user: string, ids: string[], keys: string[]): Promise<Readiness[]> {
    return service<Readiness>(client, readSql, [user, ids, keys]);
}
async function release(client: Client, user: string, endpoint: string, key: string, generation: string, version: string): Promise<boolean> {
    const row = (await service<{ released: boolean }>(client, releaseSql, [user, endpoint, key, generation, version]))[0];
    assert(row); return row.released;
}
async function authority(client: Client, key: string): Promise<Authority> {
    return one<Authority>(client, `SELECT owner_user_id,subscription_id,recipient_generation,ownership_version,recipient_protocol_version
FROM public.push_subscription_ownership WHERE endpoint_digest=digest($1,'sha256')`, [key]);
}
async function snapshot(client: Client, key: string): Promise<string> {
    return (await one<{ value: string }>(client, `SELECT encode(digest(ROW(endpoint_digest,owner_user_id,subscription_id,recipient_generation,
ownership_version,recipient_protocol_version,created_at,updated_at)::text,'sha256'),'hex') value
FROM public.push_subscription_ownership WHERE endpoint_digest=digest($1,'sha256')`, [key])).value;
}
async function catalog(client: Client): Promise<void> {
    const row = await one<{ columns: string[]; checks: string[]; functions: string[]; contracts: boolean[] }>(client, `
WITH t AS(SELECT 'public.push_subscription_ownership'::regclass oid),f AS(
 SELECT p.*,pg_get_function_result(p.oid) result FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY['save_push_subscription_with_generation','release_push_subscription_with_generation',
 'read_push_subscription_generations','reset_push_recipient_protocol_version']))
SELECT (SELECT array_agg(format('%s:%s:%s:%s',a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull::text,
 COALESCE(pg_get_expr(d.adbin,d.adrelid),'<none>')) ORDER BY a.attname) FROM pg_attribute a LEFT JOIN pg_attrdef d
 ON d.adrelid=a.attrelid AND d.adnum=a.attnum,t WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
(SELECT array_agg(format('%s:%s',conname,regexp_replace(pg_get_constraintdef(c.oid,false),'[[:space:]()]','','g')) ORDER BY conname)
 FROM pg_constraint c,t WHERE c.conrelid=t.oid AND c.contype='c') checks,
(SELECT array_agg(p.oid::regprocedure::text||':'||result||':'||provolatile::text ORDER BY p.oid::regprocedure::text) FROM f p) functions,
ARRAY[
 EXISTS(SELECT FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner,t WHERE c.oid=t.oid AND r.rolname='postgres' AND r.rolbypassrls AND c.relrowsecurity AND NOT c.relforcerowsecurity),
 NOT EXISTS(SELECT FROM pg_policy p,t WHERE p.polrelid=t.oid),(SELECT count(*)=8 FROM pg_constraint c,t WHERE c.conrelid=t.oid),
 EXISTS(SELECT FROM pg_constraint c,t WHERE c.conrelid=t.oid AND c.contype='p' AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attname='endpoint_digest')]::smallint[]),
 EXISTS(SELECT FROM pg_constraint c,t WHERE c.conrelid=t.oid AND c.contype='f' AND c.confrelid='public.users'::regclass AND c.confdeltype='c' AND c.convalidated),
 EXISTS(SELECT FROM pg_constraint c JOIN pg_index i ON i.indexrelid=c.conindid,t WHERE c.conrelid=t.oid AND c.contype='u' AND c.convalidated AND NOT c.condeferrable AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate),
 EXISTS(SELECT FROM pg_index i,t WHERE i.indrelid=t.oid AND i.indexrelid='public.push_subscription_ownership_owner_idx'::regclass AND i.indisvalid AND i.indisready AND NOT i.indisunique AND pg_get_indexdef(i.indexrelid,1,true)='owner_user_id' AND pg_get_indexdef(i.indexrelid,2,true)='endpoint_digest' AND pg_get_expr(i.indpred,i.indrelid)='(owner_user_id IS NOT NULL)'),
 EXISTS(SELECT FROM pg_trigger g,t WHERE g.tgrelid=t.oid AND g.tgname='push_subscription_ownership_protocol_reset' AND g.tgtype=23 AND g.tgattr::text='2 3 4 5' AND g.tgenabled='O' AND NOT g.tgisinternal),
 (SELECT count(*)=7 AND bool_and(x.grantee=c.relowner AND NOT x.is_grantable) FROM pg_class c,t,LATERAL aclexplode(c.relacl)x WHERE c.oid=t.oid),
 NOT EXISTS(SELECT FROM pg_attribute a,t,LATERAL aclexplode(a.attacl)x WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
 (SELECT count(*)=5 FROM f),(SELECT count(*)=9 AND bool_and(NOT x.is_grantable AND x.grantee IN(f.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))) FROM f,LATERAL aclexplode(f.proacl)x),
 NOT EXISTS(SELECT FROM f WHERE NOT prosecdef OR prokind<>'f' OR pg_get_userbyid(proowner)<>'postgres' OR proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]),
 (SELECT count(*)=4 FROM f WHERE has_function_privilege('service_role',oid,'EXECUTE')) AND
 NOT EXISTS(SELECT FROM f WHERE has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE'))
] contracts FROM t`);
    assert.deepEqual(row.columns, ['created_at:timestamp with time zone:true:now()', 'endpoint_digest:bytea:true:<none>',
        'owner_user_id:uuid:false:<none>', 'ownership_version:bigint:true:1', 'recipient_generation:uuid:true:gen_random_uuid()',
        'recipient_protocol_version:smallint:true:0', 'subscription_id:uuid:false:<none>', 'updated_at:timestamp with time zone:true:now()']);
    assert.deepEqual(row.checks, ['push_subscription_ownership_digest_check:CHECKoctet_lengthendpoint_digest=32',
        'push_subscription_ownership_protocol_check:CHECKrecipient_protocol_version>=0ANDrecipient_protocol_version<=1',
        'push_subscription_ownership_state_check:CHECKowner_user_idISNULL=subscription_idISNULL',
        'push_subscription_ownership_timeline_check:CHECKupdated_at>=created_at',
        'push_subscription_ownership_version_check:CHECKownership_version>0']);
    assert.deepEqual(row.functions, [
        'read_push_subscription_generations(uuid,uuid[],text[]):TABLE(subscription_id uuid, recipient_generation uuid, ownership_version bigint, recipient_protocol_version smallint):s',
        'release_push_subscription_with_generation(uuid,text,text,uuid,bigint):boolean:v',
        'reset_push_recipient_protocol_version():trigger:v',
        'save_push_subscription_with_generation(uuid,text,text,text,text,text):TABLE(subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text, stored_auth text, stored_user_agent text, stored_created_at timestamp with time zone, recipient_generation uuid, ownership_version bigint):v',
        'save_push_subscription_with_generation(uuid,text,text,text,text,text,smallint):TABLE(subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text, stored_auth text, stored_user_agent text, stored_created_at timestamp with time zone, recipient_generation uuid, ownership_version bigint, recipient_protocol_version smallint):v',
    ]);
    assert.deepEqual(row.contracts, Array(14).fill(true));
    await client.query("INSERT INTO public.push_subscription_ownership(endpoint_digest) VALUES(digest('protocol-check','sha256'))");
    for (const value of [-1, 2]) await expectSqlState(client.query(
        "UPDATE public.push_subscription_ownership SET recipient_protocol_version=$1 WHERE endpoint_digest=digest('protocol-check','sha256')", [value]), '23514');
}
async function existingAuthority(client: Client): Promise<void> {
    await users(client); const saved = await legacySave(client, USER_A, 'https://push.test/existing', 'https://push.test/existing-key', 'existing');
    await client.query(protocol); const state = await authority(client, 'https://push.test/existing-key');
    assert.equal(state.recipient_protocol_version, 0);
    assert.deepEqual(await read(client, USER_A, [saved.subscription_id], ['https://push.test/existing-key']),
        [{ subscription_id: saved.subscription_id, recipient_generation: saved.recipient_generation, ownership_version: saved.ownership_version, recipient_protocol_version: 0 }]);
}
async function saveBehavior(client: Client): Promise<void> {
    await users(client); await client.query(protocol); const key = 'https://push.test/save-key';
    const initial = await protocolSave(client, USER_A, 'https://push.test/save', key, 'initial'); assert.equal(initial.recipient_protocol_version, 1);
    const before = await snapshot(client, key);
    for (const version of [0, 2, -1, null]) {
        await expectFailure(protocolSave(client, USER_A, 'https://push.test/save', key, 'invalid', version), 'Unsupported push recipient protocol version');
        assert.equal(await snapshot(client, key), before);
    }
    const same = await protocolSave(client, USER_A, 'https://push.test/save', key, 'same');
    assert.equal(same.recipient_generation, initial.recipient_generation); assert.equal(BigInt(same.ownership_version), BigInt(initial.ownership_version) + BigInt(1));
    assert.equal(same.recipient_protocol_version, 1);
    await legacySave(client, USER_A, 'https://push.test/save', key, 'legacy');
    assert.equal((await authority(client, key)).recipient_protocol_version, 0);
    const ready = await protocolSave(client, USER_A, 'https://push.test/save', key, 'ready');
    const moved = await protocolSave(client, USER_B, 'https://push.test/save', key, 'transfer');
    assert.notEqual(moved.recipient_generation, ready.recipient_generation); assert.equal(moved.recipient_protocol_version, 1);
}
async function readBehavior(client: Client): Promise<void> {
    await users(client); await client.query(protocol);
    const ready = await protocolSave(client, USER_A, 'https://push.test/ready', 'https://push.test/ready-key', 'ready');
    const legacy = await legacySave(client, USER_A, 'https://push.test/legacy', 'https://push.test/legacy-key', 'legacy');
    const before = await snapshot(client, 'https://push.test/ready-key');
    const exact = await read(client, USER_A, [legacy.subscription_id, ready.subscription_id, ready.subscription_id],
        ['https://push.test/legacy-key', 'https://push.test/ready-key', 'https://push.test/ready-key']);
    assert.deepEqual(exact.map(({ subscription_id }) => subscription_id), [ready.subscription_id, legacy.subscription_id].sort());
    assert.deepEqual(new Map(exact.map((row) => [row.subscription_id, row.recipient_protocol_version])),
        new Map([[ready.subscription_id, 1], [legacy.subscription_id, 0]]));
    const legacyRow = exact.find(({ subscription_id }) => subscription_id === legacy.subscription_id); assert(legacyRow);
    assert.deepEqual(await read(client, USER_A, [ready.subscription_id, legacy.subscription_id],
        ['https://push.test/wrong', 'https://push.test/legacy-key']), [legacyRow]);
    assert.equal((await read(client, USER_B, [ready.subscription_id], ['https://push.test/ready-key'])).length, 0);
    assert.equal((await read(client, USER_A, Array(20).fill(ready.subscription_id), Array(20).fill('https://push.test/ready-key'))).length, 1);
    await expectFailure(read(client, USER_A, Array(21).fill(ready.subscription_id), Array(21).fill('https://push.test/ready-key')),
        'Invalid push subscription generation read input');
    assert.equal(await snapshot(client, 'https://push.test/ready-key'), before);
}
async function releaseBehavior(client: Client): Promise<void> {
    await users(client); await client.query(protocol); const key = 'https://push.test/release-key';
    const saved = await protocolSave(client, USER_A, 'https://push.test/release', key, 'release'); const before = await snapshot(client, key);
    const stale: Array<[string, string, string, string, string]> = [
        [USER_B, saved.stored_endpoint, key, saved.recipient_generation, saved.ownership_version],
        [USER_A, 'https://push.test/wrong', key, saved.recipient_generation, saved.ownership_version],
        [USER_A, saved.stored_endpoint, 'https://push.test/wrong', saved.recipient_generation, saved.ownership_version],
        [USER_A, saved.stored_endpoint, key, randomUUID(), saved.ownership_version],
        [USER_A, saved.stored_endpoint, key, saved.recipient_generation, String(BigInt(saved.ownership_version) + BigInt(1))],
    ];
    for (const values of stale) assert.equal(await release(client, ...values), false);
    assert.equal(await snapshot(client, key), before);
    assert.equal(await release(client, USER_A, saved.stored_endpoint, key, saved.recipient_generation, saved.ownership_version), true);
    const cleared = await authority(client, key); assert.equal(cleared.owner_user_id, null); assert.equal(cleared.subscription_id, null);
    assert.equal(cleared.recipient_protocol_version, 0); assert.notEqual(cleared.recipient_generation, saved.recipient_generation);
    assert.equal(BigInt(cleared.ownership_version), BigInt(saved.ownership_version) + BigInt(1));
}
function deadline<T>(promise: Promise<T>): Promise<T> { return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bounded PostgreSQL operation timed out')), 7_000); timer.unref();
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error: unknown) => { clearTimeout(timer); reject(error) });
}) }
async function waitLocks(client: Client, pids: number[]): Promise<void> {
    const expires = Date.now() + 4_000; while (Date.now() < expires) {
        if ((await one<{ waiting: boolean }>(client, "SELECT count(*)=cardinality($1::int[]) AND bool_and(wait_event_type='Lock') waiting FROM pg_stat_activity WHERE pid=ANY($1::int[])", [pids])).waiting) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('expected PostgreSQL lock wait was not observed');
}
async function tx(database: string, serviceRole = true): Promise<Client> {
    const client = await connect(database); await client.query(serviceRole ? 'BEGIN;SET ROLE service_role' : 'BEGIN'); return client;
}
async function blockedPair(monitor: Client, database: string, operations: Array<[string, string, string, string]>): Promise<void> {
    const gate = await tx(database, false), clients = await Promise.all([tx(database), tx(database)]);
    const pending: Array<{ client: Client; promise: Promise<Saved> }> = [];
    try {
        const participants = [...new Set(operations.map(([user]) => user))];
        assert.equal((await gate.query('SELECT id FROM public.users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [participants])).rowCount, participants.length);
        const pids = await Promise.all(clients.map((client) => one<{ pid: number }>(client, 'SELECT pg_backend_pid() pid').then(({ pid }) => pid)));
        operations.forEach(([user, endpoint, key, suffix], index) => {
            const client = clients[index]; assert(client);
            pending.push({ client, promise: protocolSaveDirect(client, user, endpoint, key, suffix) });
        });
        await waitLocks(monitor, pids); await gate.query('COMMIT');
        const winner = await deadline(Promise.race(pending.map(async ({ client, promise }) => ({ client, value: await promise }))));
        await winner.client.query('COMMIT'); const loser = pending.find(({ client }) => client !== winner.client); assert(loser);
        await deadline(loser.promise); await loser.client.query('COMMIT');
    } finally {
        await Promise.allSettled([gate, ...clients].map((client) => client.query('ROLLBACK')));
        await Promise.allSettled(pending.map(({ promise }) => deadline(promise))); await Promise.all([gate.end(), ...clients.map((client) => client.end())]);
    }
}
async function concurrency(client: Client, database: string): Promise<void> {
    await users(client); await client.query(protocol); const endpoint = 'https://push.test/concurrent', key = 'https://push.test/concurrent-key';
    const initial = await protocolSave(client, USER_A, endpoint, key, 'initial');
    await blockedPair(client, database, [[USER_A, endpoint, key, 'same-a'], [USER_A, endpoint, key, 'same-b']]);
    const same = await authority(client, key); assert.equal(same.owner_user_id, USER_A); assert.equal(same.recipient_generation, initial.recipient_generation);
    assert.equal(same.recipient_protocol_version, 1);
    await blockedPair(client, database, [[USER_A, endpoint, key, 'forward-a'], [USER_B, endpoint, key, 'forward-b']]);
    const forward = await authority(client, key); assert([USER_A, USER_B].includes(forward.owner_user_id ?? ''));
    assert.equal(forward.recipient_protocol_version, 1);
    await blockedPair(client, database, [[USER_B, endpoint, key, 'reverse-b'], [USER_A, endpoint, key, 'reverse-a']]);
    const final = await authority(client, key); assert([USER_A, USER_B].includes(final.owner_user_id ?? '')); assert.equal(final.recipient_protocol_version, 1);
    assert.ok(BigInt(final.ownership_version) > BigInt(initial.ownership_version));
    assert.equal((await one<{ count: number }>(client, 'SELECT count(*)::int count FROM public.push_subscriptions WHERE endpoint=$1', [endpoint])).count, 1);
}
async function rollback(client: Client): Promise<void> {
    const previousRead = ownership.match(/CREATE FUNCTION public\.read_push_subscription_generations\([\s\S]+?END; \$function\$;/)?.[0];
    assert(previousRead);
    await client.query(`BEGIN;
REVOKE ALL ON FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) FROM PUBLIC,anon,authenticated,service_role;
DROP FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]);
${previousRead}
ALTER FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) TO service_role;
REVOKE ALL ON FUNCTION public.save_push_subscription_with_generation(uuid,text,text,text,text,text,smallint) FROM PUBLIC,anon,authenticated,service_role;
DROP FUNCTION public.save_push_subscription_with_generation(uuid,text,text,text,text,text,smallint);
DROP TRIGGER push_subscription_ownership_protocol_reset ON public.push_subscription_ownership;
DROP FUNCTION public.reset_push_recipient_protocol_version();
ALTER TABLE public.push_subscription_ownership DROP CONSTRAINT push_subscription_ownership_protocol_check,
DROP COLUMN recipient_protocol_version;COMMIT`);
}
async function rollbackBehavior(client: Client): Promise<void> {
    await users(client); await client.query(protocol);
    const saved = await protocolSave(client, USER_A, 'https://push.test/rollback', 'https://push.test/rollback-key', 'rollback');
    await rollback(client);
    assert.deepEqual(await one(client, `SELECT
      NOT EXISTS(SELECT FROM pg_attribute WHERE attrelid='public.push_subscription_ownership'::regclass AND attname='recipient_protocol_version' AND NOT attisdropped) column_absent,
      to_regprocedure('public.save_push_subscription_with_generation(uuid,text,text,text,text,text,smallint)') IS NULL new_save_absent,
      to_regprocedure('public.reset_push_recipient_protocol_version()') IS NULL trigger_function_absent,
      pg_get_function_result('public.read_push_subscription_generations(uuid,uuid[],text[])'::regprocedure)='TABLE(subscription_id uuid, recipient_generation uuid, ownership_version bigint)' read_restored,
      pg_get_function_result('public.save_push_subscription_with_generation(uuid,text,text,text,text,text)'::regprocedure)='TABLE(subscription_id uuid, stored_user_id uuid, stored_endpoint text, stored_p256dh text, stored_auth text, stored_user_agent text, stored_created_at timestamp with time zone, recipient_generation uuid, ownership_version bigint)' save_restored,
      pg_get_function_result('public.release_push_subscription_with_generation(uuid,text,text,uuid,bigint)'::regprocedure)='boolean' release_restored,
      (SELECT count(*)=3 AND bool_and(prosecdef AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=""']::text[] AND has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY['save_push_subscription_with_generation','release_push_subscription_with_generation','read_push_subscription_generations'])) previous_security,
      (SELECT count(*)=1 FROM public.push_subscription_ownership) authority_preserved,
      (SELECT count(*)=1 FROM public.push_subscriptions) subscription_preserved`),
    { column_absent: true, new_save_absent: true, trigger_function_absent: true, read_restored: true, save_restored: true,
        release_restored: true, previous_security: true, authority_preserved: true, subscription_preserved: true });
    const updated = await legacySave(client, USER_A, saved.stored_endpoint, 'https://push.test/rollback-key', 'restored');
    assert.equal((await service(client, readSql, [USER_A, [updated.subscription_id], ['https://push.test/rollback-key']])).length, 1);
}
const prerequisiteCases = [
    ['wrong-default', 'ALTER TABLE public.push_subscription_ownership ALTER COLUMN ownership_version SET DEFAULT 2', 'catalog changed'],
    ['wrong-type', 'ALTER TABLE public.push_subscription_ownership ALTER COLUMN updated_at TYPE timestamp without time zone', 'catalog changed'],
    ['wrong-check', 'ALTER TABLE public.push_subscription_ownership DROP CONSTRAINT push_subscription_ownership_version_check;ALTER TABLE public.push_subscription_ownership ADD CONSTRAINT push_subscription_ownership_version_check CHECK(ownership_version>=0)', 'catalog changed'],
    ['prior-signature', "CREATE FUNCTION public.read_push_subscription_generations() RETURNS boolean LANGUAGE sql AS 'SELECT false'", 'RPC security changed'],
    ['prior-output', `DROP FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]);
CREATE FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) RETURNS TABLE(subscription_id uuid,unexpected boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$BEGIN RETURN;END$$;ALTER FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) TO service_role`, 'RPC security changed'],
    ['prior-owner', 'ALTER FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) OWNER TO anon', 'RPC security changed'],
    ['prior-grant', 'GRANT EXECUTE ON FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) TO anon', 'RPC security changed'],
    ['prior-search-path', 'ALTER FUNCTION public.read_push_subscription_generations(uuid,uuid[],text[]) RESET ALL', 'RPC security changed'],
    ['table-acl', 'GRANT SELECT ON public.push_subscription_ownership TO service_role', 'table security changed'],
    ['table-rls', 'ALTER TABLE public.push_subscription_ownership DISABLE ROW LEVEL SECURITY', 'table security changed'],
    ['table-policy', 'CREATE POLICY unexpected ON public.push_subscription_ownership USING(true)', 'table security changed'],
    ['unknown-acl', 'GRANT SELECT(endpoint_digest) ON public.push_subscription_ownership TO service_role', 'table security changed'],
] as const;
const fixtures: Fixture[] = [
    { name: 'default', from: 'ADD COLUMN recipient_protocol_version smallint NOT NULL DEFAULT 0', to: 'ADD COLUMN recipient_protocol_version smallint NOT NULL DEFAULT 1', marker: 'columns or checks changed' },
    { name: 'type', from: 'ADD COLUMN recipient_protocol_version smallint NOT NULL DEFAULT 0', to: 'ADD COLUMN recipient_protocol_version integer NOT NULL DEFAULT 0', marker: 'columns or checks changed' },
    { name: 'check', from: 'CHECK (recipient_protocol_version >= 0 AND recipient_protocol_version <= 1)', to: 'CHECK (recipient_protocol_version >= 0 AND recipient_protocol_version <= 2)', marker: 'columns or checks changed' },
    { name: 'output', from: 'ownership_version bigint, recipient_protocol_version smallint\n) LANGUAGE plpgsql SECURITY DEFINER', to: 'ownership_version bigint, recipient_protocol_version integer\n) LANGUAGE plpgsql SECURITY DEFINER', marker: 'function contract changed' },
    { name: 'owner', from: 'ALTER FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text, text, smallint) OWNER TO postgres;', to: 'ALTER FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text, text, smallint) OWNER TO anon;', marker: 'function contract changed' },
    { name: 'grant', from: 'GRANT EXECUTE ON FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text, text, smallint) TO service_role;', to: 'GRANT EXECUTE ON FUNCTION public.save_push_subscription_with_generation(uuid, text, text, text, text, text, smallint) TO anon;', marker: 'function contract changed' },
    { name: 'trigger', from: 'UPDATE OF owner_user_id, subscription_id, recipient_generation, ownership_version', to: 'UPDATE OF owner_user_id, subscription_id, recipient_generation', marker: 'trigger or index changed' },
];
async function main(): Promise<void> {
    loadMigrations(); await run('safety-gates', async () => { config = safetyGates() }); activeCase = 'connect-maintenance';
    const admin = await connect('postgres'), createdRoles: string[] = [];
    try {
        await rolesAbsent(admin); await createRoles(admin, createdRoles);
        await run('preexisting-role-rejection', () => expectFailure(rolesAbsent(admin), 'PostgreSQL runtime test roles already exist'));
        await run('negative-missing-ownership', () => withDatabase(admin, (client) => migrationFails(client, protocol, 'prerequisites are unavailable'), false));
        for (const [name, setup, marker] of prerequisiteCases) await run(`negative-${name}`, () => withDatabase(admin, async (client) => {
            await client.query(setup); await migrationFails(client, protocol, marker);
        }));
        for (const fixture of fixtures) await run(`negative-fixture-${fixture.name}`, () => withDatabase(admin,
            (client) => migrationFails(client, mutate(protocol, fixture), fixture.marker)));
        await run('critical-clause-digest', async () => {
            for (const clause of ['AND ownership.ownership_version = v_saved.ownership_version',
                'ON subscription.id = requested.subscription_id AND subscription.user_id = p_user_id'])
                assert.notEqual(sha(protocol.replace(clause, '')), PROTOCOL_SHA256);
        });
        for (const [name, sql] of [
            ['unknown-table-acl', 'GRANT SELECT ON public.push_subscription_ownership TO PUBLIC'],
            ['unknown-column-acl', 'GRANT SELECT(endpoint_digest) ON public.push_subscription_ownership TO service_role'],
            ['unknown-function-acl', 'GRANT EXECUTE ON FUNCTION public.reset_push_recipient_protocol_version() TO service_role'],
        ]) await run(`negative-${name}`, () => withDatabase(admin, async (client) => {
            await client.query(protocol); await client.query(sql); await expectFailure(catalog(client));
        }));
        await run('catalog-security-contract', () => withDatabase(admin, async (client) => { await client.query(protocol); await catalog(client) }));
        await run('existing-authority-protocol-zero', () => withDatabase(admin, existingAuthority));
        await run('protocol-save-transfer', () => withDatabase(admin, saveBehavior));
        await run('read-stable-dedup-cap', () => withDatabase(admin, readBehavior));
        await run('release-generation-fence', () => withDatabase(admin, releaseBehavior));
        await run('concurrent-save-transfer-order', () => withDatabase(admin, concurrency));
        await run('rollback-restores-ownership', () => withDatabase(admin, rollbackBehavior));
        await run('partial-failure-cleanup', async () => {
            let failed = ''; await expectFailure(withDatabase(admin, async (_client, database) => {
                failed = database; throw new Error('PostgreSQL runtime injected partial failure');
            }), 'PostgreSQL runtime injected partial failure');
            assert.equal((await one<{ absent: boolean }>(admin,
                'SELECT NOT EXISTS(SELECT FROM pg_database WHERE datname=$1) absent', [failed])).absent, true);
            assert.equal(databases.size, 0); await dropRoles(admin, createdRoles); await rolesAbsent(admin);
        });
    } finally {
        const interrupted = activeCase;
        try { for (const database of [...databases]) await admin.query(`DROP DATABASE ${quoteDatabase(database)} WITH (FORCE)`); await dropRoles(admin, createdRoles) }
        catch (error: unknown) { activeCase = 'cleanup'; throw error } finally { await admin.end() }
        activeCase = interrupted;
    }
}
main().catch(() => { console.error(`ERR: ${activeCase}`); process.exitCode = 1 });
