import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
    '../../migrations/20260723_claim_group_challenge_reward_outbox.sql',
    import.meta.url,
), 'utf8');

function functionBody(name: string): string {
    const match = migration.match(new RegExp(
        `CREATE FUNCTION public\\.${name}[\\s\\S]+?AS \\$\\$([\\s\\S]+?)\\$\\$;`,
    ));
    expect(match).not.toBeNull();
    return match?.[1] ?? '';
}

describe('group challenge reward outbox delivery migration', () => {
    it('claimは安定順で最大20ユーザーのuser行だけをSKIP LOCKEDする', () => {
        const body = functionBody('claim_group_challenge_reward_outbox');

        expect(body).toContain('DISTINCT ON (queue.user_id)');
        expect(body).toContain(
            'ORDER BY queue.user_id, queue.created_at, queue.id',
        );
        expect(body).toMatch(
            /candidate\.first_created_at,\s+candidate\.first_id,\s+candidate\.user_id/,
        );
        expect(body).toMatch(
            /LIMIT 20\s+FOR UPDATE OF app_user SKIP LOCKED/,
        );
        expect(body).not.toMatch(/\bOFFSET\b/i);
    });

    it('claimはactive lease中のuserを除外し期限切れleaseを再取得する', () => {
        const body = functionBody('claim_group_challenge_reward_outbox');

        expect(body).toContain('active_lease.lease_expires_at > v_claimed_at');
        expect(body).toContain('queue.lease_expires_at <= v_claimed_at');
        expect(body).toContain("interval '5 minutes'");
        expect(body).toContain('queue.delivered_at IS NULL');
    });

    it('claimはuser lock後の新snapshotで全claim可能eventを同一leaseへ更新する', () => {
        const body = functionBody('claim_group_challenge_reward_outbox');
        const userLock = body.indexOf('FOR UPDATE OF app_user SKIP LOCKED');
        const recheck = body.indexOf('FROM unnest(v_user_ids) WITH ORDINALITY');
        const update = body.indexOf(
            'UPDATE public.group_challenge_reward_outbox AS queue',
        );

        expect(userLock).toBeGreaterThan(-1);
        expect(userLock).toBeLessThan(
            body.lastIndexOf('v_claimed_at := clock_timestamp()'),
        );
        expect(userLock).toBeLessThan(recheck);
        expect(recheck).toBeLessThan(update);
        expect(body).toContain('claim_id = v_lease_id');
        expect(body).toContain('lease_expires_at = v_lease_expires_at');
        expect(body).toContain('queue.user_id = ANY(v_user_ids)');
    });

    it('claim返却はuser単位bigint集約だけでraw eventを公開しない', () => {
        expect(migration).toMatch(
            /RETURNS TABLE \(\s*user_id uuid,\s*challenge_count bigint,\s*total_reward bigint,\s*lease_id uuid,\s*lease_expires_at timestamptz\s*\)/,
        );
        const body = functionBody('claim_group_challenge_reward_outbox');

        expect(body).toContain('COUNT(*)::bigint');
        expect(body).toContain('SUM(claimed.reward_amount)');
        expect(body).toContain(
            'GROUP BY candidate.user_id, candidate.ordinality',
        );
        expect(body).not.toMatch(/jsonb_agg|array_agg\(claimed|challenge_id/);
    });

    it('completeはuserとleaseの所有権・有効期限を検証して全対象rowを配送済みにする', () => {
        const body = functionBody(
            'complete_group_challenge_reward_outbox',
        );

        expect(body).toContain('p_user_id IS NULL OR p_lease_id IS NULL');
        expect(body).toContain(
            "RAISE EXCEPTION 'Reward outbox lease ownership mismatch'",
        );
        expect(body).toContain(
            "RAISE EXCEPTION 'Reward outbox lease has expired'",
        );
        expect(body).toContain('delivered_at = v_now');
        expect(body).toContain('claim_id = NULL');
        expect(body).toContain('lease_expires_at = NULL');
        expect(body).toContain('claim_id = p_lease_id');
    });

    it('releaseは所有権を検証して全対象rowのattemptを安全にincrementする', () => {
        const body = functionBody(
            'release_group_challenge_reward_outbox',
        );

        expect(body).toContain('attempt_count = attempt_count + 1');
        expect(body).toContain(
            'v_max_attempt_count = 9223372036854775807::bigint',
        );
        expect(body).toContain(
            "RAISE EXCEPTION 'Reward outbox attempt count exhausted'",
        );
        expect(migration).toContain(
            'ALTER COLUMN attempt_count TYPE bigint',
        );
    });

    it('completeとreleaseはuser行から全pending rowの順でlockする', () => {
        for (const name of [
            'complete_group_challenge_reward_outbox',
            'release_group_challenge_reward_outbox',
        ]) {
            const body = functionBody(name);
            const userLock = body.indexOf(
                'PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE',
            );
            const outboxLock = body.indexOf(
                'FROM public.group_challenge_reward_outbox',
            );

            expect(userLock).toBeGreaterThan(-1);
            expect(userLock).toBeLessThan(outboxLock);
            expect(outboxLock).toBeLessThan(
                body.indexOf('v_now := clock_timestamp()'),
            );
            expect(body).not.toContain('EXCEPTION WHEN OTHERS');
        }
    });

    it('3 RPCは固定search_pathとservice-role専用EXECUTEを強制する', () => {
        expect(migration).toContain(
            'Supabase migration owner to retain BYPASSRLS',
        );
        expect(migration.match(/SECURITY DEFINER/g)).toHaveLength(3);
        expect(migration.match(/SET search_path = ''/g)).toHaveLength(3);

        for (const signature of [
            'claim_group_challenge_reward_outbox\\(\\)',
            'complete_group_challenge_reward_outbox\\(uuid, uuid\\)',
            'release_group_challenge_reward_outbox\\(uuid, uuid\\)',
        ]) {
            expect(migration).toMatch(new RegExp(
                `REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM PUBLIC, anon, authenticated;`,
            ));
            expect(migration).toMatch(new RegExp(
                `GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO service_role;`,
            ));
        }
    });

    it('outbox tableとsequenceの直接権限を全API roleから剥奪する', () => {
        expect(migration).toMatch(
            /REVOKE ALL ON TABLE public\.group_challenge_reward_outbox\s+FROM PUBLIC, anon, authenticated, service_role;/,
        );
        expect(migration).toMatch(
            /REVOKE ALL ON SEQUENCE public\.group_challenge_reward_outbox_id_seq\s+FROM PUBLIC, anon, authenticated, service_role;/,
        );
    });

    it('migrationはtransactionとrollback順序を明示する', () => {
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(migration).toContain('Drop the three reward outbox delivery functions');
        expect(migration).toContain(
            'Restore attempt_count to integer only after verifying every value fits',
        );
        expect(migration).toContain(
            'Restore the 20260722 service_role table and sequence grants',
        );
    });
});
