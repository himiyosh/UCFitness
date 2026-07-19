import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readRepositoryFile = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const migration = readRepositoryFile(
    'migrations/20260720_harden_coin_transactions_rls.sql',
);
const phaseOneMigration = readRepositoryFile(
    'migrations/20260720_harden_api_keys_rls.sql',
);
const phaseTwoMigration = readRepositoryFile(
    'migrations/20260720_harden_push_subscriptions_rls.sql',
);
const coinService = readRepositoryFile('lib/services/coin-service.ts');
const directSources = [
    'lib/services/coin-service.ts',
    'app/api/user/login-bonus/route.ts',
    'app/api/user/export/route.ts',
    'app/api/cron/weekly-summary/route.ts',
    'app/[locale]/wallet/page.tsx',
].map(readRepositoryFile);
const atomicCoinMigration = readRepositoryFile(
    'migrations/20260718_add_streak_milestone_rewards.sql',
);

describe('F016 coin_transactions RLS migration', () => {
    it('Phase 1とPhase 2を変更せずPhase 3だけを追加する', () => {
        expect(sha256(phaseOneMigration)).toBe(
            '5138a2695ed34f0fe8f17112e586a82ee089bc7b0f202d6770af990475391636',
        );
        expect(sha256(phaseTwoMigration)).toBe(
            '5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66',
        );
        expect(migration.match(
            /ALTER TABLE public\.([a-z_]+) ENABLE ROW LEVEL SECURITY/i,
        )?.[1]).toBe('coin_transactions');
    });

    it('既知schemaと整合性制約をtransaction内でfail closed検証する', () => {
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(migration).toContain("SET LOCAL search_path = ''");
        expect(migration).toContain(
            'LOCK TABLE public.coin_transactions IN ACCESS EXCLUSIVE MODE',
        );
        expect(migration).toContain("('id', 'uuid', true, true)");
        expect(migration).toContain("('created_at', 'timestamp with time zone', false, true)");
        expect(migration).toContain("id_default NOT IN ('gen_random_uuid()', 'uuid_generate_v4()')");
        expect(migration).toContain("created_at_default <> 'now()'");
        expect(migration).toContain('coin_transactions.user_id must reference public.users(id)');
        expect(migration).toContain("index_class.relname = 'idx_coin_transactions_idempotency'");
        expect(migration).toContain('index_record.indpred IS NULL');
        expect(migration).toContain("conname = 'coin_transactions_type_check'");
        for (const type of [
            'STEPS', 'GOAL_BONUS', 'STREAK_BONUS', 'STREAK_MILESTONE',
            'RANK_BONUS', 'LOGIN_BONUS', 'MISSION_REWARD',
            'PURCHASE', 'GIFT_SEND', 'GIFT_RECEIVE',
        ]) {
            expect(migration).toContain(`'${type}'`);
        }
    });

    it('policyなしRLSと安全なowner及びBYPASSRLSを要求する', () => {
        expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
        expect(migration).toContain('pg_catalog.pg_policy');
        expect(migration).toContain('rolbypassrls');
        expect(migration).toContain("table_owner IS DISTINCT FROM 'postgres'");
        expect(migration).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
        expect(migration).not.toMatch(/CREATE\s+POLICY/i);
        expect(migration).not.toMatch(/auth\.uid\s*\(/i);
        expect(migration).not.toMatch(/auth\.users/i);
    });

    it('service_roleへ実CRUDに必要な列権限だけを付与する', () => {
        expect(migration).toMatch(
            /REVOKE ALL PRIVILEGES ON TABLE public\.coin_transactions\s+FROM PUBLIC, anon, authenticated, service_role/i,
        );
        expect(migration).toContain(
            'REVOKE ALL PRIVILEGES (%I) ON TABLE public.coin_transactions',
        );
        expect(migration).toMatch(
            /GRANT SELECT \(\s*id, user_id, date, type, amount, description, idempotency_key, created_at\s*\)/i,
        );
        for (const privilege of ['INSERT', 'UPDATE']) {
            expect(migration).toMatch(new RegExp(
                `GRANT ${privilege} \\(\\s*user_id, date, type, amount, description, idempotency_key\\s*\\)`,
                'i',
            ));
        }
        expect(migration).toContain(
            'GRANT DELETE ON TABLE public.coin_transactions TO service_role',
        );
        expect(migration).not.toMatch(/GRANT (TRUNCATE|REFERENCES|TRIGGER|ALL)/i);
    });

    it('upsertと直接CRUD及びSECURITY INVOKER RPCを権限計算に含める', () => {
        expect(directSources.every((source) =>
            source.includes("from('coin_transactions')")
            && source.includes('supabaseAdmin'))).toBe(true);
        expect(coinService).toContain('.delete()');
        expect(coinService).toContain('.insert(batch)');
        expect(coinService).toContain(
            ".upsert(transactions, { onConflict: 'idempotency_key', ignoreDuplicates: false })",
        );
        expect(atomicCoinMigration).not.toMatch(/SECURITY\s+DEFINER/i);
        expect(atomicCoinMigration).toContain('SELECT id INTO v_existing FROM public.coin_transactions');
        expect(atomicCoinMigration).toContain('INSERT INTO public.coin_transactions');
    });

    it('対象table所有sequenceだけを検出してUSAGEだけを許可する', () => {
        expect(migration).toContain("sequence_class.relkind = 'S'");
        expect(migration).toContain('dependency.refobjid = target_table');
        expect(migration).toContain("dependency.deptype IN ('a', 'i')");
        expect(migration).toContain("dependency.classid = 'pg_catalog.pg_class'::regclass");
        expect(migration).toContain("dependency.refclassid = 'pg_catalog.pg_class'::regclass");
        expect(migration).toContain('dependency.objsubid = 0');
        expect(migration).toContain('dependency.refobjsubid > 0');
        expect(migration).toContain('GRANT USAGE ON SEQUENCE %s TO service_role');
        expect(migration).toContain('privilege.grantee NOT IN');
        expect(migration).toContain("pg_catalog.acldefault('s', sequence_class.relowner)");
        expect(migration).not.toMatch(/GRANT (SELECT|UPDATE|ALL).*ON SEQUENCE/i);
    });

    it('F001/F016とID・日付anchor付き進捗を構造検証する', () => {
        const features = JSON.parse(
            readRepositoryFile('.github/ucfitness-features.json'),
        ) as { features: Array<{ id: string; status: string }> };
        const progress = JSON.parse(readRepositoryFile('.github/ucfitness-progress.json')) as { lastCommit: string; sessionLog: Array<{ date: string; agent: string; action: string; commit: string; filesChanged: string[] }> };
        const statusFor = (id: string): string | undefined =>
            features.features.find((feature) => feature.id === id)?.status;
        const phaseTwoLog = progress.sessionLog.find((log) => log.commit === '8211a42a099890ab0fd2b45d9c4a90f0a2b81ebd');
        const phaseThreeLog = progress.sessionLog.find((log) => log.action.includes('Phase 3でcoin_transactions'));

        expect(statusFor('F001')).toBe('not-started');
        expect(statusFor('F016')).toBe('in-progress');
        expect(progress.lastCommit).toBe('f0bdde158f66c6f01e10e90e8fdfb40bd488a2b1');
        expect(phaseTwoLog).toEqual({ date: '2026-07-20', agent: 'UCFitnessAgent (Security + PostgreSQL + QA + Self-Critique)', action: 'F016 Supabase RLS強化Phase 2でpush_subscriptionsの全CRUD、配信、重複整理、404/410 cleanup、browser境界を監査。既知schema・FK・index・ownerをfail-closed検証し、policyなしRLSとservice_roleの最小CRUD・対象所有sequence USAGEだけを許可するmigrationを追加。全368テストとcheck:allをPASS。実catalog接続・DB適用は未実施。', commit: '8211a42a099890ab0fd2b45d9c4a90f0a2b81ebd', filesChanged: ['migrations/20260720_harden_push_subscriptions_rls.sql', 'lib/__tests__/push-subscriptions-rls-migration.test.ts', 'README.md', '.github/ucfitness-progress.json'] });
        expect(phaseThreeLog).toMatchObject({ date: '2026-07-20', commit: 'f0bdde158f66c6f01e10e90e8fdfb40bd488a2b1' });
    });
});
