import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
    '../../migrations/20260719_create_group_challenge_atomic.sql',
    import.meta.url,
), 'utf8');

function position(fragment: string): number {
    const index = migration.indexOf(fragment);
    expect(index).toBeGreaterThan(-1);
    return index;
}

describe('create_group_challenge migration', () => {
    it('challenge作成とcreator参加を同一transactionに含める', () => {
        expect(migration).toMatch(/^BEGIN;/);
        expect(migration).toMatch(/INSERT INTO public\.challenges/);
        expect(migration).toMatch(/INSERT INTO public\.challenge_participants/);
        expect(migration).toMatch(/COMMIT;\s*$/);
        expect(position('INSERT INTO public.challenges'))
            .toBeLessThan(position('INSERT INTO public.challenge_participants'));
    });

    it('既存順序でgroup・creator・membershipを排他ロックする', () => {
        const [groupLock, creatorLock, membershipLock] = [
            position('FROM public.groups'),
            position('FROM public.users'),
            position('FROM public.group_members'),
        ];

        expect(groupLock).toBeLessThan(creatorLock);
        expect(creatorLock).toBeLessThan(membershipLock);
        expect(migration.slice(groupLock, creatorLock)).toContain('FOR UPDATE');
        expect(migration.slice(creatorLock, membershipLock)).toContain('FOR UPDATE');
        expect(migration.slice(membershipLock, position('INSERT INTO public.challenges')))
            .toContain('FOR UPDATE');
    });

    it('公開状態に関係なくOWNERまたはADMINだけを許可する', () => {
        expect(migration).toContain("v_role NOT IN ('OWNER', 'ADMIN')");
        expect(migration).toContain("CASE WHEN v_is_public THEN 'forbidden' ELSE 'not_found' END");
        expect(migration).not.toContain('auth.users');
    });

    it('UUID・GROUP enum・整数・実在日付・文字列をDB境界で検証する', () => {
        for (const rule of [
            'p_group_id uuid', 'p_created_by uuid', "p_type IS DISTINCT FROM 'GROUP'",
            'p_target_steps integer', 'p_target_steps <= 0',
            'p_start_date date', 'p_end_date date', 'p_end_date <= p_start_date',
            'char_length(p_title) > 100', 'char_length(p_description) > 1000',
            'p_reward_uc < 100', 'p_reward_uc > 10000',
        ]) {
            expect(migration).toContain(rule);
        }
    });

    it('SECURITY DEFINERを固定search_pathとservice role専用権限で制限する', () => {
        expect(migration).toContain('SECURITY DEFINER');
        expect(migration).toContain('SET search_path = public, pg_temp');
        expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated;/);
        expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role;/);
        expect(migration).toContain('Service-role boundary');
    });
});
