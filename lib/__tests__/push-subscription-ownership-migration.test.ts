import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const migration = read('migrations/20260726_create_push_subscription_ownership.sql');
const readme = read('README.md');
const instructions = read('.github/copilot-instructions.md');
const runtime = ['app/api/push/subscribe/route.ts', 'lib/api/web-push.ts', 'public/sw.js']
    .map(read).join('\n');
const body = (name: string): string => migration.match(new RegExp(
    `CREATE FUNCTION public\\.${name}[\\s\\S]+?AS \\$function\\$([\\s\\S]+?)\\$function\\$;`,
))?.[1] ?? '';
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const canonicalKey = 'https://push.example.test/v1/~device?token=A';
const aliasVectors = [
    ['https://PUSH.EXAMPLE.TEST/v1/~device?token=A', canonicalKey],
    ['https://push.example.test:443/v1/~device?token=A', canonicalKey],
    ['https://push.example.test/v1/%7Edevice?token=A', canonicalKey],
    ['https://push.example.test/v1/~device?token=A#queued', canonicalKey],
] as const;

describe('LL-085 push ownership Layer 1 migration', () => {
    it('migration bytes_確定後_SHA-256とCAS後の順序を維持する', () => {
        expect(digest(migration)).toBe('918c6f9a6aefaf556d60c241f2f6db0f59037192b484e55f4b86e39795aa6b51');
        expect(migration).toMatch(/^BEGIN; SET LOCAL search_path = '';/);
        expect(migration).toMatch(/COMMIT;\s*$/);
    });

    it('legacy rows_起動時_ownerを推測せずcanonical authority外へ隔離する', () => {
        const table = migration.match(/CREATE TABLE public\.push_subscription_ownership \(([\s\S]+?)\n\);/)?.[1] ?? '';
        expect(table).toContain('endpoint_digest bytea NOT NULL');
        expect(table).toContain('subscription_id uuid');
        expect(table).toContain('UNIQUE (subscription_id)');
        expect(table).not.toMatch(/\bendpoint\s+text\b/i);
        expect(migration.slice(migration.indexOf('DO $legacy_quarantine$'), migration.indexOf('CREATE FUNCTION public.save')))
            .not.toContain('INSERT INTO public.push_subscription_ownership');
        expect(migration).toContain('quarantined % legacy push rows without canonical ownership');
    });

    it('canonical key_aliasを同一digestへ束縛しreserved materialを分離する', () => {
        expect(new Set(aliasVectors.map(([raw]) => raw)).size).toBe(4);
        expect(new Set(aliasVectors.map(([, key]) => key))).toEqual(new Set([canonicalKey]));
        expect(new Set(aliasVectors.map(([, key]) => digest(key))).size).toBe(1);
        expect(digest('https://push.example.test/v1/a%2Fb'))
            .not.toBe(digest('https://push.example.test/v1/a/b'));
        for (const rpc of [body('save_push_subscription_with_generation'), body('release_push_subscription_with_generation')]) {
            expect(rpc).toContain("sha256(pg_catalog.convert_to(p_ownership_key, 'UTF8'))");
            expect(rpc).not.toContain("convert_to(p_endpoint, 'UTF8')");
        }
    });

    it('save release_current subscriptionとgeneration versionを原子的に更新する', () => {
        const save = body('save_push_subscription_with_generation');
        const release = body('release_push_subscription_with_generation');
        expect(save.indexOf('pg_advisory_xact_lock')).toBeLessThan(save.indexOf('FOR UPDATE OF app_user'));
        expect(save.indexOf('FOR UPDATE OF app_user')).toBeLessThan(save.indexOf('ownership.endpoint_digest = v_digest FOR UPDATE'));
        expect(save).toContain('IF v_raw_count >= 20');
        expect(save).toContain('subscription_id = v_subscription.id');
        expect(save.match(/recipient_generation = pg_catalog\.gen_random_uuid\(\)/g)).toHaveLength(1);
        expect(release).toContain('v_authority.ownership_version IS DISTINCT FROM p_ownership_version');
        expect(release).toContain('IF NOT FOUND OR v_subscription.user_id IS DISTINCT FROM p_user_id');
        expect(release).toContain('v_subscription.endpoint IS DISTINCT FROM p_endpoint');
        expect(release).toContain('SET owner_user_id = NULL, subscription_id = NULL');
    });

    it('read RPC_最大20件をexact owner key subscription一致だけ返し状態を変更しない', () => {
        const readRpc = body('read_push_subscription_generations');
        for (const value of ['cardinality(p_subscription_ids) NOT BETWEEN 1 AND 20',
            'FROM ROWS FROM (',
            'ownership.owner_user_id = p_user_id', 'ownership.subscription_id = requested.subscription_id',
            'subscription.id = requested.subscription_id AND subscription.user_id = p_user_id',
            'ORDER BY ownership.subscription_id']) {
            expect(readRpc).toContain(value);
        }
        expect(readRpc).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b|gen_random_uuid/i);
        expect(migration).toContain('TABLE(subscription_id uuid, recipient_generation uuid, ownership_version bigint)');
    });

    it('security layers_service role RPCのみとLayer2 3 blockerを維持する', () => {
        expect(migration.match(/LANGUAGE plpgsql (?:STABLE )?SECURITY DEFINER SET search_path = ''/g)).toHaveLength(3);
        expect(migration.match(/GRANT EXECUTE ON FUNCTION public\./g)).toHaveLength(3);
        expect(migration).not.toMatch(/CREATE\s+POLICY|GRANT\s+.+\s+ON\s+TABLE/i);
        for (const value of ['getPushEndpointOwnershipKey', 'generation authorityがないlegacy row',
            'foreign/missing/stale', 'Layer 2のruntime PostgreSQL検証', 'MERGE BLOCKED']) {
            expect(readme).toContain(value);
        }
        expect(instructions).toContain('### LL-085:');
        expect(runtime).not.toMatch(/push_subscription_ownership|read_push_subscription_generations/);
    });
});
