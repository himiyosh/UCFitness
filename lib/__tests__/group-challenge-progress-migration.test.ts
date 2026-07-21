import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
    '../../migrations/20260720_get_group_challenge_progress.sql',
    import.meta.url,
), 'utf8');

function functionBody(): string {
    const match = migration.match(/AS \$\$([\s\S]+?)\$\$;/);
    expect(match).not.toBeNull();
    return match?.[1] ?? '';
}

describe('get_group_challenge_progress migration', () => {
    it('集計本体を単一SQL statementと同一snapshotに保つ', () => {
        const body = functionBody();
        expect(body.match(/;/g)).toHaveLength(1);
        for (const fragment of [
            'WITH challenge_scope AS MATERIALIZED', 'access_decision AS',
            'eligible_participants AS', 'progress AS',
        ]) expect(body).toContain(fragment);
        expect(body).not.toContain('FOR UPDATE');
        expect(body).not.toMatch(/\bOFFSET\b/i);
    });

    it('GROUP challengeとviewerの現membership・参加をDB内で再検証する', () => {
        for (const rule of [
            "challenge.type = 'GROUP'", 'challenge.group_id IS NOT NULL',
            'viewer_membership.group_id = challenge.group_id', 'viewer_membership.user_id = p_viewer_id',
            'viewer_participation.challenge_id = challenge.id', 'viewer_participation.user_id = p_viewer_id',
            "NOT scope.viewer_is_member AND NOT scope.is_public THEN 'not_found'",
            "NOT scope.viewer_is_member THEN 'forbidden'",
        ]) expect(migration).toContain(rule);
    });

    it('参加者と現memberをintersectionし、inclusive期間の正歩数だけを集計する', () => {
        for (const rule of [
            'SELECT DISTINCT participant.user_id', 'current_member.group_id = scope.group_id',
            'current_member.user_id = participant.user_id', 'step.date >= scope.start_date',
            'step.date <= scope.end_date', 'FILTER (WHERE step.steps > 0)',
        ]) expect(migration).toContain(rule);
    });

    it('SUMとcountをbigintのnamed columnsとして返す', () => {
        for (const rule of [
            'total_steps bigint', 'participant_count bigint',
            'COUNT(DISTINCT eligible.user_id)::bigint', 'SUM(step.steps::bigint)',
            'is_completed boolean',
        ]) expect(migration).toContain(rule);
    });

    it('固定search_pathとservice-role専用権限、rollbackを定義する', () => {
        expect(migration).toContain('SECURITY DEFINER');
        expect(migration).toContain('SET search_path = public, pg_temp');
        expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated;/);
        expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role;/);
        expect(migration).toContain('Service-role boundary');
        expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.get_group_challenge_progress');
        expect(migration).toContain('DROP FUNCTION IF EXISTS public.get_group_challenge_progress(uuid, uuid);');
        expect(migration).not.toContain('auth.users');
    });
});
