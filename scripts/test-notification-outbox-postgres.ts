import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client, type QueryResultRow } from 'pg';
const MIGRATION_SHA256 = 'd27236e1621447d53f02b10454ec67c09df534135090044bad135aff3353c9c6'; const DATABASE_PATTERN = /^ucfitness_notification_outbox_[0-9a-f]{32}$/;
const roles = [['anon', 'CREATE ROLE anon NOLOGIN NOBYPASSRLS'], ['authenticated', 'CREATE ROLE authenticated NOLOGIN NOBYPASSRLS'],
    ['service_role', 'CREATE ROLE service_role NOLOGIN BYPASSRLS']] as const;
const claimSql = 'SELECT * FROM public.claim_notification_delivery_outbox($1,$2,$3::uuid[],$4)'; const completeSql = 'SELECT public.complete_notification_delivery_outbox($1,$2,$3,$4,$5) value';
const releaseSql = 'SELECT public.release_notification_delivery_outbox($1,$2,$3,$4,$5) value';
const OWNER_A = '20000000-0000-4000-8000-000000000001', OWNER_B = '20000000-0000-4000-8000-000000000002';
interface Config { host: string; port: number; user: string; password: string } interface Claim extends QueryResultRow { user_id: string; claim_token: string }
interface State extends QueryResultRow { state: string; attempt_count: number; completed_at: Date | null; last_failed_at: Date | null; completion_timestamp_exact: boolean | null; retention_exact: boolean | null; stable_snapshot: string; snapshot: string }
interface Fixture { name: string; from: string; to: string; marker: string; setup?: string }
let migration = '', config: Config | undefined, activeCase = 'bootstrap';
const databases = new Set<string>();
function user(index: number): string { return `10000000-0000-4000-8000-${index.toString().padStart(12, '0')}` }
function loadMigration(): void {
    activeCase = 'migration-digest';
    const bytes = readFileSync(join(process.cwd(), 'migrations/20260725_create_notification_delivery_outbox.sql'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), MIGRATION_SHA256);
    migration = bytes.toString('utf8');
}
function parseConfig(env: NodeJS.ProcessEnv): Config {
    if (env.UCFITNESS_POSTGRES_RUNTIME_TEST !== '1' || !env.NOTIFICATION_OUTBOX_POSTGRES_URL)
        throw new Error('PostgreSQL runtime verification requires the explicit test-only gate');
    const url = new URL(env.NOTIFICATION_OUTBOX_POSTGRES_URL);
    if (url.protocol !== 'postgresql:' || url.search || url.hash || url.pathname !== '/postgres'
        || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.port !== '5432' || url.username !== 'postgres' || url.password !== 'postgres')
        throw new Error('PostgreSQL runtime verification requires the fixed test database');
    return { host: url.hostname === '[::1]' ? '::1' : url.hostname, port: 5432, user: url.username, password: url.password };
}
function testSafetyGates(): Config {
    const valid = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
    const invalid = [valid, undefined,
        'postgresql://postgres:postgres@external.invalid:5432/postgres',
        'postgresql://postgres:postgres@127.0.0.1:5432/template1',
        'postgresql://other:postgres@127.0.0.1:5432/postgres',
        'postgresql://postgres:other@127.0.0.1:5432/postgres',
        'postgresql://postgres:postgres@127.0.0.1:5433/postgres',
        `${valid}?sslmode=require`, `${valid}#unsafe`] as const;
    for (const [index, url] of invalid.entries()) assert.throws(() => parseConfig({ ...process.env,
        NOTIFICATION_OUTBOX_POSTGRES_URL: url,
        UCFITNESS_POSTGRES_RUNTIME_TEST: index === 0 ? undefined : '1',
    }));
    return parseConfig(process.env);
}
function quoteDatabase(name: string): string { assert.match(name, DATABASE_PATTERN); return `"${name}"` }
async function connect(database: string): Promise<Client> {
    assert(config);
    const client = new Client({ ...config, database, ssl: false, connectionTimeoutMillis: 5_000, application_name: 'ucfitness_notification_outbox_runtime' });
    await client.connect();
    await client.query("SET statement_timeout='8s';SET lock_timeout='6s';SET allow_system_table_mods=on");
    return client;
}
async function one<T extends QueryResultRow>(client: Client, sql: string, values: unknown[] = []): Promise<T> {
    const result = await client.query<T>(sql, values);
    assert.equal(result.rowCount, 1); assert(result.rows[0]); return result.rows[0];
}
async function run(name: string, test: () => Promise<void>): Promise<void> {
    activeCase = name; await test(); console.info(`OK: ${name}`);
}
async function expectFailure(operation: Promise<unknown>, message?: string): Promise<void> {
    let actual: string | undefined;
    try { await operation } catch (error: unknown) {
        if (typeof error === 'object' && error) actual = String(Reflect.get(error, 'message'));
    }
    if (message) assert.equal(actual, message); else assert(actual);
}
async function expectMigrationFailure(client: Client, sql: string, marker: string): Promise<void> {
    let code: string | undefined, message: string | undefined;
    try { await client.query(sql) } catch (error: unknown) {
        if (typeof error === 'object' && error) {
            code = String(Reflect.get(error, 'code')); message = String(Reflect.get(error, 'message'));
        }
    }
    await client.query('ROLLBACK'); assert.equal(code, 'P0001'); assert.ok(message?.includes(marker));
}
async function assertRolesAbsent(client: Client): Promise<void> {
    const result = await client.query('SELECT FROM pg_roles WHERE rolname=ANY($1::name[])',
        [roles.map(([name]) => name)]);
    if (result.rowCount) throw new Error('PostgreSQL runtime test roles already exist');
}
async function createRoles(client: Client, created: string[]): Promise<void> {
    for (const [name, sql] of roles) { await client.query(sql); created.push(name) }
}
async function dropRoles(client: Client, created: string[]): Promise<void> {
    while (created.length) { await client.query(`DROP ROLE ${created.at(-1)}`); created.pop() }
}
async function withDatabase(admin: Client, test: (client: Client, database: string) => Promise<void>, prepare = true): Promise<void> {
    const database = `ucfitness_notification_outbox_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${quoteDatabase(database)} TEMPLATE template0 ENCODING 'UTF8'`);
    databases.add(database);
    let client: Client | undefined;
    try {
        client = await connect(database);
        if (prepare) await client.query(
            'CREATE EXTENSION pgcrypto;CREATE TABLE public.users(id uuid NOT NULL PRIMARY KEY)');
        await test(client, database);
    } finally {
        await client?.end(); await admin.query(
            `DROP DATABASE ${quoteDatabase(database)} WITH (FORCE)`);
        databases.delete(database);
    }
}
function mutate({ from, to }: Fixture): string {
    const index = migration.indexOf(from); assert.notEqual(index, -1);
    return migration.slice(0, index) + to + migration.slice(index + from.length);
}
async function service<T extends QueryResultRow>(client: Client, sql: string, values: unknown[]): Promise<T[]> {
    await client.query('SET ROLE service_role');
    try { return (await client.query<T>(sql, values)).rows } finally { await client.query('RESET ROLE') }
}
async function claim(client: Client, type: string, key: string, users: string[], owner: string): Promise<Claim[]> {
    return service<Claim>(client, claimSql, [type, key, users, owner]);
}
async function finish(
    client: Client, sql: string, type: string, key: string, id: string, owner: string, token: string,
): Promise<boolean> {
    const row = (await service<{ value: boolean }>(client, sql, [type, key, id, owner, token]))[0];
    assert.equal(typeof row?.value, 'boolean'); return row.value;
}
async function state(client: Client, type: string, key: string, id: string): Promise<State> {
    return one<State>(client, `SELECT state,attempt_count,completed_at,last_failed_at,updated_at=completed_at completion_timestamp_exact,
      retain_until=COALESCE(completed_at,last_failed_at)+interval '90 days' retention_exact,
      encode(digest(ROW(id,notification_type,occurrence_key,user_id,lease_owner,claim_token,
        lease_until,attempt_count,created_at,last_failed_at)::text,'sha256'),'hex') stable_snapshot,
      encode(digest(ROW(id,notification_type,occurrence_key,user_id,state,lease_owner,claim_token,
        lease_until,attempt_count,created_at,updated_at,completed_at,last_failed_at,retain_until)::text,
        'sha256'),'hex') snapshot
      FROM public.notification_delivery_outbox
      WHERE notification_type=$1 AND occurrence_key=$2 AND user_id=$3`, [type, key, id]);
}
async function insertUsers(client: Client, ids: string[]): Promise<void> {
    await client.query('INSERT INTO public.users SELECT * FROM unnest($1::uuid[])', [ids]) }
async function rejectUnchanged(client: Client, sql: string, type: string, key: string, id: string, owner: string, token: string): Promise<void> {
    const before = await state(client, type, key, id);
    assert.equal(await finish(client, sql, type, key, id, owner, token), false);
    assert.equal((await state(client, type, key, id)).snapshot, before.snapshot) }
async function verifyTimelineGuard(client: Client): Promise<void> {
    const id = user(99);
    await insertUsers(client, [id]);
    let code: string | undefined;
    try {
        await client.query(`INSERT INTO public.notification_delivery_outbox(
          notification_type,occurrence_key,user_id,retain_until)
          VALUES('step-reminder','2026-07-25',$1,clock_timestamp()+interval '89 days')`, [id]);
    } catch (error: unknown) {
        if (typeof error === 'object' && error) code = String(Reflect.get(error, 'code'));
    }
    if (code !== '23514') throw new Error('notification outbox timeline guard changed');
}
async function verifyCatalog(client: Client): Promise<void> {
    const result = await one<{ columns_hash: string; constraints_hash: string;
        indexes_hash: string; acl_hash: string; contracts: boolean[]; functions: string[] }>(client, `
      WITH t AS (SELECT 'public.notification_delivery_outbox'::regclass oid,
        'public.users'::regclass users_oid), f AS (
        SELECT p.*,l.lanname,pg_get_function_result(p.oid) result FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
        WHERE n.nspname='public' AND p.proname LIKE '%notification_delivery_outbox')
      SELECT encode(digest((SELECT string_agg(format('%s:%s:%s:%s',a.attname,
        format_type(a.atttypid,a.atttypmod),a.attnotnull,format('%s:%s:%s:%s:%s',a.attnum,
        a.attidentity,a.attgenerated,a.attcollation,a.attisdropped)||':'||COALESCE(pg_get_expr(
        d.adbin,d.adrelid),'<none>')),E'\n' ORDER BY a.attnum) FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum,t
        WHERE a.attrelid=t.oid AND a.attnum>0),'sha256'),'hex') columns_hash,
      encode(digest((SELECT string_agg(format('%s:%s:%s:%s:%s:%s',conname,contype,
        convalidated,condeferrable,condeferred,pg_get_constraintdef(c.oid,true)),E'\n'
        ORDER BY conname) FROM pg_constraint c,t WHERE c.conrelid=t.oid),'sha256'),'hex') constraints_hash,
      encode(digest((SELECT string_agg(format('%s:%s:%s:%s:%s:%s:%s',c.relname,
        pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indisunique,
        i.indimmediate,i.indnullsnotdistinct),E'\n' ORDER BY c.relname) FROM pg_index i
        JOIN pg_class c ON c.oid=i.indexrelid,t WHERE i.indrelid=t.oid),'sha256'),'hex') indexes_hash,
      encode(digest((SELECT string_agg(format('table:%s:%s:%s:%s',x.grantor::regrole,
        x.grantee::regrole,x.privilege_type,x.is_grantable),E'\n' ORDER BY x.grantor,x.grantee,
        x.privilege_type,x.is_grantable) FROM pg_class c,t,LATERAL aclexplode(c.relacl)x
        WHERE c.oid=t.oid)||E'\n'||(SELECT string_agg(format('function:%s:%s:%s:%s:%s',
        f.proname,x.grantor::regrole,x.grantee::regrole,x.privilege_type,x.is_grantable),E'\n'
        ORDER BY f.proname,x.grantor,x.grantee,x.privilege_type,x.is_grantable)
        FROM f,LATERAL aclexplode(f.proacl)x),'sha256'),'hex') acl_hash,
      ARRAY[
        EXISTS(SELECT FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner,t WHERE c.oid=t.oid
          AND r.rolname='postgres' AND r.rolbypassrls AND c.relrowsecurity AND NOT c.relforcerowsecurity),
        NOT EXISTS(SELECT FROM pg_policy p,t WHERE p.polrelid=t.oid),
        NOT EXISTS(SELECT FROM pg_attribute a,t,LATERAL aclexplode(a.attacl) x
          WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
        NOT EXISTS(SELECT FROM t,unnest(ARRAY['anon','authenticated','service_role']) role
          WHERE has_table_privilege(role,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             OR has_any_column_privilege(role,t.oid,'SELECT,INSERT,UPDATE,REFERENCES')),
        NOT EXISTS(SELECT FROM pg_depend d JOIN pg_class s ON s.oid=d.objid,t
          WHERE d.refobjid=t.oid AND s.relkind='S' AND d.deptype IN ('a','i')),
        NOT EXISTS(SELECT FROM f WHERE NOT prosecdef OR prokind<>'f' OR lanname<>'plpgsql'
          OR pg_get_userbyid(proowner)<>'postgres'
          OR proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] OR NOT has_function_privilege(
            'service_role',oid,'EXECUTE') OR has_function_privilege('anon',oid,'EXECUTE')
          OR has_function_privilege('authenticated',oid,'EXECUTE'))
      ] contracts,(SELECT array_agg(proname||':'||result ORDER BY proname) FROM f) functions FROM t`);
    assert.equal(result.columns_hash, '5dabb5b68e4e182480ac689b13e7ce596f3d34a58345cc19416036c65edfeb44');
    assert.equal(result.constraints_hash, '75a11ed7432b62e81294bd71cb15a9225202d9f68ca62b4ddf8f74f758399ba6');
    assert.equal(result.indexes_hash, 'b30980d306902c44db30da94cbe7a7eded99990c12e0fe1113368c4361d63430');
    assert.equal(result.acl_hash, '4a91f939c87e877e53ecb019663adb88b776ec6c5a2abd83ab0ddd6d90f72b5b');
    assert.deepEqual(result.contracts, Array(6).fill(true));
    assert.deepEqual(result.functions, [
        'claim_notification_delivery_outbox:TABLE(user_id uuid, claim_token uuid)',
        'complete_notification_delivery_outbox:boolean', 'release_notification_delivery_outbox:boolean']);
    await verifyTimelineGuard(client);
}
async function verifyBehavior(client: Client): Promise<void> {
    const ids = Array.from({ length: 21 }, (_, index) => user(index + 1));
    await insertUsers(client, ids);
    await client.query(`INSERT INTO public.notification_delivery_outbox(
      notification_type,occurrence_key,user_id,retain_until)
      VALUES('step-reminder','2026-07-25',$1,clock_timestamp()+interval '90 days')`, [ids[0]]);
    const initial = await claim(client, 'step-reminder', '2026-07-25', ids.slice(0, 20).reverse(), OWNER_A);
    assert.deepEqual(initial.map(({ user_id }) => user_id), ids.slice(0, 20));
    assert.equal(new Set(initial.map(({ claim_token }) => claim_token)).size, 20);
    assert.equal((await claim(client, 'step-reminder', '2026-07-25', ids.slice(0, 20), OWNER_B)).length, 0);
    const beforeComplete = await state(client, 'step-reminder', '2026-07-25', ids[0]!);
    assert.equal(await finish(client, completeSql, 'step-reminder', '2026-07-25',
        ids[0]!, OWNER_A, initial[0]!.claim_token), true);
    const completed = await state(client, 'step-reminder', '2026-07-25', ids[0]!);
    assert.equal(completed.state, 'completed'); assert.equal(completed.attempt_count, 1);
    assert.equal(completed.stable_snapshot, beforeComplete.stable_snapshot); assert(completed.completed_at);
    assert.equal(completed.completion_timestamp_exact, true); assert.equal(completed.retention_exact, true);
    assert.equal(await finish(client, completeSql, 'step-reminder', '2026-07-25',
        ids[0]!, OWNER_A, initial[0]!.claim_token), true);
    const idempotent = await state(client, 'step-reminder', '2026-07-25', ids[0]!);
    assert.equal(idempotent.snapshot, completed.snapshot);
    assert.equal((await claim(client, 'step-reminder', '2026-07-25', [ids[0]!], OWNER_B)).length, 0);
    await client.query(`UPDATE public.notification_delivery_outbox SET lease_until=clock_timestamp()
      WHERE user_id=$1`, [ids[1]]);
    for (const sql of [completeSql, releaseSql]) await rejectUnchanged(client, sql,
        'step-reminder', '2026-07-25', ids[1]!, OWNER_A, initial[1]!.claim_token);
    const retry = (await claim(client, 'step-reminder', '2026-07-25', [ids[1]!], OWNER_B))[0]!;
    assert.equal((await state(client, 'step-reminder', '2026-07-25', ids[1]!)).attempt_count, 2);
    assert.notEqual(retry.claim_token, initial[1]!.claim_token);
    for (const [sql, owner, token] of [[completeSql, OWNER_A, initial[1]!.claim_token],
        [releaseSql, OWNER_A, initial[1]!.claim_token], [completeSql, OWNER_B, initial[1]!.claim_token],
        [releaseSql, OWNER_B, initial[1]!.claim_token], [completeSql, OWNER_A, retry.claim_token],
        [releaseSql, OWNER_A, retry.claim_token]]) await rejectUnchanged(client, sql,
        'step-reminder', '2026-07-25', ids[1]!, owner, token);
    for (const [type, key, id, owner] of [
        ['weekly-summary', '2026-W30', ids[1]!, OWNER_B],
        ['step-reminder', '2026-07-26', ids[1]!, OWNER_B],
        ['step-reminder', '2026-07-25', ids[20]!, OWNER_B],
        ['step-reminder', '2026-07-25', ids[1]!, OWNER_A],
    ]) assert.equal(await finish(client, completeSql, type, key, id, owner, retry.claim_token), false);
    assert.equal(await finish(client, completeSql, 'step-reminder', '2026-07-25',
        ids[1]!, OWNER_B, retry.claim_token), true);
    for (const [sql, owner, token] of [[releaseSql, OWNER_B, retry.claim_token],
        [completeSql, OWNER_A, retry.claim_token], [completeSql, OWNER_B, initial[1]!.claim_token]])
        await rejectUnchanged(client, sql, 'step-reminder', '2026-07-25', ids[1]!, owner, token);
    for (let attempt = 1; attempt <= 5; attempt++) {
        const current = (await claim(client, 'step-reminder', '2026-07-26', [ids[2]!], OWNER_A))[0]!;
        assert.equal(await finish(client, releaseSql, 'step-reminder', '2026-07-26',
            ids[2]!, OWNER_A, current.claim_token), true);
        const row = await state(client, 'step-reminder', '2026-07-26', ids[2]!);
        assert.equal(row.state, attempt === 5 ? 'failed' : 'pending');
        assert.equal(row.attempt_count, attempt);
        assert(row.last_failed_at);
        if (attempt === 5) assert.equal(row.retention_exact, true);
    }
    assert.equal((await claim(client, 'step-reminder', '2026-07-26', [ids[2]!], OWNER_B)).length, 0);
    await client.query(`UPDATE public.notification_delivery_outbox SET attempt_count=5,
      lease_until=clock_timestamp() WHERE user_id=$1`, [ids[3]]);
    assert.equal((await claim(client, 'step-reminder', '2026-07-25', [ids[3]!], OWNER_B)).length, 0);
    const expiredTerminal = await state(client, 'step-reminder', '2026-07-25', ids[3]!);
    assert.equal(expiredTerminal.state, 'failed'); assert.equal(expiredTerminal.retention_exact, true);
    await expectFailure(claim(client, 'step-reminder', '2026-07-27', ids, OWNER_A),
        'Invalid notification outbox claim input');
}
async function verifyBoundariesAndRetention(client: Client): Promise<void> {
    activeCase = 'occurrence-boundaries';
    const ids = Array.from({ length: 6 }, (_, index) => user(30 + index));
    await insertUsers(client, ids);
    assert.equal((await claim(client, 'step-reminder', '2024-02-29', [ids[0]!], OWNER_A)).length, 1);
    assert.equal((await claim(client, 'weekly-summary', '2020-W53', [ids[0]!], OWNER_A)).length, 1);
    for (const [type, key] of [['step-reminder', '2023-02-29'], ['step-reminder', '2026-13-01'],
        ['weekly-summary', '2021-W53'], ['weekly-summary', '2026-W00'], ['other', '2026-07-25']])
        await expectFailure(claim(client, type, key, [ids[0]!], OWNER_A));
    activeCase = 'retention-cleanup';
    await client.query(`INSERT INTO public.notification_delivery_outbox(
      notification_type,occurrence_key,user_id,state,lease_owner,claim_token,lease_until,
      attempt_count,created_at,updated_at,completed_at,last_failed_at,retain_until) VALUES
      ('step-reminder','2026-07-01',$1,'completed',$6,gen_random_uuid(),now()-interval '100 days',1,now()-interval '200 days',now()-interval '101 days',now()-interval '101 days',NULL,now()-interval '11 days'),
      ('step-reminder','2026-07-02',$2,'failed',NULL,NULL,NULL,5,now()-interval '200 days',now()-interval '100 days',NULL,now()-interval '101 days',now()-interval '11 days'),
      ('step-reminder','2026-07-03',$3,'pending',NULL,NULL,NULL,0,now()-interval '200 days',now()-interval '200 days',NULL,NULL,now()-interval '110 days'),
      ('step-reminder','2026-07-04',$4,'claimed',$6,gen_random_uuid(),now()+interval '5 minutes',1,now()-interval '200 days',now(),NULL,NULL,now()-interval '110 days'),
      ('step-reminder','2026-07-05',$5,'completed',$6,gen_random_uuid(),now()+interval '4 minutes',1,now()-interval '1 minute',now(),now()-interval '1 second',NULL,now()+interval '90 days')`,
    [...ids.slice(1), OWNER_A]);
    const removed = await client.query<{ state: string }>(`DELETE FROM public.notification_delivery_outbox
      WHERE state IN ('completed','failed') AND retain_until<=clock_timestamp() RETURNING state`);
    assert.deepEqual(removed.rows.map(({ state: value }) => value).sort(), ['completed', 'failed']);
    const retained = await client.query<{ state: string }>(
        `SELECT state FROM public.notification_delivery_outbox
         WHERE occurrence_key BETWEEN '2026-07-03' AND '2026-07-05' ORDER BY occurrence_key`);
    assert.deepEqual(retained.rows.map(({ state: value }) => value), ['pending', 'claimed', 'completed']);
}
function deadline<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => rejectPromise(
            new Error('bounded PostgreSQL operation timed out')), 7_000);
        timer.unref();
        promise.then((value) => { clearTimeout(timer); resolvePromise(value) },
            (error: unknown) => { clearTimeout(timer); rejectPromise(error) });
    });
}
async function waitForBlocker(client: Client, pids: number[], low: number, high: number): Promise<void> {
    const expires = Date.now() + 4_000;
    while (Date.now() < expires) {
        if ((await one<{ waiting: boolean }>(client, `SELECT count(*)=cardinality($1::int[])
          AND bool_and(wait_event_type='Lock' AND NOT $3=ANY(pg_blocking_pids(pid))
            AND pg_blocking_pids(pid)<@($1::int[]||ARRAY[$2]::int[]))
          AND bool_or($2=ANY(pg_blocking_pids(pid))) waiting
          FROM pg_stat_activity WHERE pid=ANY($1::int[])`, [pids, low, high])).waiting) return;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
    throw new Error('expected PostgreSQL lock wait was not observed');
}
async function verifyConcurrentClaim(monitor: Client, database: string): Promise<void> {
    const ids = Array.from({ length: 4 }, (_, index) => user(40 + index));
    await insertUsers(monitor, ids);
    const lowGate = await connect(database), highGate = await connect(database);
    const first = await connect(database), second = await connect(database);
    let pending: Array<{ client: Client; promise: Promise<{ client: Client; rows: Claim[] }> }> = [];
    try {
        await lowGate.query('BEGIN'); await highGate.query('BEGIN');
        await lowGate.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [ids[0]]);
        await highGate.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [ids.at(-1)]);
        await first.query('BEGIN;SET ROLE service_role');
        await second.query('BEGIN;SET ROLE service_role');
        const pids = await Promise.all([first, second].map((client) =>
            one<{ pid: number }>(client, 'SELECT pg_backend_pid() pid').then(({ pid }) => pid)));
        const [lowGatePid, highGatePid] = await Promise.all([lowGate, highGate].map((client) =>
            one<{ pid: number }>(client, 'SELECT pg_backend_pid() pid').then(({ pid }) => pid)));
        pending = [[first, ids, OWNER_A], [second, [...ids].reverse(), OWNER_B]].map(
            ([client, input, owner]) => {
                assert(client instanceof Client && Array.isArray(input) && typeof owner === 'string');
                return { client, promise: client.query<Claim>(claimSql,
                    ['step-reminder', '2026-07-30', input, owner]).then(({ rows }) => ({ client, rows })) };
            });
        activeCase = 'concurrent-gate-wait'; await waitForBlocker(monitor, pids, lowGatePid, highGatePid);
        activeCase = 'concurrent-results'; await lowGate.query('COMMIT'); await highGate.query('COMMIT');
        const claimed = await deadline(Promise.race(pending.map(({ promise }) => promise)));
        await claimed.client.query('COMMIT');
        const skipped = await deadline(pending.find(({ client }) => client !== claimed.client)!.promise);
        await skipped.client.query('COMMIT');
        assert.deepEqual(claimed.rows.map(({ user_id }) => user_id), ids);
        assert.equal(skipped.rows.length, 0);
        assert.equal(new Set([...claimed.rows, ...skipped.rows].map(({ user_id }) => user_id)).size, 4);
    } finally {
        await Promise.allSettled([lowGate, highGate, first, second].map((client) => client.query('ROLLBACK')));
        await Promise.allSettled(pending.map(({ promise }) => deadline(promise)));
        await Promise.all([lowGate.end(), highGate.end(), first.end(), second.end()]);
    }
}
const fixtures: Fixture[] = [
    { name: 'default', from: "state text NOT NULL DEFAULT 'pending'", to: "state text NOT NULL DEFAULT 'claimed'", marker: 'columns or defaults changed' },
    { name: 'foreign-key', from: 'REFERENCES public.users(id) ON DELETE CASCADE', to: 'REFERENCES public.other_users(id) ON DELETE CASCADE', setup: 'CREATE TABLE public.other_users(id uuid PRIMARY KEY)', marker: 'keys changed' },
    { name: 'unique-order', from: 'UNIQUE (notification_type, occurrence_key, user_id)', to: 'UNIQUE (user_id, occurrence_key, notification_type)', marker: 'keys changed' },
    { name: 'owner', from: 'ALTER TABLE public.notification_delivery_outbox OWNER TO postgres;', to: 'ALTER TABLE public.notification_delivery_outbox OWNER TO anon;', marker: 'owner, RLS, or ACL changed' },
    { name: 'rls', from: 'ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;', to: 'ALTER TABLE public.notification_delivery_outbox DISABLE ROW LEVEL SECURITY;', marker: 'owner, RLS, or ACL changed' },
    { name: 'policy', from: 'ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;', to: 'ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;\nCREATE POLICY unexpected ON public.notification_delivery_outbox USING(true);', marker: 'owner, RLS, or ACL changed' },
    { name: 'acl', from: 'FROM PUBLIC, anon, authenticated, service_role;', to: 'FROM PUBLIC, anon, authenticated, service_role;\nGRANT SELECT ON public.notification_delivery_outbox TO service_role;', marker: 'owner, RLS, or ACL changed' },
    { name: 'index', from: 'notification_delivery_outbox(retain_until, id)', to: 'notification_delivery_outbox(id, retain_until)', marker: 'checks or indexes changed' },
    { name: 'output', from: ') RETURNS TABLE (user_id uuid, claim_token uuid)', to: ') RETURNS TABLE (user_id uuid, claim_token uuid, unexpected boolean)', marker: 'checks or indexes changed' },
];
async function main(): Promise<void> {
    loadMigration();
    await run('safety-gates', async () => { config = testSafetyGates() });
    activeCase = 'connect-maintenance';
    const admin = await connect('postgres');
    const createdRoles: string[] = [];
    try {
        await assertRolesAbsent(admin);
        await createRoles(admin, createdRoles);
        await run('preexisting-role-rejection', () => expectFailure(
            assertRolesAbsent(admin), 'PostgreSQL runtime test roles already exist'));
        for (const [name, prepare, setup, marker] of [
            ['prerequisites', false, '', 'prerequisites are unavailable'],
            ['users-identity', false, 'CREATE TABLE public.users(id text PRIMARY KEY)',
                'public.users identity contract changed'],
            ['preexisting-table', true, 'CREATE TABLE public.notification_delivery_outbox(id uuid)',
                'notification outbox objects already exist'],
            ['preexisting-function', true, `CREATE FUNCTION public.claim_notification_delivery_outbox()
                RETURNS boolean LANGUAGE sql AS 'SELECT false'`, 'notification outbox objects already exist'],
        ] as const) await run(`negative-${name}`, () => withDatabase(admin, async (client) => {
            if (setup) await client.query(setup);
            await expectMigrationFailure(client, migration, marker);
        }, prepare));
        await run('negative-role-safety', async () => {
            await admin.query('ALTER ROLE service_role NOBYPASSRLS');
            try { await withDatabase(admin, (client) =>
                expectMigrationFailure(client, migration, 'notification outbox roles are unsafe')) } finally {
                await admin.query('ALTER ROLE service_role BYPASSRLS');
            }
        });
        for (const fixture of fixtures) await run(`negative-${fixture.name}`, () =>
            withDatabase(admin, async (client) => {
                if (fixture.setup) await client.query(fixture.setup);
                await expectMigrationFailure(client, mutate(fixture), fixture.marker);
            }));
        await run('negative-timeline-clause', () => withDatabase(admin, async (client) => {
            await client.query(migration.replace("retain_until >= created_at + interval '90 days'",
                "retain_until >= created_at + interval '89 days'"));
            await expectFailure(verifyTimelineGuard(client), 'notification outbox timeline guard changed');
        }));
        await run('negative-function-grant-option', () => withDatabase(admin, async (client) => {
            await client.query(migration.replace('TO service_role;', 'TO service_role WITH GRANT OPTION;'));
            await expectFailure(verifyCatalog(client)) }));
        await run('negative-function-search-path', () => withDatabase(admin, async (client) => {
            await client.query(migration);
            await client.query('ALTER FUNCTION public.claim_notification_delivery_outbox(text,text,uuid[],uuid) RESET ALL');
            await expectFailure(verifyCatalog(client)) }));
        for (const [name, sql] of [['table-owner-acl', 'REVOKE SELECT ON public.notification_delivery_outbox FROM postgres'],
            ['function-owner-acl', 'REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery_outbox(text,text,uuid[],uuid) FROM postgres'],
            ['owner-grant-option', 'GRANT SELECT ON public.notification_delivery_outbox TO postgres WITH GRANT OPTION']])
            await run(`negative-${name}`, () => withDatabase(admin, async (client) => {
                await client.query(migration); await client.query(sql); await expectFailure(verifyCatalog(client));
            }));
        await run('catalog-success', () => withDatabase(admin, async (client) => {
            await client.query(migration); await verifyCatalog(client) }));
        await run('claim-fencing-attempts', () => withDatabase(admin, async (client) => {
            await client.query(migration); await verifyBehavior(client) }));
        await run('occurrence-retention', () => withDatabase(admin, async (client) => {
            await client.query(migration); await verifyBoundariesAndRetention(client) }));
        await run('concurrent-reversed-claim', () => withDatabase(admin, async (client, database) => {
            await client.query(migration); await verifyConcurrentClaim(client, database) }));
        await run('rollback-order', () => withDatabase(admin, async (client) => {
            await client.query(migration);
            await client.query('INSERT INTO public.users VALUES($1)', [user(90)]);
            await client.query(`BEGIN;
              DROP FUNCTION public.release_notification_delivery_outbox(text,text,uuid,uuid,uuid);
              DROP FUNCTION public.complete_notification_delivery_outbox(text,text,uuid,uuid,uuid);
              DROP FUNCTION public.claim_notification_delivery_outbox(text,text,uuid[],uuid);
              DROP INDEX public.notification_delivery_outbox_retention_idx;
              DROP TABLE public.notification_delivery_outbox;COMMIT`);
            assert.deepEqual(await one(client, `SELECT
              to_regclass('public.notification_delivery_outbox') IS NULL table_absent,
              (SELECT count(*)=1 FROM public.users) users_intact,
              to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL prerequisite_intact`),
            { table_absent: true, users_intact: true, prerequisite_intact: true });
        }));
        await run('partial-failure-cleanup', async () => {
            let failed = '';
            await expectFailure(withDatabase(admin, async (_client, database) => {
                failed = database;
                throw new Error('PostgreSQL runtime injected partial failure');
            }), 'PostgreSQL runtime injected partial failure');
            assert.equal((await one<{ absent: boolean }>(admin,
                'SELECT NOT EXISTS(SELECT FROM pg_database WHERE datname=$1) absent', [failed])).absent, true);
            assert.equal(databases.size, 0);
            await dropRoles(admin, createdRoles);
            await assertRolesAbsent(admin);
        });
    } finally {
        const interruptedCase = activeCase;
        try {
            for (const database of [...databases])
                await admin.query(`DROP DATABASE ${quoteDatabase(database)} WITH (FORCE)`);
            await dropRoles(admin, createdRoles);
        } catch (error: unknown) {
            activeCase = 'cleanup'; throw error;
        } finally {
            await admin.end();
        }
        activeCase = interruptedCase;
    }
}
main().catch(() => {
    console.error(`ERR: ${activeCase}`);
    process.exitCode = 1;
});
