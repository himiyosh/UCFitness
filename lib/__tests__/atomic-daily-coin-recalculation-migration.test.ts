import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readRepositoryFile = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const migration = readRepositoryFile('migrations/20260721_atomic_daily_coin_recalculation.sql');
const functionBody = migration.match(
    /CREATE FUNCTION public\.apply_daily_coin_recalculation[\s\S]+?AS \$function\$([\s\S]+?)\$function\$;/,
)?.[1] ?? '';

describe('atomic daily coin recalculation migration', () => {
    it('依存migration_変更されていない場合_hash契約を維持する', () => {
        const expectedHashes = new Map([
            ['migrations/20260720_harden_coin_transactions_rls.sql', '32324ceae1333fefb67a0d8788facf23ea2fd435332e78c4ac103bbcabdf426f'],
            ['migrations/20260720_harden_coin_balances_rls.sql', '31c7de8805482777c21b2b5f48b9a99d5325528505df9cbe1f2664a56e8750c0'],
            ['migrations/20260718_add_streak_milestone_rewards.sql', '32d33a968327ce45d19f47377e7c69c4c727069dba447d36deb47d8fba16bf3f'],
        ]);
        for (const [path, hash] of expectedHashes) {
            expect(sha256(readRepositoryFile(path)), path).toBe(hash);
        }
    });

    it('catalog gate_既知schemaと安全境界が異なる場合_fail closedにする', () => {
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(migration).toContain("SET LOCAL search_path = ''");
        expect(migration).toContain(
            'LOCK TABLE public.users, public.coin_transactions, public.coin_balances',
        );
        for (const evidence of [
            "'amount|integer|t|f|'", "'idempotency_key|text|f|f|'",
            "'total_balance|bigint|t|0|'", "'investor_rank|text|t|''BEGINNER''::text|'",
            'coin_transactions_type_check', 'idx_coin_transactions_idempotency',
            'coin_balances_non_negative_balance', "pg_get_userbyid(table_owner) <> 'postgres'",
            'relforcerowsecurity', 'pg_catalog.pg_policy', 'rolbypassrls',
        ]) {
            expect(migration).toContain(evidence);
        }
        expect(migration).not.toMatch(/auth\.users|auth\.uid\s*\(/);
    });

    it('並行writer_全経路が同じusers行を先にロックする場合_直列化する', () => {
        for (const signature of [
            'recalculate_coin_balance(uuid,integer)',
            'deduct_balance(uuid,integer,text,text,text)',
            'credit_balance(uuid,integer,text,text,text,date)',
            'award_streak_milestones(date)',
        ]) {
            expect(migration).toContain(`public.${signature}`);
        }
        const lockIndex = functionBody.indexOf(
            'PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE',
        );
        expect(lockIndex).toBeGreaterThan(-1);
        expect(lockIndex).toBeLessThan(functionBody.indexOf('DELETE FROM public.coin_transactions'));
        expect(lockIndex).toBeLessThan(functionBody.indexOf('INSERT INTO public.coin_balances'));
    });

    it('transaction入力_不正shapeまたはunsafe値の場合_書き込み前に拒否する', () => {
        expect(functionBody).toContain("jsonb_typeof(p_transactions) <> 'array'");
        expect(functionBody).toContain('jsonb_array_length(p_transactions) NOT BETWEEN 1 AND 4');
        expect(functionBody).toContain("item ?& ARRAY['type', 'amount', 'description']");
        expect(functionBody).toContain('(SELECT count(*) FROM jsonb_object_keys(item)) <> 3');
        expect(functionBody).toContain('amount <> trunc(amount)');
        expect(functionBody).toContain('amount > 2147483647');
        expect(functionBody).toContain('total_balance > 9007199254740991');
        expect(functionBody).toContain("WHERE type = 'STEPS'");
    });

    it('再計算_対象日の4種だけを置換する場合_不可逆報酬を保持する', () => {
        expect(functionBody.match(/DELETE FROM public\.coin_transactions/g)).toHaveLength(1);
        expect(functionBody).not.toMatch(/TRUNCATE\s+(?:TABLE\s+)?public\.coin_transactions/i);
        const deletedTypes = functionBody.match(
            /DELETE FROM public\.coin_transactions[\s\S]+?type IN \(([^)]+)\);/,
        )?.[1] ?? '';
        expect(deletedTypes.match(/'[A-Z_]+'/g)?.sort()).toEqual([
            "'GOAL_BONUS'", "'RANK_BONUS'", "'STEPS'", "'STREAK_BONUS'",
        ]);
        expect(deletedTypes).not.toContain('STREAK_MILESTONE');
        expect(deletedTypes).not.toContain('MISSION_REWARD');
        expect(functionBody).toContain('ON CONFLICT (idempotency_key) DO UPDATE SET');
        expect(functionBody).toContain("'coins:' || p_user_id::text");
    });

    it('残高再集計_台帳置換後_全取引の合計を同じfunction内で保存する', () => {
        const deleteIndex = functionBody.indexOf('DELETE FROM public.coin_transactions');
        const ledgerInsertIndex = functionBody.indexOf('INSERT INTO public.coin_transactions');
        const aggregateIndex = functionBody.indexOf('COALESCE(sum(amount)');
        const balanceIndex = functionBody.indexOf('INSERT INTO public.coin_balances');
        expect(deleteIndex).toBeLessThan(ledgerInsertIndex);
        expect(ledgerInsertIndex).toBeLessThan(aggregateIndex);
        expect(aggregateIndex).toBeLessThan(balanceIndex);
        expect(functionBody).not.toMatch(/EXCEPTION\s+WHEN/i);
        expect(functionBody).toContain("RETURN pg_catalog.jsonb_build_object('success', true)");
    });

    it('RPC権限_service roleだけが実行する場合_直接UPDATEを撤去する', () => {
        const signature = 'public.apply_daily_coin_recalculation(uuid, date, integer, jsonb)';
        expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
        expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
        expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role');
        expect(migration).toContain('TO service_role');
        expect(migration).toContain('pg_catalog.aclexplode');
        expect(migration).toContain('privilege.grantee NOT IN');
        expect(migration).toContain(
            'REVOKE UPDATE (user_id, date, type, amount, description, idempotency_key)',
        );
        expect(migration).toContain(
            "'service_role', 'public.coin_transactions', 'UPDATE'",
        );
    });
});
