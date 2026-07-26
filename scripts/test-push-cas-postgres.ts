import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, type QueryResultRow } from 'pg';
const connectionString = process.env.PUSH_CAS_POSTGRES_URL;
const CAS_MIGRATION_SHA256 = '8906b26cc66ccdceeb13703320740ce9c5e264cb311371d650c550500ab9cbd0';
const TEST_DATABASE_PATTERN = /^ucfitness_push_cas_[0-9a-f]{32}$/;
const testRoleDefinitions = [
    ['anon', 'CREATE ROLE anon NOLOGIN NOBYPASSRLS'],
    ['authenticated', 'CREATE ROLE authenticated NOLOGIN NOBYPASSRLS'],
    ['service_role', 'CREATE ROLE service_role NOLOGIN BYPASSRLS'],
] as const;
const rollbackSql = 'BEGIN; REVOKE ALL ON FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role; DROP FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz); COMMIT;';
const writeColumns = 'user_id, endpoint, p256dh, auth, user_agent, created_at';
const functionCall = 'SELECT public.delete_push_subscription_if_unchanged($1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::timestamptz) AS deleted';
const USER_A = '10000000-0000-4000-8000-000000000001', USER_B = '10000000-0000-4000-8000-000000000002';
const deniedRoles: Array<'anon' | 'authenticated'> = ['anon', 'authenticated'];
let hardeningMigration = '', casMigration = '';
let connectionConfig: { host: string; port: number; user: string; password: string } | undefined;
let activeCase = 'bootstrap';

interface PgFailure { code?: string; message?: string }
interface FailureFixture { name: string; sql: string; code: string; marker: string }
interface SubscriptionRow extends QueryResultRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; created_at: Date | null }

function pgFailure(error: unknown): PgFailure {
    if (typeof error !== 'object' || error === null) return {};
    const code = Reflect.get(error, 'code');
    const message = Reflect.get(error, 'message');
    return { code: typeof code === 'string' ? code : undefined, message: typeof message === 'string' ? message : undefined };
}

function loadMigrations(): void {
    activeCase = 'bootstrap-digest';
    hardeningMigration = readFileSync(join(process.cwd(),
        'migrations/20260720_harden_push_subscriptions_rls.sql'), 'utf8');
    const bytes = readFileSync(join(process.cwd(), 'migrations/20260725_delete_push_subscription_if_unchanged.sql'));
    if (createHash('sha256').update(bytes).digest('hex') !== CAS_MIGRATION_SHA256)
        throw new Error('Push CAS migration digest mismatch');
    casMigration = bytes.toString('utf8');
}
function validateConnection(): void {
    activeCase = 'bootstrap-config';
    if (!connectionString || process.env.UCFITNESS_POSTGRES_RUNTIME_TEST !== '1')
        throw new Error('PostgreSQL runtime verification requires the explicit test-only gate');
    const url = new URL(connectionString);
    if (url.protocol !== 'postgresql:' || url.search || url.hash || url.pathname !== '/postgres'
        || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.port !== '5432' || url.username !== 'postgres' || url.password !== 'postgres')
        throw new Error('PostgreSQL runtime verification requires the fixed test database');
    connectionConfig = { host: url.hostname === '[::1]' ? '::1' : url.hostname,
        port: 5432, user: url.username, password: url.password };
}
function quoteTestDatabase(value: string): string { assert.match(value, TEST_DATABASE_PATTERN); return `"${value}"` }
async function connect(database: string): Promise<Client> {
    assert(connectionConfig);
    const client = new Client({ ...connectionConfig, database, ssl: false, connectionTimeoutMillis: 5_000,
        application_name: 'ucfitness_push_cas_runtime' });
    await client.connect();
    await client.query("SET statement_timeout='8s'; SET lock_timeout='6s'; SET allow_system_table_mods=on");
    return client;
}
async function one<T extends QueryResultRow>(client: Client, text: string, values: unknown[] = []): Promise<T> {
    const result = await client.query<T>(text, values);
    assert.equal(result.rowCount, 1);
    const row = result.rows[0];
    assert(row);
    return row;
}
async function prepareDatabase(client: Client): Promise<void> {
    await client.query(`CREATE EXTENSION pgcrypto;
        CREATE TABLE public.users (id uuid PRIMARY KEY);
        CREATE TABLE public.push_subscriptions (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid NOT NULL,
            endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
            user_agent text, created_at timestamptz DEFAULT now(),
            CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY(user_id)
              REFERENCES public.users(id) ON DELETE CASCADE,
            CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE(user_id,endpoint));
        ALTER TABLE public.push_subscriptions OWNER TO postgres;`);
    await client.query(hardeningMigration);
}
async function withFreshDatabase(admin: Client, test: (client: Client, database: string) => Promise<void>): Promise<void> {
    const database = `ucfitness_push_cas_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${quoteTestDatabase(database)} TEMPLATE template0 ENCODING 'UTF8'`);
    let client: Client | undefined;
    try {
        client = await connect(database); await prepareDatabase(client); await test(client, database);
    } finally {
        await client?.end(); await admin.query(`DROP DATABASE ${quoteTestDatabase(database)} WITH (FORCE)`);
    }
}
async function runCase(name: string, test: () => Promise<void>): Promise<void> {
    activeCase = name; await test(); console.info(`OK: ${name}`);
}
async function assertRolesAbsent(client: Client): Promise<void> {
    const result = await client.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1::name[])',
        [testRoleDefinitions.map(([name]) => name)]);
    if (result.rowCount !== 0) throw new Error('PostgreSQL runtime test roles already exist');
}
async function createTestRoles(client: Client, created: string[]): Promise<void> {
    for (const [name, sql] of testRoleDefinitions) { await client.query(sql); created.push(name) }
}
async function dropTestRoles(client: Client, created: string[]): Promise<void> {
    const outcomes = await Promise.allSettled([...created].reverse().map((role) => client.query(`DROP ROLE ${role}`)));
    if (outcomes.some(({ status }) => status === 'rejected')) throw new Error('PostgreSQL runtime role cleanup failed');
    created.length = 0;
}
async function expectFixedFailure(operation: Promise<unknown>, message: string): Promise<void> {
    let failure: PgFailure | undefined;
    try { await operation } catch (error: unknown) { failure = pgFailure(error) }
    assert.equal(failure?.message, message);
}
async function expectMigrationFailure(client: Client, fixture: FailureFixture): Promise<void> {
    let failure: PgFailure | undefined;
    try { await client.query(casMigration) } catch (error: unknown) { failure = pgFailure(error) }
    await client.query('ROLLBACK');
    assert(failure, 'migration unexpectedly succeeded');
    assert.equal(failure.code, fixture.code);
    assert.ok(failure.message?.includes(fixture.marker));
}
async function verifyCatalog(client: Client): Promise<void> {
    interface CatalogRow extends QueryResultRow { defaults: string[]; contracts: boolean[] }
    const row = await one<CatalogRow>(client, `
        WITH t AS (SELECT 'public.push_subscriptions'::regclass table_oid, 'public.users'::regclass users_oid,
            'public.delete_push_subscription_if_unchanged(uuid,uuid,text,text,text,text,timestamptz)'::regprocedure function_oid)
        SELECT (SELECT array_agg(format('%s:%s', a.attname,
            COALESCE(pg_get_expr(d.adbin,d.adrelid),'<none>')) ORDER BY a.attname)
            FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum,t
            WHERE a.attrelid=t.table_oid AND a.attnum>0 AND NOT a.attisdropped) defaults, ARRAY[
          EXISTS(SELECT FROM pg_constraint c,t WHERE c.conrelid=t.table_oid AND c.contype='p' AND c.conkey=ARRAY[
            (SELECT attnum FROM pg_attribute WHERE attrelid=t.table_oid AND attname='id')]::smallint[]),
          EXISTS(SELECT FROM pg_constraint c,t WHERE c.conrelid=t.table_oid AND c.confrelid=t.users_oid
            AND c.contype='f' AND c.convalidated AND c.confdeltype='c' AND c.conkey=ARRAY[
              (SELECT attnum FROM pg_attribute WHERE attrelid=t.table_oid AND attname='user_id')]::smallint[]
            AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=t.users_oid AND attname='id')]::smallint[]),
          EXISTS(SELECT FROM pg_constraint c JOIN pg_index i ON i.indexrelid=c.conindid,t
            WHERE c.conrelid=t.table_oid AND c.contype='u' AND c.convalidated AND NOT c.condeferrable
              AND NOT c.condeferred AND c.conkey=ARRAY[
                (SELECT attnum FROM pg_attribute WHERE attrelid=t.table_oid AND attname='user_id'),
                (SELECT attnum FROM pg_attribute WHERE attrelid=t.table_oid AND attname='endpoint')]::smallint[]
              AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate AND i.indnkeyatts=2
              AND i.indnatts=2 AND i.indpred IS NULL AND i.indexprs IS NULL),
          (SELECT r.rolname='postgres' AND r.rolbypassrls AND c.relrowsecurity AND NOT c.relforcerowsecurity
            AND (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role')
            AND NOT EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=c.oid)
            FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner,t WHERE c.oid=t.table_oid),
          (SELECT NOT EXISTS(SELECT FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x WHERE x.grantee=0)
            AND NOT EXISTS(SELECT FROM pg_attribute a,LATERAL aclexplode(a.attacl) x
              WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND x.grantee=0)
            AND NOT EXISTS(SELECT FROM unnest(ARRAY['anon','authenticated']) r,
              unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
              WHERE has_table_privilege(r,c.oid,p) OR has_any_column_privilege(r,c.oid,'SELECT, INSERT, UPDATE, REFERENCES'))
            AND NOT EXISTS(SELECT FROM unnest(ARRAY['SELECT','INSERT','UPDATE','TRUNCATE','REFERENCES','TRIGGER']) p
              WHERE has_table_privilege('service_role',c.oid,p))
            AND has_table_privilege('service_role',c.oid,'DELETE')
            AND NOT has_any_column_privilege('service_role',c.oid,'REFERENCES')
            AND NOT has_column_privilege('service_role',c.oid,'id','INSERT')
            AND NOT has_column_privilege('service_role',c.oid,'id','UPDATE')
            AND NOT EXISTS(SELECT FROM unnest(ARRAY['id','user_id','endpoint','p256dh','auth','user_agent','created_at']) col
              WHERE NOT has_column_privilege('service_role',c.oid,col,'SELECT'))
            AND NOT EXISTS(SELECT FROM unnest(ARRAY['user_id','endpoint','p256dh','auth','user_agent','created_at']) col
              WHERE NOT has_column_privilege('service_role',c.oid,col,'INSERT')
                 OR NOT has_column_privilege('service_role',c.oid,col,'UPDATE'))
            FROM pg_class c,t WHERE c.oid=t.table_oid),
          (SELECT p.prosecdef AND p.prokind='f' AND p.prorettype='boolean'::regtype
            AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']::text[]
            AND has_function_privilege('service_role',p.oid,'EXECUTE')
            AND NOT EXISTS(SELECT FROM unnest(ARRAY['anon','authenticated']) r WHERE has_function_privilege(r,p.oid,'EXECUTE'))
            AND NOT EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x
              WHERE x.grantee NOT IN (p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role')))
            FROM pg_proc p,t WHERE p.oid=t.function_oid)
        ] contracts FROM t
    `);
    assert.deepEqual(row.defaults, [
        'auth:<none>', 'created_at:now()', 'endpoint:<none>', 'id:gen_random_uuid()',
        'p256dh:<none>', 'user_agent:<none>', 'user_id:<none>',
    ]);
    assert.deepEqual(row.contracts, [true, true, true, true, true, true]);
}
async function insertSubscription(client: Client, userId: string, endpoint: string, suffix: string,
    userAgent: string | null = 'runtime-agent', createdAt: Date | null = new Date('2026-07-25T00:00:00Z'),
): Promise<SubscriptionRow> {
    return one<SubscriptionRow>(client, `INSERT INTO public.push_subscriptions(${writeColumns})
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id,${writeColumns}`,
    [userId, endpoint, `p256dh-${suffix}`, `auth-${suffix}`, userAgent, createdAt]);
}
async function callCas(client: Client, row: SubscriptionRow,
    changes: Partial<SubscriptionRow> = {}): Promise<boolean> {
    const observed = { ...row, ...changes };
    const result = await one<{ deleted: boolean }>(client, functionCall, [
        observed.id, observed.user_id, observed.endpoint, observed.p256dh, observed.auth,
        observed.user_agent, observed.created_at]);
    return result.deleted;
}
async function expectDenied(client: Client, role: 'anon' | 'authenticated',
    text: string, values: unknown[]): Promise<void> {
    await client.query(`SET ROLE ${role}`);
    let code: string | undefined;
    try {
        await client.query(text, values);
    } catch (error: unknown) {
        code = pgFailure(error).code;
    } finally {
        await client.query('RESET ROLE');
    }
    assert.equal(code, '42501');
}
async function verifyBehavior(client: Client): Promise<void> {
    await client.query('INSERT INTO public.users (id) VALUES ($1), ($2)', [USER_A, USER_B]);
    const target = await insertSubscription(client, USER_A, 'https://push.test/shared', 'old');
    const sameUserDevice = await insertSubscription(client, USER_A, 'https://push.test/device-2', 'device-2');
    const otherUser = await insertSubscription(client, USER_B, target.endpoint, 'other-user');
    const observedParams = [target.id, target.user_id, target.endpoint, target.p256dh,
        target.auth, target.user_agent, target.created_at];
    for (const role of deniedRoles) {
        await expectDenied(client, role, functionCall, observedParams);
        await expectDenied(client, role, 'DELETE FROM public.push_subscriptions WHERE id=$1', [target.id]);
    }
    await client.query('SET ROLE service_role');
    const directDelete = await insertSubscription(client, USER_A, 'https://push.test/direct-delete', 'direct');
    assert.equal((await client.query('DELETE FROM public.push_subscriptions WHERE id=$1',
        [directDelete.id])).rowCount, 1);
    assert(target.created_at);
    for (const change of [
        { id: '20000000-0000-4000-8000-000000000001' },
        { user_id: USER_B }, { endpoint: 'https://push.test/stale' },
        { p256dh: 'stale-p256dh' }, { auth: 'stale-auth' },
        { user_agent: 'stale-agent' },
        { created_at: new Date(target.created_at.getTime() + 1_000) },
    ]) assert.equal(await callCas(client, target, change), false);
    assert.equal(await callCas(client, target), true);
    assert.equal(await callCas(client, target), false);
    const nullCreatedAt = await insertSubscription(client, USER_A,
        'https://push.test/null-created', 'null', null, null);
    assert.equal(await callCas(client, nullCreatedAt), true);
    const preserved = await one<{ count: number }>(client,
        'SELECT count(id)::int count FROM public.push_subscriptions');
    assert.equal(preserved.count, 2);
    const ids = await client.query<{ id: string }>('SELECT id FROM public.push_subscriptions ORDER BY id');
    assert.deepEqual(new Set(ids.rows.map((row) => row.id)), new Set([sameUserDevice.id, otherUser.id]));
    await client.query('RESET ROLE');
}
function deadline<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolvePromise, rejectPromise) => {
        const timer = setTimeout(
            () => rejectPromise(new Error('bounded PostgreSQL operation timed out')), 7_000);
        promise.then((value) => { clearTimeout(timer); resolvePromise(value); },
            (error: unknown) => { clearTimeout(timer); rejectPromise(error); });
    });
}
function settled<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
    return promise.then((value) => ({ value }), (error: unknown) => ({ error }));
}
async function waitForLock(client: Client, pid: number): Promise<void> {
    const expiresAt = Date.now() + 4_000;
    while (Date.now() < expiresAt) {
        const row = await one<{ waiting: boolean }>(client, `
            SELECT wait_event_type = 'Lock' AS waiting
            FROM pg_stat_activity WHERE pid = $1
        `, [pid]);
        if (row.waiting) return;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
    throw new Error('expected PostgreSQL lock wait was not observed');
}
async function transactionClient(database: string): Promise<Client> {
    const client = await connect(database); await client.query('SET ROLE service_role; BEGIN'); return client;
}
async function verifyUpdateFirstRace(monitor: Client, database: string): Promise<void> {
    await monitor.query('INSERT INTO public.users (id) VALUES ($1)', [USER_A]);
    const original = await insertSubscription(monitor, USER_A, 'https://push.test/race', 'old');
    const updater = await transactionClient(database);
    const cleanup = await transactionClient(database);
    let pendingCleanup: Promise<{ value?: { rows: Array<{ deleted: boolean }> }; error?: unknown }> | undefined;
    try {
        await updater.query('UPDATE public.push_subscriptions SET p256dh=$1 WHERE id=$2',
            ['p256dh-winner', original.id]);
        const cleanupPid = await one<{ pid: number }>(cleanup, 'SELECT pg_backend_pid() AS pid');
        pendingCleanup = settled(cleanup.query<{ deleted: boolean }>(functionCall, [
            original.id, original.user_id, original.endpoint, original.p256dh, original.auth,
            original.user_agent, original.created_at]));
        await waitForLock(monitor, cleanupPid.pid);
        await updater.query('COMMIT');
        const outcome = await deadline(pendingCleanup);
        assert.ifError(outcome.error);
        assert.equal(outcome.value?.rows[0]?.deleted, false);
        await cleanup.query('COMMIT');
        const winner = await one<{ p256dh: string }>(monitor,
            'SELECT p256dh FROM public.push_subscriptions WHERE id=$1', [original.id]);
        assert.equal(winner.p256dh, 'p256dh-winner');
    } finally {
        await Promise.allSettled([updater.query('ROLLBACK'), cleanup.query('ROLLBACK')]);
        if (pendingCleanup) await deadline(pendingCleanup).catch(() => undefined);
        await Promise.all([updater.end(), cleanup.end()]);
    }
}
async function verifyDeleteFirstRace(monitor: Client, database: string): Promise<void> {
    await monitor.query('INSERT INTO public.users (id) VALUES ($1)', [USER_A]);
    const original = await insertSubscription(monitor, USER_A, 'https://push.test/race', 'old');
    const cleanup = await transactionClient(database);
    const resubscribe = await transactionClient(database);
    let pendingWinner: Promise<{ value?: { rows: SubscriptionRow[] }; error?: unknown }> | undefined;
    try {
        assert.equal(await callCas(cleanup, original), true);
        const resubscribePid = await one<{ pid: number }>(resubscribe, 'SELECT pg_backend_pid() AS pid');
        pendingWinner = settled(resubscribe.query<SubscriptionRow>(`INSERT INTO public.push_subscriptions(${writeColumns})
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,endpoint) DO UPDATE SET
            p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,user_agent=EXCLUDED.user_agent,created_at=EXCLUDED.created_at
            RETURNING id,${writeColumns}`, [USER_A, original.endpoint, 'p256dh-winner', 'auth-winner',
            'winner-agent', new Date('2026-07-25T00:01:00.000Z')]));
        await waitForLock(monitor, resubscribePid.pid);
        await cleanup.query('COMMIT');
        const outcome = await deadline(pendingWinner);
        assert.ifError(outcome.error);
        await resubscribe.query('COMMIT');
        const winner = outcome.value?.rows[0];
        assert(winner);
        assert.notEqual(winner.id, original.id);
        const finalRows = await monitor.query<SubscriptionRow>(
            `SELECT id,${writeColumns} FROM public.push_subscriptions`);
        assert.equal(finalRows.rowCount, 1);
        assert.equal(finalRows.rows[0]?.p256dh, 'p256dh-winner');
        assert.equal(finalRows.rows[0]?.endpoint, original.endpoint);
    } finally {
        await Promise.allSettled([cleanup.query('ROLLBACK'), resubscribe.query('ROLLBACK')]);
        if (pendingWinner) await deadline(pendingWinner).catch(() => undefined);
        await Promise.all([cleanup.end(), resubscribe.end()]);
    }
}
const negativeFixtures: FailureFixture[] = [
    { name: 'id-default', sql: "ALTER TABLE public.push_subscriptions ALTER id SET DEFAULT '30000000-0000-4000-8000-000000000001'::uuid", code: 'P0001', marker: 'LL080: push subscription columns or defaults changed' },
    { name: 'created-at-default', sql: "ALTER TABLE public.push_subscriptions ALTER created_at SET DEFAULT '2000-01-01T00:00:00Z'::timestamptz", code: 'P0001', marker: 'LL080: push subscription columns or defaults changed' },
    { name: 'update-only', sql: `REVOKE INSERT (${writeColumns}) ON public.push_subscriptions FROM service_role`, code: 'P0001', marker: 'LL080: push subscription ACL changed' },
    { name: 'insert-only', sql: `REVOKE UPDATE (${writeColumns}) ON public.push_subscriptions FROM service_role`, code: 'P0001', marker: 'LL080: push subscription ACL changed' },
    { name: 'reversed-unique-order', sql: 'ALTER TABLE public.push_subscriptions DROP CONSTRAINT push_subscriptions_user_id_endpoint_key; ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (endpoint, user_id)', code: 'P0001', marker: 'LL080: push subscription keys or public.users FK changed' },
    { name: 'deferrable-non-immediate-unique', sql: 'ALTER TABLE public.push_subscriptions DROP CONSTRAINT push_subscriptions_user_id_endpoint_key; ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint) DEFERRABLE INITIALLY IMMEDIATE', code: 'P0001', marker: 'LL080: push subscription keys or public.users FK changed' },
    { name: 'invalid-index', sql: "UPDATE pg_catalog.pg_index SET indisvalid = false WHERE indexrelid = (SELECT conindid FROM pg_catalog.pg_constraint WHERE conrelid = 'public.push_subscriptions'::regclass AND contype = 'u')", code: 'P0001', marker: 'LL080: push subscription keys or public.users FK changed' },
    { name: 'not-ready-index', sql: "UPDATE pg_catalog.pg_index SET indisready = false WHERE indexrelid = (SELECT conindid FROM pg_catalog.pg_constraint WHERE conrelid = 'public.push_subscriptions'::regclass AND contype = 'u')", code: 'P0001', marker: 'LL080: push subscription keys or public.users FK changed' },
    { name: 'wrong-fk', sql: 'ALTER TABLE public.push_subscriptions DROP CONSTRAINT push_subscriptions_user_id_fkey; CREATE TABLE public.other_users (id uuid PRIMARY KEY); ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.other_users(id) ON DELETE CASCADE', code: 'P0001', marker: 'LL080: push subscription keys or public.users FK changed' },
    { name: 'wrong-owner', sql: 'ALTER TABLE public.push_subscriptions OWNER TO anon', code: 'P0001', marker: 'LL080: push subscription owner or RLS state changed' },
    { name: 'rls-disabled', sql: 'ALTER TABLE public.push_subscriptions DISABLE ROW LEVEL SECURITY', code: 'P0001', marker: 'LL080: push subscription owner or RLS state changed' },
    { name: 'force-rls', sql: 'ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY', code: 'P0001', marker: 'LL080: push subscription owner or RLS state changed' },
    { name: 'unexpected-policy', sql: 'CREATE POLICY unexpected_policy ON public.push_subscriptions USING (true)', code: 'P0001', marker: 'LL080: push subscription owner or RLS state changed' },
    { name: 'function-preexists', sql: 'CREATE FUNCTION public.delete_push_subscription_if_unchanged(uuid, uuid, text, text, text, text, timestamptz) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$', code: '42723', marker: 'delete_push_subscription_if_unchanged' },
];
async function main(): Promise<void> {
    loadMigrations(); validateConnection(); activeCase = 'bootstrap-connect';
    const admin = await connect('postgres');
    const createdRoles: string[] = [];
    try {
        activeCase = 'role-precondition'; await assertRolesAbsent(admin); await createTestRoles(admin, createdRoles);
        await runCase('preexisting-role-rejection', () => expectFixedFailure(
            assertRolesAbsent(admin), 'PostgreSQL runtime test roles already exist'));
        const systemMods = await one<{ setting: string }>(admin,
            "SELECT current_setting('allow_system_table_mods') setting");
        assert.equal(systemMods.setting, 'on');
        await runCase('catalog-success', () => withFreshDatabase(admin,
            async (client) => { await client.query(casMigration); await verifyCatalog(client) }));
        for (const fixture of negativeFixtures) {
            await runCase(`negative-${fixture.name}`, () => withFreshDatabase(admin,
                async (client) => { await client.query(fixture.sql); await expectMigrationFailure(client, fixture) }));
        }
        await runCase('function-behavior', () => withFreshDatabase(admin,
            async (client) => { await client.query(casMigration); await verifyBehavior(client) }));
        await runCase('race-update-first', () => withFreshDatabase(admin,
            async (client, database) => { await client.query(casMigration); await verifyUpdateFirstRace(client, database) }));
        await runCase('race-delete-first', () => withFreshDatabase(admin,
            async (client, database) => { await client.query(casMigration); await verifyDeleteFirstRace(client, database) }));
        await runCase('rollback', () => withFreshDatabase(admin, async (client) => {
            await client.query(casMigration);
            await client.query('INSERT INTO public.users (id) VALUES ($1)', [USER_A]);
            await insertSubscription(client, USER_A, 'https://push.test/rollback', 'rollback');
            await client.query(rollbackSql);
            const result = await one<{ function_absent: boolean; table_intact: boolean; rows_intact: boolean }>(client,
                `SELECT to_regprocedure('public.delete_push_subscription_if_unchanged(uuid,uuid,text,text,text,text,timestamptz)')
                  IS NULL function_absent,to_regclass('public.push_subscriptions') IS NOT NULL table_intact,
                  (SELECT count(id)=1 FROM public.push_subscriptions) rows_intact`);
            assert.deepEqual(result, { function_absent: true, table_intact: true, rows_intact: true });
        }));
        await runCase('partial-failure-cleanup', async () => {
            let failedDatabase = '';
            await expectFixedFailure(withFreshDatabase(admin, async (client, database) => {
                await client.query('SELECT 1'); failedDatabase = database;
                throw new Error('PostgreSQL runtime injected partial failure');
            }), 'PostgreSQL runtime injected partial failure');
            const database = await one<{ absent: boolean }>(admin,
                'SELECT NOT EXISTS(SELECT FROM pg_database WHERE datname=$1) absent', [failedDatabase]);
            assert.equal(database.absent, true); await dropTestRoles(admin, createdRoles); await assertRolesAbsent(admin);
        });
    } finally {
        activeCase = 'cleanup';
        try { await dropTestRoles(admin, createdRoles) } finally { await admin.end() }
    }
}
main().catch(() => { console.error(`ERR: ${activeCase}`); process.exitCode = 1 });
