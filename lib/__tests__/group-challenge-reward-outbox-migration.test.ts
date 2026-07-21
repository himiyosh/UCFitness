import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
    '../../migrations/20260722_add_group_challenge_reward_outbox.sql',
    import.meta.url,
), 'utf8');

function position(fragment: string): number {
    const index = migration.indexOf(fragment);
    expect(index).toBeGreaterThan(-1);
    return index;
}

function settlementBody(): string {
    const match = migration.match(
        /CREATE OR REPLACE FUNCTION public\.settle_group_challenge[\s\S]+?AS \$\$([\s\S]+?)\$\$;/,
    );
    expect(match).not.toBeNull();
    return match?.[1] ?? '';
}

describe('group_challenge_reward_outbox migration', () => {
    it('outboxが必須FK・正額報酬・配送lease最小状態を保持する', () => {
        for (const fragment of [
            'CREATE TABLE public.group_challenge_reward_outbox',
            'id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY',
            'REFERENCES public.challenges(id) ON DELETE CASCADE',
            'REFERENCES public.users(id) ON DELETE CASCADE',
            'reward_amount integer NOT NULL CHECK (reward_amount > 0)',
            'created_at timestamptz NOT NULL DEFAULT now()',
            'claim_id uuid',
            'lease_expires_at timestamptz',
            'delivered_at timestamptz',
            'attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0)',
            'group_challenge_reward_outbox_lease_check',
            'group_challenge_reward_outbox_delivery_check',
        ]) {
            expect(migration).toContain(fragment);
        }
        expect(migration).not.toContain('auth.users');
        expect(migration).toContain(
            'CREATE INDEX idx_group_challenge_reward_outbox_pending',
        );
        expect(migration).toContain('WHERE delivered_at IS NULL');
    });

    it('challengeとuserの組を一意にして再精算時の重複通知を防ぐ', () => {
        expect(migration).toContain('UNIQUE (challenge_id, user_id)');
        expect(migration).toContain(
            'ON CONFLICT (challenge_id, user_id) DO NOTHING',
        );
        expect(settlementBody()).toContain(
            'v_existing_reward IS DISTINCT FROM v_challenge.reward_uc',
        );
    });

    it('RLSをdeny-by-defaultにしてservice_roleだけへ権限を付与する', () => {
        expect(migration).toContain(
            'ALTER TABLE public.group_challenge_reward_outbox ENABLE ROW LEVEL SECURITY',
        );
        expect(migration).toContain(
            'ALTER TABLE public.group_challenge_reward_outbox FORCE ROW LEVEL SECURITY',
        );
        expect(migration).not.toMatch(/CREATE POLICY/i);
        expect(migration).toMatch(
            /REVOKE ALL ON TABLE public\.group_challenge_reward_outbox\s+FROM PUBLIC, anon, authenticated;/,
        );
        expect(migration).toMatch(
            /GRANT SELECT, INSERT, UPDATE ON TABLE public\.group_challenge_reward_outbox\s+TO service_role;/,
        );
        expect(migration).toMatch(
            /REVOKE ALL ON SEQUENCE public\.group_challenge_reward_outbox_id_seq\s+FROM PUBLIC, anon, authenticated;/,
        );
        expect(migration).toMatch(
            /GRANT USAGE, SELECT ON SEQUENCE public\.group_challenge_reward_outbox_id_seq\s+TO service_role;/,
        );
    });

    it('入金成功後かつsettled更新前に同じtransactionでoutboxを作成する', () => {
        const body = settlementBody();
        const credit = position('v_credit := public.credit_balance');
        const creditCheck = position(
            "COALESCE((v_credit ->> 'success')::boolean, false) IS NOT TRUE",
        );
        const outboxInsert = position(
            'INSERT INTO public.group_challenge_reward_outbox',
        );
        const participantUpdate = position('UPDATE public.challenge_participants');
        const settlementUpdate = position('UPDATE public.challenges');

        expect(body).toContain('FOREACH v_user_id IN ARRAY v_member_ids LOOP');
        expect(credit).toBeLessThan(creditCheck);
        expect(creditCheck).toBeLessThan(outboxInsert);
        expect(outboxInsert).toBeLessThan(participantUpdate);
        expect(participantUpdate).toBeLessThan(settlementUpdate);
    });

    it('部分失敗を握りつぶさず入金・outbox・精算状態をrollbackする', () => {
        const body = settlementBody();
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(body).toContain(
            "RAISE EXCEPTION 'GROUP challenge credit failed for member %'",
        );
        expect(body).toContain(
            "RAISE EXCEPTION 'GROUP challenge outbox reward mismatch for member %'",
        );
        expect(body).not.toContain('EXCEPTION WHEN OTHERS');
    });

    it('settlement RPCの固定search_pathとservice-role境界を維持する', () => {
        expect(migration).toContain('SECURITY DEFINER');
        expect(migration).toContain("SET search_path = ''");
        expect(migration).toMatch(
            /REVOKE ALL ON FUNCTION public\.settle_group_challenge\(uuid\)\s+FROM PUBLIC, anon, authenticated;/,
        );
        expect(migration).toMatch(
            /GRANT EXECUTE ON FUNCTION public\.settle_group_challenge\(uuid\)\s+TO service_role;/,
        );
    });

    it('RPC responseを既存6列のまま保ちrecipient配列を公開しない', () => {
        expect(migration).toMatch(
            /RETURNS TABLE \(\s*status text,\s*is_completed boolean,\s*total_steps bigint,\s*member_count bigint,\s*rewarded_count bigint,\s*settled_at timestamptz\s*\)/,
        );
        const returnsTable = migration.match(/RETURNS TABLE \(([\s\S]+?)\)\s*LANGUAGE/)?.[1] ?? '';
        expect(returnsTable).not.toMatch(/user_id|recipient|member_ids/i);
        expect(settlementBody()).not.toContain('jsonb_agg');
    });

    it('rollbackは旧settlement RPC復元後にoutboxを削除する順序を明示する', () => {
        const restore = position(
            'Restore the 20260721 settle_group_challenge(uuid) definition',
        );
        const drop = position('Drop public.group_challenge_reward_outbox');
        expect(restore).toBeLessThan(drop);
    });
});
