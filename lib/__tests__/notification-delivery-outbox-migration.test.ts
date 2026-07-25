import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const migrationPath = 'migrations/20260725_create_notification_delivery_outbox.sql';
const migration = read(migrationPath);
const readme = read('README.md');
const instructions = read('.github/copilot-instructions.md');
const runtimeHarness = read('scripts/test-notification-outbox-postgres.ts'), validateWorkflow = read('.github/workflows/validate.yml'), packageManifest = read('package.json');
const runtimeSources = ['app', 'lib'].flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((path) => /\.[jt]sx?$/.test(path) && !/\.(test|spec)\.[jt]sx?$/.test(path))
        .map((path) => read(join(root, path))));
const body = (name: string): string => migration.match(new RegExp(
    `CREATE FUNCTION public\\.${name}[\\s\\S]+?AS \\$function\\$([\\s\\S]+?)\\$function\\$;`,
))?.[1] ?? '';
describe('notification delivery outbox Layer 1 migration', () => {
    it('migration bytes_確定後_SHA-256契約を維持する', () => {
        expect(createHash('sha256').update(migration).digest('hex')).toBe('d27236e1621447d53f02b10454ec67c09df534135090044bad135aff3353c9c6');
        expect(migration).toMatch(/^BEGIN;\nSET LOCAL search_path = '';/);
        expect(migration).toMatch(/COMMIT;\s*$/);
    });
    it('schema_通知occurrenceをPII最小の一意台帳として保持する', () => {
        for (const value of [
            'CREATE TABLE public.notification_delivery_outbox',
            'UNIQUE (notification_type, occurrence_key, user_id)',
            "notification_type = 'step-reminder'", "notification_type = 'weekly-summary'",
            'REFERENCES public.users(id) ON DELETE CASCADE',
            "state text NOT NULL DEFAULT 'pending'", 'attempt_count BETWEEN 0 AND 5',
            "interval '5 minutes'", "interval '90 days'", "pg_catalog.to_date(occurrence_key",
            "pg_catalog.to_date(p_occurrence_key",
        ]) expect(migration).toContain(value);
        expect(migration).not.toMatch(/\b(endpoint|payload|email|image|message_body)\b/i);
        expect(migration).not.toContain('auth.users');
        expect(migration).not.toMatch(/CREATE\s+SEQUENCE/i);
    });
    it('claim_安定したuser lock後に最大20件を新規または期限切れだけclaimする', () => {
        const claim = body('claim_notification_delivery_outbox');
        const userLock = claim.indexOf('ORDER BY app_user.id FOR UPDATE OF app_user');
        const ledgerLock = claim.indexOf('ORDER BY ledger.user_id FOR UPDATE');
        expect(claim).toContain('pg_catalog.cardinality(p_user_ids) NOT BETWEEN 1 AND 20');
        expect(claim).toContain('ON CONFLICT ON CONSTRAINT notification_delivery_outbox_occurrence_user_key');
        expect(userLock).toBeGreaterThan(-1);
        expect(ledgerLock).toBeGreaterThan(userLock);
        expect(claim.indexOf('UPDATE public.notification_delivery_outbox AS ledger')).toBeGreaterThan(ledgerLock);
        expect(claim).toMatch(/ledger\.state = 'pending'[\s\S]+ledger\.state = 'claimed'[\s\S]+lease_until <= v_now/);
        expect(claim).toContain('attempt_count = ledger.attempt_count + 1');
        expect(claim).toContain('ORDER BY ledger.user_id LIMIT 20');
        expect(migration).toMatch(/RETURNS TABLE \(user_id uuid, claim_token uuid\)/);
    });
    it('completion_同一tokenを冪等化しreleaseと期限切れtokenをfail closedにする', () => {
        const complete = body('complete_notification_delivery_outbox');
        const release = body('release_notification_delivery_outbox');
        for (const rpc of [complete, release]) {
            expect(rpc.indexOf('FOR UPDATE OF app_user')).toBeGreaterThan(-1);
            expect(rpc.indexOf('FOR UPDATE OF app_user')).toBeLessThan(rpc.indexOf('FOR UPDATE;'));
            expect(rpc).toContain('v_row.lease_owner IS DISTINCT FROM p_lease_owner');
            expect(rpc).toContain('v_row.claim_token IS DISTINCT FROM p_claim_token');
            expect(rpc).toContain('v_row.lease_until <= v_now');
        }
        expect(complete).toMatch(/v_row\.state = 'completed'[\s\S]+IS NOT DISTINCT FROM p_claim_token/);
        expect(release).toContain("CASE WHEN v_row.attempt_count = 5 THEN 'failed' ELSE 'pending' END");
        expect(release).toContain('last_failed_at = v_now');
        expect(complete).toContain("retain_until = v_now + interval '90 days'");
    });
    it('security_catalog_既知形状以外を拒否しservice_roleへRPCだけを許可する', () => {
        for (const value of [
            'LL083: notification outbox prerequisites are unavailable',
            'LL083: notification outbox columns or defaults changed',
            'LL083: notification outbox keys changed',
            'LL083: notification outbox owner, RLS, or ACL changed',
            "ALTER TABLE public.notification_delivery_outbox OWNER TO postgres",
            'ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY',
            "procedure.proconfig IS DISTINCT FROM ARRAY['search_path=\"\"']::text[]", "pg_catalog.pg_get_indexdef(index_relation.oid, 1, true) = 'retain_until'", "pg_catalog.pg_get_indexdef(index_relation.oid, 2, true) = 'id'", "pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid) = '(state = ANY (ARRAY[''completed''::text, ''failed''::text]))'", "pg_catalog.pg_get_function_result(functions[1]) IS DISTINCT FROM 'TABLE(user_id uuid, claim_token uuid)'", "pg_catalog.pg_get_function_result(functions[2]) IS DISTINCT FROM 'boolean'", "pg_catalog.pg_get_function_result(functions[3]) IS DISTINCT FROM 'boolean'",
        ]) expect(migration).toContain(value);
        expect(migration.match(/LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''/g)).toHaveLength(3);
        expect(migration.match(/GRANT EXECUTE ON FUNCTION public\./g)).toHaveLength(3);
        expect(migration).not.toMatch(/CREATE\s+POLICY|GRANT\s+.+\s+ON\s+TABLE/i);
    });

    it('layers_運用文書がruntime必須と未配線とrollback順を固定する', () => {
        expect(readme).toContain('通知配信outboxのclean 3-layer');
        expect(readme).toContain('Layer 2のruntime PostgreSQL検証');
        expect(readme).toContain('production適用には明示承認が必要');
        expect(readme).toContain('completeは通知結果が契約を満たした場合だけ');
        expect(readme).toContain('release→complete→claim→index→table');
        expect(instructions).toContain('### LL-083: 通知送信の再試行をHTTP応答だけで管理すると成功済みユーザーへ再送する');
        expect(runtimeSources.join('\n')).not.toMatch(/notification_delivery_outbox/);
    });
    it('runtime_Layer 2が固定migrationとloopback CIだけを検証する', () => {
        expect(packageManifest).toContain('"test:postgres:notification-outbox": "tsx scripts/test-notification-outbox-postgres.ts"');
        expect(runtimeHarness).toContain(`const MIGRATION_SHA256 = '${createHash('sha256').update(migration).digest('hex')}'`);
        expect(runtimeHarness.indexOf('loadMigration();')).toBeLessThan(runtimeHarness.indexOf("connect('postgres')"));
        for (const value of ["env.UCFITNESS_POSTGRES_RUNTIME_TEST !== '1'", "url.pathname !== '/postgres'", 'DATABASE_PATTERN', "run('negative-timeline-clause'"]) expect(runtimeHarness).toContain(value);
        for (const value of ['run: npm run test:postgres:notification-outbox', 'NOTIFICATION_OUTBOX_POSTGRES_URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres']) expect(validateWorkflow).toContain(value);
    });
});
