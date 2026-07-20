import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readFile = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const migration = readFile('migrations/20260721_atomic_historical_coin_backfill.sql');
const ATOMIC_HISTORICAL_COIN_BACKFILL_SHA256 = '43576cf79dbbc371c38b3e9f36b6eb23b1c24792bb5edbc3b9b11683ba5379fe';
const body = migration.match(/CREATE FUNCTION public\.apply_coin_backfill[\s\S]+?AS \$function\$([\s\S]+?)\$function\$;/)?.[1] ?? '';
const stale = body.match(/WITH existing_totals AS[\s\S]+?Stale coin backfill cannot reduce earned coins'; END IF;/)?.[0] ?? '';
const normalizedStale = stale.replace(/\s+/g, ' ');
describe('atomic historical coin backfill migration', () => {
    it('Phase A migration_同一内容の場合_SHA-256契約を維持する', () => {
        expect(sha256(migration)).toBe(ATOMIC_HISTORICAL_COIN_BACKFILL_SHA256);
    });
    it('依存migration_同一内容の場合_SHA-256契約を維持する', () => {
        const hashes = new Map([
            ['migrations/20260718_add_streak_milestone_rewards.sql', '32d33a968327ce45d19f47377e7c69c4c727069dba447d36deb47d8fba16bf3f'],
            ['migrations/20260720_harden_coin_transactions_rls.sql', '32324ceae1333fefb67a0d8788facf23ea2fd435332e78c4ac103bbcabdf426f'],
            ['migrations/20260720_harden_coin_balances_rls.sql', '31c7de8805482777c21b2b5f48b9a99d5325528505df9cbe1f2664a56e8750c0'],
            ['migrations/20260721_atomic_daily_coin_recalculation.sql', '38449d02d5526589c51105fa6ad3eb85b57c299b8228fabef85bd135212cfde4'],
        ]);
        for (const [path, hash] of hashes) expect(sha256(readFile(path)), path).toBe(hash);
    });
    it('catalog gate_既知DB契約が異なる場合_function作成前にfail closedにする', () => {
        expect(migration).toMatch(/^BEGIN; SET LOCAL search_path = '';/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        const gateMarkers = [migration.indexOf('DO $preconditions$'), migration.indexOf('CREATE FUNCTION')];
        expect(gateMarkers.every((index) => index >= 0)).toBe(true);
        expect(gateMarkers[0]).toBeLessThan(gateMarkers[1]);
        expect(migration).not.toMatch(/\b(?:CREATE|ALTER)\s+TABLE\b/i);
        for (const evidence of ['LOCK TABLE public.users, public.coin_transactions, public.coin_balances', "'amount|integer|t|f|'", "'total_balance|bigint|t|0|'", 'user_id_default IS NULL', 'coin_transactions_type_check', "type=ANYARRAY[''STEPS'',''GOAL_BONUS''", 'idx_coin_transactions_idempotency', 'coin_balances_non_negative_balance', "polname = 'Allow public read users'", 'pg_catalog.aclexplode', "pg_catalog.pg_get_userbyid(table_owner) <> 'postgres'", 'IS DISTINCT FROM TRUE', 'public.apply_daily_coin_recalculation(uuid,date,integer,jsonb)']) expect(migration).toContain(evidence);
        expect(migration).toMatch(/procedure\.proname = 'apply_coin_backfill'\) THEN[\s\S]+?CREATE FUNCTION/);
    });
    it('入力_全境界が不正の場合_delete前に拒否する', () => {
        for (const evidence of ['p_current_streak IS NULL OR p_current_streak < 0', 'jsonb_array_length(p_transactions) NOT BETWEEN 1 AND 50000', "item ?& ARRAY['date', 'type', 'amount', 'description']", 'jsonb_object_keys(item)) <> 4', "'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'", "to_date(date, 'FXYYYY-MM-DD')", "'Asia/Tokyo'", "type <> ALL (ARRAY['STEPS', 'GOAL_BONUS', 'STREAK_BONUS'])", 'amount < 0', 'amount <> pg_catalog.trunc(amount)', 'amount > 2147483647', "(type <> 'STEPS' AND amount = 0)", "btrim(description) = ''", 'GROUP BY date, type HAVING count(*) > 1', "GROUP BY date HAVING count(*) FILTER (WHERE type = 'STEPS') <> 1"]) expect(body).toContain(evidence);
        const rejection = body.indexOf('Invalid coin backfill transaction values');
        const deletion = body.indexOf('DELETE FROM public.coin_transactions');
        expect(rejection).toBeGreaterThan(-1);
        expect(rejection).toBeLessThan(deletion);
    });
    it('並行guard_欠落日・0歩・減額を拒否し歩数増加時のbonus低下を許可する', () => {
        for (const evidence of ["count(*) FILTER (WHERE type = 'STEPS') <> 1", 'count(*) <> count(DISTINCT type)', 'min(amount) < 0', 'FULL JOIN incoming_totals AS incoming USING (date)', 'incoming.steps < existing.steps']) expect(body).toContain(evidence);
        expect(stale.match(/AS has_steps/g)).toHaveLength(2);
        expect(normalizedStale).toContain('existing.has_steps IS TRUE AND (incoming.has_steps IS DISTINCT FROM TRUE');
        expect(normalizedStale).toContain('incoming.steps = existing.steps AND (incoming.goal_bonus < existing.goal_bonus OR incoming.streak_bonus < existing.streak_bonus)');
        expect(stale).not.toContain('RANK_BONUS');
    });
    it('台帳置換_lockとguard後に単一insertし全台帳残高を更新する', () => {
        const markers = [
            body.indexOf('FROM public.users WHERE id = p_user_id FOR UPDATE'),
            body.indexOf('LOCK TABLE public.coin_transactions IN SHARE ROW EXCLUSIVE MODE NOWAIT'),
            body.indexOf('FROM public.coin_balances WHERE user_id = p_user_id FOR UPDATE'),
            body.indexOf('WITH existing_totals AS'), body.indexOf('idempotency key conflicts'),
            body.indexOf('DELETE FROM public.coin_transactions'), body.indexOf('INSERT INTO public.coin_transactions'),
        ];
        expect(markers.every((index) => index >= 0)).toBe(true);
        expect(markers).toEqual([...markers].sort((a, b) => a - b));
        expect(body.match(/INSERT INTO public\.coin_transactions/g)).toHaveLength(1);
        expect(body.indexOf('SELECT COALESCE(sum(amount) FILTER', markers[6])).toBeGreaterThan(markers[6]);
        for (const evidence of ["'coins:' || p_user_id::text || ':' || input.date || ':' || input.type", 'GET DIAGNOSTICS written_count = ROW_COUNT', 'current_streak = EXCLUDED.current_streak', "RETURN pg_catalog.jsonb_build_object('success', true)"]) expect(body).toContain(evidence);
    });
    it('置換とRPC権限_歩数由来3種だけをservice_roleが実行する', () => {
        const deletedTypes = body.match(/DELETE FROM public\.coin_transactions[\s\S]+?type IN \(([^)]+)\);/)?.[1] ?? '';
        expect(deletedTypes.match(/'[A-Z_]+'/g)?.sort()).toEqual(["'GOAL_BONUS'", "'STEPS'", "'STREAK_BONUS'"]);
        for (const type of ['RANK_BONUS', 'STREAK_MILESTONE', 'MISSION_REWARD', 'LOGIN_BONUS', 'PURCHASE', 'GIFT_SEND', 'GIFT_RECEIVE']) expect(deletedTypes).not.toContain(type);
        for (const evidence of ["LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''", 'OWNER TO postgres', 'FROM PUBLIC, anon, authenticated, service_role', 'TO service_role', 'privilege.grantee NOT IN']) expect(migration).toContain(evidence);
        expect(migration).toMatch(/procedure\.proname = 'apply_coin_backfill'\) <> 1/);
        expect(body).not.toMatch(/EXCEPTION\s+WHEN/i);
    });
});
