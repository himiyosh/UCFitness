import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const migrationPath = 'migrations/20260726_create_push_subscription_ownership.sql';
const migration = read(migrationPath);
const readme = read('README.md');
const instructions = read('.github/copilot-instructions.md');
const body = (name: string): string => migration.match(new RegExp(
    `CREATE FUNCTION public\\.${name}[\\s\\S]+?AS \\$function\\$([\\s\\S]+?)\\$function\\$;`,
))?.[1] ?? '';
const runtimeSources = ['app', 'lib', 'hooks', 'components'].flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((path) => /\.[jt]sx?$/.test(path) && !/\.(test|spec)\.[jt]sx?$/.test(path))
        .map((path) => read(join(root, path))))
    .concat(read('public/sw.js'));

describe('LL-085 push subscription ownership Layer 1 migration', () => {
    it('migration bytes_確定後_SHA-256とCAS後の順序を維持する', () => {
        expect(createHash('sha256').update(migration).digest('hex')).toBe('5b2a04f62cfa73f1f8a7eec26474721b292a3f7629b4d164493169ab58678285');
        expect(migration).toMatch(/^BEGIN; SET LOCAL search_path = '';/);
        expect(migration).toMatch(/COMMIT;\s*$/);
    });

    it('backfill_暗号学的digestだけを保持し曖昧なlegacy所有者を隔離する', () => {
        const table = migration.match(
            /CREATE TABLE public\.push_subscription_ownership \(([\s\S]+?)\n\);/,
        )?.[1] ?? '';
        for (const value of [
            'endpoint_digest bytea NOT NULL', 'owner_user_id uuid',
            'recipient_generation uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid()',
            'ownership_version bigint NOT NULL DEFAULT 1',
            'REFERENCES public.users(id) ON DELETE CASCADE',
            'CHECK (pg_catalog.octet_length(endpoint_digest) = 32)',
            "pg_catalog.sha256(pg_catalog.convert_to(subscription.endpoint, 'UTF8'))",
            'pg_catalog.count(DISTINCT subscription.user_id) = 1',
            'THEN pg_catalog.min(subscription.user_id::text)::uuid END',
            'WHERE owner_user_id IS NULL',
        ]) expect(migration).toContain(value);
        expect(table).not.toMatch(/\bendpoint\s+text\b/i);
        expect(migration).not.toContain('auth.users');
        expect(migration).toMatch(/RAISE NOTICE 'LL085: quarantined % ambiguous push endpoint digests', quarantined_count/);
    });

    it('save_同一endpointと関係userだけをlockしraw20件とgeneration移転を原子的に守る', () => {
        const save = body('save_push_subscription_with_generation');
        const endpointLock = save.indexOf('pg_advisory_xact_lock');
        const userLock = save.indexOf('ORDER BY app_user.id FOR UPDATE OF app_user');
        const authorityLock = save.indexOf('ownership.endpoint_digest = v_digest FOR UPDATE');
        const rowLock = save.indexOf('subscription.endpoint = p_endpoint FOR UPDATE');
        expect(endpointLock).toBeGreaterThan(-1);
        expect(userLock).toBeGreaterThan(endpointLock);
        expect(authorityLock).toBeGreaterThan(userLock);
        expect(rowLock).toBeGreaterThan(authorityLock);
        expect(save).toContain('IF NOT v_existing THEN');
        expect(save).toContain('IF v_raw_count >= 20');
        expect(save).toContain('subscription.user_id <> p_user_id');
        expect(save).toContain('v_authority.owner_user_id IS DISTINCT FROM p_user_id');
        expect(save).toContain('recipient_generation = pg_catalog.gen_random_uuid()');
        expect(save).toMatch(/ELSE\s+UPDATE public\.push_subscription_ownership[\s\S]+SET ownership_version = ownership\.ownership_version \+ 1, updated_at = v_now/);
        expect(save.match(/recipient_generation = pg_catalog\.gen_random_uuid\(\)/g)).toHaveLength(1);
        expect(migration).toContain('subscription_id uuid, stored_user_id uuid');
    });

    it('release_現在ownerとgenerationとversionだけを解除し次世代へ回転する', () => {
        const release = body('release_push_subscription_with_generation');
        expect(release.indexOf('pg_advisory_xact_lock')).toBeLessThan(release.indexOf('FOR UPDATE OF app_user'));
        expect(release.indexOf('FOR UPDATE OF app_user')).toBeLessThan(release.indexOf('ownership.endpoint_digest = v_digest FOR UPDATE'));
        expect(release).toContain(
            'v_authority.recipient_generation IS DISTINCT FROM p_recipient_generation',
        );
        expect(release).toContain('v_authority.ownership_version IS DISTINCT FROM p_ownership_version');
        expect(release).toContain('SET owner_user_id = NULL');
        expect(release).toContain('recipient_generation = pg_catalog.gen_random_uuid()');
        expect(release).toContain('ownership_version = ownership.ownership_version + 1');
    });

    it('security_catalog_既知形状をfail closedにしservice_roleへRPCだけを許可する', () => {
        for (const value of [
            'LL085: push subscription schema changed', 'LL085: push subscription keys changed',
            'LL085: push subscription ACL changed', 'LL085: push ownership columns changed',
            'LL085: push ownership keys changed', 'LL085: push ownership table security changed',
            "procedure.proconfig IS DISTINCT FROM ARRAY['search_path=\"\"']::text[]",
            "has_any_column_privilege(\n            'service_role', subscriptions_table, 'REFERENCES')",
            'ALTER TABLE public.push_subscription_ownership ENABLE ROW LEVEL SECURITY',
            "pg_catalog.pg_get_function_result(functions[2]) IS DISTINCT FROM 'boolean'",
        ]) expect(migration).toContain(value);
        expect(migration.indexOf('LOCK TABLE public.users')).toBeLessThan(migration.indexOf('LOCK TABLE public.push_subscriptions'));
        expect(migration.slice(0, migration.indexOf('CREATE TABLE')).match(/privilege\.grantee NOT IN/g)).toHaveLength(3);
        expect(migration.match(/LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''/g)).toHaveLength(2);
        expect(migration.match(/GRANT EXECUTE ON FUNCTION public\./g)).toHaveLength(2);
        expect(migration).not.toMatch(/CREATE\s+POLICY|GRANT\s+.+\s+ON\s+TABLE/i);
    });

    it('layers_設計文書がruntimeとgeneration binding前の適用禁止を固定する', () => {
        for (const value of [
            'PR #300 / #301', 'Layer 2のruntime PostgreSQL検証',
            'recipient_generation', 'Service Worker', 'account switch',
            'direct write権限', 'ACCESS EXCLUSIVE', '再同期', 'MERGE BLOCKED',
        ]) expect(readme).toContain(value);
        expect(instructions).toContain('### LL-085:');
        expect(runtimeSources.join('\n')).not.toMatch(
            /push_subscription_ownership|save_push_subscription_with_generation/,
        );
    });
});
