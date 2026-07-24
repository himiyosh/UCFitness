import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readRepositoryFile = (path: string): string =>
    readFileSync(join(process.cwd(), path), 'utf8');

const migration = readRepositoryFile(
    'migrations/20260720_harden_push_subscriptions_rls.sql',
);
const casMigration = readRepositoryFile('migrations/20260725_delete_push_subscription_if_unchanged.sql');
const phaseOneMigration = readRepositoryFile(
    'migrations/20260720_harden_api_keys_rls.sql',
);
const subscribeRoute = readRepositoryFile('app/api/push/subscribe/route.ts');
const deliverySources = [
    'app/api/push/send/route.ts', 'app/api/cron/step-reminder/route.ts',
    'app/api/cron/weekly-summary/route.ts', 'lib/services/badge-allocator.ts',
].map(readRepositoryFile);
const webPushSource = readRepositoryFile('lib/api/web-push.ts');
const browserSources = [
    'hooks/useWebPush.ts', 'components/PushNotificationManager.tsx',
    'components/PushSubscriptionButton.tsx',
].map(readRepositoryFile);
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

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
            '5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66');
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

    it('全CRUDがsupabaseAdmin経由でbrowserはAPIだけを呼ぶ', () => {
        expect(subscribeRoute).toContain("import { supabaseAdmin } from '@/lib/supabase'");
        expect(subscribeRoute).toContain(".from('push_subscriptions')");
        expect(subscribeRoute).toContain('.upsert({');
        expect(subscribeRoute).toContain('.delete()');
        expect(deliverySources.every((source) =>
            source.includes(".from('push_subscriptions')")
            && source.includes('supabaseAdmin'))).toBe(true);
        expect(browserSources.every((source) =>
            source.includes('/api/push/subscribe')
            && !source.includes(".from('push_subscriptions')")
            && !source.includes('@/lib/supabase'))).toBe(true);
    });

    it('CAS migrationの補助的text testでcatalog、lock、ACL、wiring契約を固定する', () => {
        for (const contract of [
            /^BEGIN;/, /COMMIT;\s*$/, /SET LOCAL search_path = ''/, /to_regclass\('public\.push_subscriptions'\)/,
            /to_regclass\('public\.users'\)/, /LOCK TABLE public\.push_subscriptions IN ACCESS EXCLUSIVE MODE/,
            /created_at:timestamp with time zone:false:true/, /created_at:now\(\)/, /id:gen_random_uuid\(\)/,
            /condeferrable/, /condeferred/, /indisunique/, /indisvalid/, /indisready/, /indimmediate/,
            /confdeltype = 'c'/, /pg_catalog\.pg_policy/, /WHERE subscription\.id = p_id\s+FOR UPDATE;/,
            /SECURITY DEFINER/, /\) OWNER TO postgres;/, /\) FROM PUBLIC, anon, authenticated, service_role;/,
            /\) TO service_role;/, /expected\.column_name, 'INSERT'/, /expected\.column_name, 'UPDATE'/,
            /procedure\.proconfig = ARRAY\['search_path=""'\]::text\[\]/, /pg_catalog\.aclexplode/,
        ]) expect(casMigration).toMatch(contract);
        expect(casMigration).toMatch(
            /FROM pg_catalog\.pg_attribute AS attribute\s+CROSS JOIN LATERAL pg_catalog\.aclexplode\(attribute\.attacl\) AS privilege\s+WHERE attribute\.attrelid = target_table\s+AND attribute\.attnum > 0\s+AND NOT attribute\.attisdropped\s+AND privilege\.grantee = 0/,
        );
        expect(casMigration).not.toMatch(/COALESCE\(\s*attribute\.attacl/);
        expect(casMigration).toMatch(
            /pg_catalog\.has_any_column_privilege\(role\.role_name, target_table,\s+'SELECT, INSERT, UPDATE, REFERENCES'\)/,
        );
        for (const field of ['user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at']) {
            expect(casMigration).toContain(`observed_row.${field} IS NOT DISTINCT FROM p_${field}`);
        }
        expect(casMigration).toMatch(/DELETE FROM public\.push_subscriptions AS subscription\s+WHERE subscription\.id = p_id;/);
        expect(casMigration.match(/RETURN false;/g)).toHaveLength(2);
        expect(casMigration).toContain('RETURN FOUND;');
        expect(webPushSource).toContain(
            "supabaseAdmin.rpc(\n            'delete_push_subscription_if_unchanged'");
        expect(webPushSource).not.toContain(".in('endpoint'");
        expect(subscribeRoute).toContain('deletePushSubscriptionIfUnchanged');
        expect(subscribeRoute).toContain('findSupersededSubscriptionIds');
        expect(subscribeRoute).not.toContain(".in('id', staleIds)");
        expect(casMigration).not.toMatch(/auth\.users|CREATE\s+POLICY/i);
    });
    it('F001を変更せずF016をin-progressに維持する', () => {
        const ledger = readRepositoryFile('.github/ucfitness-features.json');
        const statusFor = (id: string): string | undefined =>
            ledger.match(new RegExp(`"id": "${id}"[\\s\\S]*?"status": "([^"]+)"`))?.[1];

        expect(statusFor('F001')).toBe('not-started');
        expect(statusFor('F016')).toBe('in-progress');
    });
});
