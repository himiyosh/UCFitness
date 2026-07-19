import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readRepositoryFile = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const migration = readRepositoryFile('migrations/20260720_harden_coin_balances_rls.sql');
const atomicCoinMigration = readRepositoryFile('migrations/20260718_add_streak_milestone_rewards.sql');
const sourceFiles = (path: string): string[] => readdirSync(path, {
    withFileTypes: true,
}).flatMap((entry) => {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
        return entry.name === '__tests__' ? [] : sourceFiles(entryPath);
    }
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [entryPath] : [];
});
const coinBalanceSources = [
    ...sourceFiles(join(process.cwd(), 'app')),
    ...sourceFiles(join(process.cwd(), 'lib')),
]
    .map((path) => readFileSync(path, 'utf8'))
    .filter((source) => /\.from\(['"]coin_balances['"]\)/.test(source));

describe('F016 coin_balances RLS migration', () => {
    it('Phase 1からPhase 3及びatomic RPC migrationを変更しない', () => {
        const expectedHashes = new Map([
            ['migrations/20260720_harden_api_keys_rls.sql', '5138a2695ed34f0fe8f17112e586a82ee089bc7b0f202d6770af990475391636'],
            ['migrations/20260720_harden_push_subscriptions_rls.sql', '5b0e55ee7841df5a5586e5822cb9551dcaefc0238613c19507bf231d5c52dd66'],
            ['migrations/20260720_harden_coin_transactions_rls.sql', '32324ceae1333fefb67a0d8788facf23ea2fd435332e78c4ac103bbcabdf426f'],
            ['migrations/20260718_add_streak_milestone_rewards.sql', '32d33a968327ce45d19f47377e7c69c4c727069dba447d36deb47d8fba16bf3f'],
        ]);

        for (const [path, hash] of expectedHashes) {
            expect(sha256(readRepositoryFile(path)), path).toBe(hash);
        }
    });

    it('schema、FK、PK、default、checkをDDL lock内でfail closed検証する', () => {
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(migration).toContain("SET LOCAL search_path = ''");
        expect(migration).toContain('LOCK TABLE public.coin_balances IN ACCESS EXCLUSIVE MODE');
        for (const column of [
            "('user_id', 'uuid', true, NULL::text)",
            "('total_balance', 'bigint', true, '0')",
            "('investor_rank', 'text', true, '''BEGINNER''::text')",
            "('updated_at', 'timestamp with time zone', true, 'now()')",
        ]) {
            expect(migration).toContain(column);
        }
        expect(migration).toContain('coin_balances.user_id must be the primary key');
        expect(migration).toContain('coin_balances.user_id must reference public.users(id)');
        expect(migration).toContain("conname = 'coin_balances_non_negative_balance'");
        expect(migration).toContain('public.coin_balances must not own sequences');
    });

    it('policyなしRLS、owner安全、BYPASSRLS、owned sequenceなしを要求する', () => {
        expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
        expect(migration).toContain("table_owner_name IS DISTINCT FROM 'postgres'");
        expect(migration).toContain('table_owner_bypasses_rls IS NOT TRUE');
        expect(migration).toContain('service_role_bypasses_rls IS NOT TRUE');
        expect(migration).toContain('pg_catalog.pg_policy');
        expect(migration).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
        expect(migration).not.toMatch(/CREATE\s+POLICY/i);
        expect(migration).not.toMatch(/auth\.uid\s*\(|auth\.users/i);
        expect(migration).not.toMatch(/GRANT .* ON SEQUENCE/i);
    });

    it('direct service-role経路をSELECTだけに限定する', () => {
        const references = coinBalanceSources.flatMap((source) =>
            [...source.matchAll(/\.from\(['"]coin_balances['"]\)/g)].map(
                (match) => source.slice((match.index ?? 0) - 40, (match.index ?? 0) + 400),
            ));
        const selectedColumns = new Set(references.flatMap((reference) => {
            const select = reference.match(/\.select\(\s*['"]([^'"]+)['"]\s*\)/);
            return select?.[1].split(',').map((column) => column.trim()) ?? [];
        }));

        expect(references).toHaveLength(8);
        expect(references.every((reference) =>
            reference.includes('supabaseAdmin')
            && reference.includes('.select(')
            && !/\.(insert|upsert|update|delete)\s*\(/.test(reference))).toBe(true);
        expect([...selectedColumns].sort()).toEqual([
            'best_streak', 'current_streak', 'investor_rank', 'total_balance',
            'total_bonus', 'total_earned', 'user_id',
        ]);
        expect(migration).toMatch(
            /GRANT SELECT \(\s*user_id, total_balance, total_earned, total_bonus,\s*current_streak, best_streak, investor_rank\s*\)/i,
        );
        expect(migration).not.toMatch(
            /GRANT (INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL).*coin_balances/i,
        );
    });

    it('4つのatomic writerだけをowner実行へ変更してEXECUTEを限定する', () => {
        const signatures = [
            'recalculate_coin_balance(uuid, integer)',
            'deduct_balance(uuid, integer, text, text, text)',
            'credit_balance(uuid, integer, text, text, text, date)',
            'award_streak_milestones(date)',
        ];

        expect(atomicCoinMigration).not.toMatch(/SECURITY\s+DEFINER/i);
        expect(atomicCoinMigration).toContain('INSERT INTO public.coin_balances');
        expect(atomicCoinMigration).toContain('UPDATE public.coin_balances SET');
        for (const signature of signatures) {
            expect(migration).toContain(
                `ALTER FUNCTION public.${signature} SECURITY DEFINER`,
            );
            expect(migration).toContain(
                `GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`,
            );
        }
        expect(migration).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION/i);
        expect(migration).toContain("ARRAY['search_path=\"\"']::text[]");
        expect(migration).toContain('privilege.grantee NOT IN (table_owner, service_role_oid)');
    });

    it('既存残高値を読まず変更せずACL postconditionを固定する', () => {
        expect(migration).not.toMatch(
            /\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\.coin_balances/i,
        );
        expect(migration).not.toMatch(
            /SELECT[\s\S]{0,120}\bFROM\s+public\.coin_balances/i,
        );
        expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.coin_balances');
        expect(migration).toContain('REVOKE ALL PRIVILEGES (\n    user_id, total_balance');
        expect(migration).toContain("'service_role', target_table, 'INSERT, UPDATE, REFERENCES'");
        expect(migration).toContain(
            "'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'",
        );
    });
});
