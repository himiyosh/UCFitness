import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
    '../../migrations/20260721_settle_group_challenge.sql',
    import.meta.url,
), 'utf8');

function position(fragment: string): number {
    const index = migration.indexOf(fragment);
    expect(index).toBeGreaterThan(-1);
    return index;
}

function settlementBody(): string {
    const match = migration.match(
        /CREATE FUNCTION public\.settle_group_challenge[\s\S]+?AS \$\$([\s\S]+?)\$\$;/,
    );
    expect(match).not.toBeNull();
    return match?.[1] ?? '';
}

describe('settle_group_challenge migration', () => {
    it('明示的な精算状態をall-nullまたはall-settledへ制約する', () => {
        for (const fragment of [
            'settled_at timestamptz',
            'settlement_completed boolean',
            'settled_total_steps bigint',
            'settled_member_count bigint',
            'challenges_settlement_state_check',
            'settled_total_steps IS NOT NULL',
            'settled_member_count IS NOT NULL',
            'settled_total_steps >= 0',
            'settled_member_count >= 0',
        ]) {
            expect(migration).toContain(fragment);
        }
    });

    it('challengeを先に排他lockしGROUP・未精算・終了後をDB内で再検証する', () => {
        const body = settlementBody();
        const challengeLock = position('FROM public.challenges AS challenge');
        const credit = position('v_credit := public.credit_balance');

        expect(migration.slice(challengeLock, credit)).toContain('FOR UPDATE');
        expect(body).toContain("v_challenge.type IS DISTINCT FROM 'GROUP'");
        expect(body).toContain('v_challenge.group_id IS NULL');
        expect(body).toContain('v_challenge.settled_at IS NOT NULL');
        expect(body).toContain("v_challenge.end_date >= (now() AT TIME ZONE 'Asia/Tokyo')::date");
        expect(body).toContain("'already_settled'::text");
        expect(body).toContain("'not_ended'::text");
    });

    it('現member集合とinclusive期間の正歩数を同一statement snapshotで固定する', () => {
        const body = settlementBody();
        for (const fragment of [
            'WITH current_members AS MATERIALIZED',
            'FROM public.group_members AS member',
            'member.group_id = v_challenge.group_id',
            'SUM(step.steps::bigint) FILTER (WHERE step.steps > 0)',
            'step.date >= v_challenge.start_date',
            'step.date <= v_challenge.end_date',
            'array_agg(member_steps.user_id ORDER BY member_steps.user_id)',
            'v_total_steps >= v_challenge.target_steps::bigint',
        ]) {
            expect(body).toContain(fragment);
        }
        expect(body).not.toMatch(/\bOFFSET\b/i);
    });

    it('達成時だけ全現memberをuser_id昇順で既存credit RPCへ渡す', () => {
        const body = settlementBody();
        expect(body).toContain('FOREACH v_user_id IN ARRAY v_member_ids LOOP');
        expect(body).toContain('public.credit_balance(');
        expect(body).toContain("'GROUP_CHALLENGE_REWARD'");
        expect(body).toContain(
            "'group_challenge_reward:' || p_challenge_id::text || ':' || v_user_id::text",
        );
        expect(body).toContain('v_challenge.end_date');
        expect(position('array_agg(member_steps.user_id ORDER BY member_steps.user_id)'))
            .toBeLessThan(position('FOREACH v_user_id IN ARRAY v_member_ids LOOP'));
    });

    it('1件のcredit失敗を例外化して全member入金とsettled markをrollbackする', () => {
        const body = settlementBody();
        const credit = position('v_credit := public.credit_balance');
        const participantUpdate = position('UPDATE public.challenge_participants');
        const settledUpdate = position('UPDATE public.challenges');

        expect(body).toContain(
            "COALESCE((v_credit ->> 'success')::boolean, false) IS NOT TRUE",
        );
        expect(body).toContain("RAISE EXCEPTION 'GROUP challenge credit failed for member %'");
        expect(credit).toBeLessThan(participantUpdate);
        expect(participantUpdate).toBeLessThan(settledUpdate);
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(body).not.toContain('EXCEPTION WHEN OTHERS');
    });

    it('未達でもparticipant状態とsettled結果を原子的に確定する', () => {
        const body = settlementBody();
        expect(body).toContain('is_completed = v_is_completed AND participant.user_id = ANY(v_member_ids)');
        expect(body).toContain('settled_at = v_settled_at');
        expect(body).toContain('settlement_completed = v_is_completed');
        expect(body).toContain('settled_total_steps = v_total_steps');
        expect(body).toContain('settled_member_count = v_member_count');
        expect(body).toContain("'settled'::text");
    });

    it('専用transaction typeをconstraint・credit allowlist・生涯一意keyへ接続する', () => {
        expect(migration).toContain("'GROUP_CHALLENGE_REWARD'");
        expect(migration).toMatch(
            /p_type NOT IN \([\s\S]*'GROUP_CHALLENGE_REWARD'[\s\S]*\) THEN/,
        );
        expect(migration).toContain(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_idempotency',
        );
        expect(migration).toContain("'group_challenge_reward:'");
        expect(migration).toContain(
            'PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE',
        );
    });

    it('固定search_pathとservice-role専用権限を強制する', () => {
        expect(migration).toContain('SECURITY DEFINER');
        expect(migration).toContain("SET search_path = ''");
        expect(migration).toMatch(
            /REVOKE ALL ON FUNCTION public\.settle_group_challenge\(uuid\)[\s\S]+FROM PUBLIC, anon, authenticated;/,
        );
        expect(migration).toMatch(
            /GRANT EXECUTE ON FUNCTION public\.settle_group_challenge\(uuid\)[\s\S]+TO service_role;/,
        );
        expect(migration).not.toContain('auth.users');
    });
});
