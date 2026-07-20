import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readRepositoryFile = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const migration = readRepositoryFile('migrations/20260721_atomic_daily_coin_recalculation.sql');
const functionBody = migration.match(/CREATE FUNCTION public\.apply_daily_coin_recalculation[\s\S]+?AS \$function\$([\s\S]+?)\$function\$;/)?.[1] ?? '';
const staleGuard = functionBody.match(
    /IF EXISTS \(\s*WITH existing_totals AS[\s\S]+?Stale daily coin recalculation cannot reduce earned coins';\s*END IF;/,
)?.[0] ?? '';
const existingTotals = staleGuard.match(/WITH existing_totals AS \(([\s\S]+?)\), incoming_totals AS/)?.[1] ?? '';
const normalizedStaleGuard = staleGuard.replace(/\s+/g, ' ');

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
        expect(migration).toContain('LOCK TABLE public.users, public.coin_transactions, public.coin_balances');
        expect(migration.indexOf('DO $preconditions$')).toBeLessThan(migration.indexOf('CREATE FUNCTION'));
        expect(migration).not.toMatch(/\b(?:CREATE|ALTER)\s+TABLE\b/i);
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
        const lockIndex = functionBody.indexOf('PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE');
        expect(lockIndex).toBeGreaterThan(-1);
        expect(lockIndex).toBeLessThan(functionBody.indexOf('INSERT INTO public.coin_transactions'));
        expect(lockIndex).toBeLessThan(functionBody.indexOf('INSERT INTO public.coin_balances'));
    });

    it('transaction入力_空配列・重複・不一致key・unsafe値の場合_書き込み前に拒否する', () => {
        expect(migration).toContain('p_user_id uuid, p_date date');
        for (const evidence of [
            'p_user_id IS NULL OR p_date IS NULL', 'p_streak IS NULL OR p_streak < 0', "jsonb_typeof(p_transactions) <> 'array'",
            'jsonb_array_length(p_transactions) NOT BETWEEN 1 AND 4', "item ?& ARRAY['type', 'amount', 'description']",
            '(SELECT count(*) FROM jsonb_object_keys(item)) <> 3', 'GROUP BY type HAVING count(*) > 1',
            'amount < 0 OR amount <> trunc(amount) OR amount > 2147483647', 'total_balance > 9007199254740991',
            "type <> 'STEPS' AND amount = 0", "'coins:' || p_user_id::text", 'user does not exist',
            'existing.user_id <> p_user_id', 'existing.date <> p_date', 'existing.type <> input.type',
            'written_count <> jsonb_array_length(p_transactions)', "WHERE type = 'STEPS'",
        ]) expect(functionBody).toContain(evidence);
    });

    it('stale guard SQL_目標5050で5099歩から5000歩へ戻りSTEPS額が同じ場合_GOAL欠落拒否条件を固定する', () => {
        expect(staleGuard.match(
            /COALESCE\(sum\(amount::integer\) FILTER \(WHERE type = 'GOAL_BONUS'\), 0\) AS goal_bonus/g,
        )).toHaveLength(2);
        expect(normalizedStaleGuard).toContain(
            'incoming.steps = existing.steps AND ( incoming.goal_bonus < existing.goal_bonus',
        );
    });

    it('stale guard SQL_同一STEPS額でSTREAK_BONUSが低下する場合_拒否条件を固定する', () => {
        expect(staleGuard.match(
            /COALESCE\(sum\(amount::integer\) FILTER \(WHERE type = 'STREAK_BONUS'\), 0\) AS streak_bonus/g,
        )).toHaveLength(2);
        expect(normalizedStaleGuard).toContain(
            'OR incoming.streak_bonus < existing.streak_bonus',
        );
    });

    it('stale guard SQL_STEPSが50から51へ増えてGOAL_BONUSが消える場合_許可条件を固定する', () => {
        expect(normalizedStaleGuard).toContain(
            'WHERE incoming.steps < existing.steps OR ( incoming.steps = existing.steps AND ( incoming.goal_bonus < existing.goal_bonus OR incoming.streak_bonus < existing.streak_bonus ) )',
        );
    });

    it('stale guard SQL_RANK_BONUSだけが低下する場合_許可条件を固定する', () => {
        expect(staleGuard).toContain('existing_totals');
        expect(staleGuard).not.toContain("'RANK_BONUS'");
    });

    it('stale guard SQL_対象日の既存取引がなくSTEPSが0の場合_初回許可条件を固定する', () => {
        expect(staleGuard.match(
            /COALESCE\(sum\(amount::integer\) FILTER \(WHERE type = 'STEPS'\), 0\) AS steps/g,
        )).toHaveLength(2);
        expect(existingTotals).not.toContain('GROUP BY');
        expect(functionBody).toContain("(type <> 'STEPS' AND amount = 0)");
    });

    it('stale guard_入力形状検証後_全台帳書き込みより前に評価する', () => {
        const lockIndex = functionBody.indexOf('PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE');
        const shapeValidationIndex = functionBody.indexOf("RAISE EXCEPTION 'Invalid daily coin transaction shape'");
        const staleGuardIndex = functionBody.indexOf('WITH existing_totals AS');
        expect(staleGuardIndex).toBeGreaterThan(shapeValidationIndex);
        expect(staleGuardIndex).toBeGreaterThan(lockIndex);
        expect(staleGuardIndex).toBeLessThan(functionBody.indexOf('DELETE FROM public.coin_transactions'));
        expect(staleGuardIndex).toBeLessThan(functionBody.indexOf('INSERT INTO public.coin_transactions'));
        expect(staleGuardIndex).toBeLessThan(functionBody.indexOf('INSERT INTO public.coin_balances'));
    });

    it('再計算_同一keyは冪等更新し対象日の4種だけを置換する場合_不可逆報酬を保持する', () => {
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

    it('RPC全overload_ownerとservice roleだけが実行する場合_直接UPDATEを撤去する', () => {
        const signature = 'public.apply_daily_coin_recalculation(uuid, date, integer, jsonb)';
        for (const evidence of [
            `REVOKE ALL ON FUNCTION ${signature}`, `GRANT EXECUTE ON FUNCTION ${signature}`,
            'FROM PUBLIC, anon, authenticated, service_role', 'TO service_role',
            "LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''", 'OWNER TO postgres',
            'procedure.prosecdef', "procedure.proname = 'apply_daily_coin_recalculation'",
            'pg_catalog.aclexplode', 'privilege.grantee NOT IN',
            'REVOKE UPDATE (user_id, date, type, amount, description, idempotency_key)',
            "'service_role', 'public.coin_transactions', 'UPDATE'",
        ]) expect(migration).toContain(evidence);
        expect(migration).toMatch(/procedure\.proname = 'apply_daily_coin_recalculation'\s*\n\s*\) <> 1/);
    });
});
