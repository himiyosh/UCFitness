import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readRepositoryFile = (path: string): string =>
    readFileSync(join(process.cwd(), path), 'utf8');

const migration = readRepositoryFile(
    'migrations/20260720_harden_push_subscriptions_rls.sql',
);
const casMigration = readRepositoryFile(
    'migrations/20260725_delete_push_subscription_if_unchanged.sql',
);
const readme = readRepositoryFile('README.md');
const runtimeHarness = readRepositoryFile('scripts/test-push-cas-postgres.ts');
const validateWorkflow = readRepositoryFile('.github/workflows/validate.yml');
const packageManifest = readRepositoryFile('package.json');
const phaseOneMigration = readRepositoryFile(
    'migrations/20260720_harden_api_keys_rls.sql',
);
const subscribeRoute = readRepositoryFile('app/api/push/subscribe/route.ts');
const ownershipWrapper = readRepositoryFile('lib/services/push-subscription-ownership.ts');
const deliverySources = [
    'app/api/push/send/route.ts', 'app/api/cron/step-reminder/route.ts',
    'app/api/cron/weekly-summary/route.ts', 'lib/services/badge-allocator.ts',
    'lib/api/web-push.ts',
].map(readRepositoryFile);
const browserSources = [
    'hooks/useWebPush.ts', 'components/PushNotificationManager.tsx',
    'components/PushSubscriptionButton.tsx',
].map(readRepositoryFile);
const sha256 = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

describe('F016 push_subscriptions RLS migration', () => {
    it('Phase 1を維持しPhase 2はpush_subscriptionsだけを対象にする', () => {
        expect(phaseOneMigration.match(
            /ALTER TABLE public\.([a-z_]+) ENABLE ROW LEVEL SECURITY/i,
        )?.[1]).toBe('api_keys');
        expect(migration.match(
            /ALTER TABLE public\.([a-z_]+) ENABLE ROW LEVEL SECURITY/i,
        )?.[1]).toBe('push_subscriptions');
        expect(migration).not.toContain('ALTER TABLE public.api_keys');
        expect(sha256(migration)).toBe(
            '5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66',
        );
    });

    it('既知schema、FK、主キー、upsert用unique制約をfail closedで検証する', () => {
        expect(migration).toContain("to_regclass('public.push_subscriptions')");
        expect(migration).toContain("to_regclass('public.users')");
        expect(migration).toContain("('id', 'uuid', true)");
        expect(migration).toContain("('user_agent', 'text', false)");
        expect(migration).toContain("('created_at', 'timestamp with time zone', false)");
        expect(migration).toContain('attribute.attnotnull <> expected.not_null');
        expect(migration).toContain("attgenerated = ''");
        expect(migration).toContain("constraint_record.confdeltype = 'c'");
        expect(migration).toContain("constraint_record.contype = 'f'");
        expect(migration).toContain('constraint_record.convalidated');
        expect(migration).toContain("contype = 'p'");
        expect(migration).toContain("contype = 'u'");
        expect(migration).toContain('pg_catalog.cardinality(conkey) = 2');
        expect(migration).toContain('= ANY(conkey)');
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(migration).toContain("SET LOCAL search_path = ''");
        expect(migration).toContain('LOCK TABLE public.push_subscriptions IN ACCESS EXCLUSIVE MODE');
    });

    it('policyなしRLSと安全なowner、service_role BYPASSRLSを要求する', () => {
        expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
        expect(migration).toContain('pg_catalog.pg_policy');
        expect(migration).toContain('rolbypassrls');
        expect(migration).toContain('table_owner');
        expect(migration).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
        expect(migration).not.toMatch(/CREATE\s+POLICY/i);
        expect(migration).not.toMatch(/auth\.uid\s*\(/i);
        expect(migration).not.toMatch(/auth\.users/i);
    });

    it('通常roleを剥奪しservice_roleへ実CRUDだけを付与する', () => {
        expect(migration).toMatch(
            /REVOKE ALL PRIVILEGES ON TABLE public\.push_subscriptions\s+FROM PUBLIC, anon, authenticated, service_role/i,
        );
        expect(migration).toMatch(
            /GRANT SELECT \(\s*id, user_id, endpoint, p256dh, auth, user_agent, created_at\s*\)/i,
        );
        expect(migration).toMatch(
            /GRANT INSERT \(\s*user_id, endpoint, p256dh, auth, user_agent, created_at\s*\)/i,
        );
        expect(migration).toMatch(
            /GRANT UPDATE \(\s*user_id, endpoint, p256dh, auth, user_agent, created_at\s*\)/i,
        );
        expect(migration).toContain(
            'GRANT DELETE ON TABLE public.push_subscriptions TO service_role',
        );
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
            expect(migration).toContain(`has_table_privilege('service_role', target_table, '${privilege}')`);
        }
        expect(migration).not.toMatch(/GRANT (TRUNCATE|REFERENCES|TRIGGER|ALL)/i);
    });

    it('対象table所有sequenceだけをcatalogで特定しUSAGEだけを許可する', () => {
        expect(migration).toContain("sequence_class.relkind = 'S'");
        expect(migration).toContain('dependency.refobjid = target_table');
        expect(migration).toContain("dependency.deptype IN ('a', 'i')");
        expect(migration).toContain("dependency.classid = 'pg_catalog.pg_class'::regclass");
        expect(migration).toContain("dependency.refclassid = 'pg_catalog.pg_class'::regclass");
        expect(migration).toContain('dependency.refobjsubid > 0');
        expect(migration).toContain('GRANT USAGE ON SEQUENCE %s TO service_role');
        expect(migration).not.toMatch(/GRANT (SELECT|UPDATE|ALL).*ON SEQUENCE/i);
    });

    it('購読writeをownership RPCへ限定しbrowserはAPIだけを呼ぶ', () => {
        expect(subscribeRoute).toContain("from '@/lib/services/push-subscription-ownership'");
        expect(ownershipWrapper).toContain('supabaseAdmin.rpc(name, args)');
        expect(ownershipWrapper).toContain(".from('push_subscriptions')");
        for (const writer of ['.upsert(', '.insert(', '.update(', '.delete(']) {
            expect(subscribeRoute).not.toContain(writer);
            expect(ownershipWrapper).not.toContain(writer);
        }
        expect(deliverySources.every((source) =>
            source.includes(".from('push_subscriptions')")
            && source.includes('supabaseAdmin'))).toBe(true);
        expect(browserSources.every((source) =>
            source.includes('@/lib/push-recipient-state')
            && !source.includes(".from('push_subscriptions')")
            && !source.includes('@/lib/supabase'))).toBe(true);
        const browserHelper = readRepositoryFile('lib/push-recipient-state.ts');
        expect(browserHelper.includes('/api/push/subscribe') && !browserHelper.includes('@/lib/supabase')).toBe(true);
    });

    it('F001を変更せずF016をin-progressに維持する', () => {
        const ledger = readRepositoryFile('.github/ucfitness-features.json');
        const statusFor = (id: string): string | undefined =>
            ledger.match(new RegExp(`"id": "${id}"[\\s\\S]*?"status": "([^"]+)"`))?.[1];

        expect(statusFor('F001')).toBe('not-started');
        expect(statusFor('F016')).toBe('in-progress');
    });
});

describe('LL-080 push subscription CAS migration', () => {
    it('migration_内容が同一の場合_SHA-256契約を維持する', () => {
        expect(sha256(casMigration)).toBe(
            '8906b26cc66ccdceeb13703320740ce9c5e264cb311371d650c550500ab9cbd0',
        );
    });

    it('catalog preflight_既知schemaと権限が異なる場合_fail closedにする', () => {
        for (const evidence of [
            "SET LOCAL search_path = ''",
            'LOCK TABLE public.push_subscriptions IN ACCESS EXCLUSIVE MODE',
            "'created_at:timestamp with time zone:false:true'",
            "'id:uuid:true:true'",
            "'created_at:now()'",
            "'id:gen_random_uuid()'",
            "confrelid = users_table",
            "confdeltype = 'c'",
            'NOT constraint_record.condeferrable',
            'NOT constraint_record.condeferred',
            'backing_index.indisunique',
            'backing_index.indisvalid',
            'backing_index.indisready',
            'backing_index.indimmediate',
            'backing_index.indnkeyatts = 2',
            'backing_index.indnatts = 2',
            "owner.rolname = 'postgres'",
            'relforcerowsecurity',
            'pg_catalog.pg_policy',
            "expected.column_name, 'SELECT'",
            "expected.column_name, 'INSERT'",
            "expected.column_name, 'UPDATE'",
            "has_any_column_privilege('service_role', target_table, 'REFERENCES')",
        ]) {
            expect(casMigration).toContain(evidence);
        }
        expect(casMigration).toMatch(
            /constraint_record\.conkey = ARRAY\[[\s\S]+attname = 'user_id'[\s\S]+attname = 'endpoint'/,
        );
        expect(casMigration).toMatch(
            /aclexplode\(attribute\.attacl\)[\s\S]+attribute\.attnum > 0[\s\S]+NOT attribute\.attisdropped/,
        );
        expect(casMigration).not.toMatch(/COALESCE\(\s*attribute\.attacl/);
        expect(casMigration).not.toMatch(/auth\.users|CREATE\s+POLICY/i);
    });

    it('row version_対象行が変わらない場合だけ_lock後に削除する', () => {
        const functionBody = casMigration.match(
            /CREATE FUNCTION public\.delete_push_subscription_if_unchanged[\s\S]+?AS \$function\$([\s\S]+?)\$function\$;/,
        )?.[1] ?? '';
        const lockIndex = functionBody.indexOf('FOR UPDATE;');
        const compareIndex = functionBody.indexOf('observed_row.user_id IS NOT DISTINCT FROM p_user_id');
        const deleteIndex = functionBody.indexOf('DELETE FROM public.push_subscriptions');

        expect(lockIndex).toBeGreaterThan(-1);
        expect(compareIndex).toBeGreaterThan(lockIndex);
        expect(deleteIndex).toBeGreaterThan(compareIndex);
        expect(functionBody).toMatch(
            /FROM public\.push_subscriptions AS subscription\s+WHERE subscription\.id = p_id\s+FOR UPDATE;/,
        );
        expect(functionBody).toMatch(
            /DELETE FROM public\.push_subscriptions AS subscription\s+WHERE subscription\.id = p_id;/,
        );
        for (const field of [
            'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at',
        ]) {
            expect(functionBody).toContain(
                `observed_row.${field} IS NOT DISTINCT FROM p_${field}`,
            );
        }
        expect(functionBody).toContain('IF NOT FOUND THEN RETURN false; END IF;');
        expect(functionBody.match(/RETURN false;/g)).toHaveLength(2);
        expect(functionBody).toContain('RETURN FOUND;');
    });

    it('RPC security_既存関数または属性不一致の場合_transactionを中止する', () => {
        expect(casMigration).toContain(
            "LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''",
        );
        expect(casMigration).not.toContain('CREATE OR REPLACE FUNCTION');
        expect(casMigration).toMatch(/\) OWNER TO postgres;/);
        expect(casMigration).toMatch(
            /\) FROM PUBLIC, anon, authenticated, service_role;/,
        );
        expect(casMigration).toMatch(/\) TO service_role;/);
        expect(casMigration).toContain(
            "procedure.proname = 'delete_push_subscription_if_unchanged') <> 1",
        );
        expect(casMigration).toContain(
            "procedure.proconfig = ARRAY['search_path=\"\"']::text[]",
        );
    });

    it('runtime検証_Layer 2へ分離した場合_static契約だけではPASSを主張しない', () => {
        expect(readme).toContain('Layer 2のruntime検証');
        expect(readme).toContain('production適用には明示承認が必要');
        expect(readme).toContain(
            'DROP FUNCTION public.delete_push_subscription_if_unchanged',
        );
    });

    it('CAS runtime jobが固定imageとloopback test-only commandだけを使用する', () => {
        expect(packageManifest).toContain('"test:postgres:push-cas": "tsx scripts/test-push-cas-postgres.ts"');
        expect(runtimeHarness).toContain(`const CAS_MIGRATION_SHA256 = '${sha256(casMigration)}'`);
        expect(runtimeHarness.indexOf('loadMigrations();')).toBeLessThan(runtimeHarness.indexOf("connect('postgres')"));
        expect(runtimeHarness).toContain("process.env.UCFITNESS_POSTGRES_RUNTIME_TEST !== '1'");
        expect(runtimeHarness).toContain("url.pathname !== '/postgres'");
        expect(runtimeHarness).toContain("url.username !== 'postgres'");
        expect(runtimeHarness).toContain('TEST_DATABASE_PATTERN');
        expect(runtimeHarness).toContain("runCase('preexisting-role-rejection'");
        expect(runtimeHarness).toContain("runCase('partial-failure-cleanup'");
        expect(runtimeHarness).toContain("name: 'force-rls'");
        expect(runtimeHarness).toContain('SET allow_system_table_mods=on');
        expect(validateWorkflow).toContain('postgres:16.13-bookworm@sha256:472efd9a66f2b2f1a5aeb18b28de74332e6ef88c2b93a1a5d812fb6db67a5f60');
        expect(validateWorkflow).toContain('"127.0.0.1:5432:5432"');
        expect(validateWorkflow).toContain('UCFITNESS_POSTGRES_RUNTIME_TEST: "1"');
        expect(validateWorkflow).toContain('PUSH_CAS_POSTGRES_URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres');
        expect(validateWorkflow).toContain('run: npm run test:postgres:push-cas');
        expect(validateWorkflow.match(/uses:\s+\S+@[0-9a-f]{40}\s+#/g)).toHaveLength(4);
        expect(validateWorkflow.match(/uses:/g)).toHaveLength(4);
    });

    it('CAS runtime harnessが不正な接続設定をDB接続前に拒否する', () => {
        const valid = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
        const cases = [
            ['flag', valid, false], ['host', 'postgresql://postgres:postgres@external.invalid:5432/postgres', true],
            ['database', 'postgresql://postgres:postgres@127.0.0.1:5432/template1', true],
            ['user', 'postgresql://other:postgres@127.0.0.1:5432/postgres', true],
            ['port', 'postgresql://postgres:postgres@127.0.0.1:5433/postgres', true],
            ['password', 'postgresql://postgres:other@127.0.0.1:5432/postgres', true],
            ['ssl', `${valid}?sslmode=require`, true], ['hash', `${valid}#unsafe`, true],
        ] as const;
        for (const [label, url, enabled] of cases) {
            const env: NodeJS.ProcessEnv = { ...process.env, PUSH_CAS_POSTGRES_URL: url };
            if (enabled) env.UCFITNESS_POSTGRES_RUNTIME_TEST = '1';
            else delete env.UCFITNESS_POSTGRES_RUNTIME_TEST;
            const probe = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test-push-cas-postgres.ts'],
                { encoding: 'utf8', env });
            expect(probe.status, label).not.toBe(0);
            expect(probe.stderr.trim(), label).toBe('ERR: bootstrap-config');
            expect(probe.stdout, label).toBe('');
        }
    }, 15_000);
});
