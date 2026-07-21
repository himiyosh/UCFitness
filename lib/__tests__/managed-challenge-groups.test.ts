import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildChallengeCreatePayload } from '@/lib/challenge-create';
import { loadManagedChallengeGroups, normalizeManagedChallengeGroups } from '@/lib/services/managed-challenge-groups';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@/lib/errors', () => ({ reportError: mocks.reportError }));

const groupA = { id: '11111111-1111-4111-8111-111111111111', name: 'Alpha' };
const groupB = { id: '22222222-2222-4222-8222-222222222222', name: 'Zulu' };

describe('managed challenge groups', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.from.mockReturnValue({ select: mocks.select });
        mocks.select.mockReturnValue({ eq: mocks.eq });
        mocks.eq.mockReturnValue({ in: mocks.in });
    });

    it('OWNER/ADMINだけを一括取得し、relation形状を正規化して重複排除・安定整列する', async () => {
        mocks.in.mockResolvedValue({
            data: [
                { role: 'ADMIN', groups: [groupB] },
                { role: 'OWNER', groups: groupA },
                { role: 'OWNER', groups: groupA },
            ],
            error: null,
        });

        await expect(loadManagedChallengeGroups('user-1')).resolves.toEqual({
            status: 'available',
            groups: [groupA, groupB],
        });
        expect(mocks.from).toHaveBeenCalledWith('group_members');
        expect(mocks.in).toHaveBeenCalledWith('role', ['OWNER', 'ADMIN']);
        expect(normalizeManagedChallengeGroups(
            [{ role: 'MEMBER', groups: groupA }],
        )).toBeNull();
    });

    it('DBエラーを空グループ成功へ偽装しない', async () => {
        mocks.in.mockResolvedValue({ data: null, error: { message: 'offline' } });
        await expect(loadManagedChallengeGroups('user-1')).resolves.toEqual({
            status: 'unavailable',
            groups: [],
        });
        expect(mocks.reportError).toHaveBeenCalledOnce();
    });

    it('GROUPだけにgroup_idを含め、INDIVIDUAL flowを維持する', () => {
        const form = { title: ' Challenge ', description: '', targetSteps: 10_000,
            startDate: '2026-07-20', endDate: '2026-07-27', rewardUC: 500,
            groupId: groupA.id };
        expect(buildChallengeCreatePayload({ ...form, type: 'GROUP' }))
            .toMatchObject({ type: 'GROUP', group_id: groupA.id });
        expect(buildChallengeCreatePayload({ ...form, type: 'INDIVIDUAL' }))
            .not.toHaveProperty('group_id');
    });

    it('必須select・field error・loading二重送信防止・空/取得不能状態を保持する', () => {
        const source = readFileSync(new URL(
            '../../components/challenge/CreateChallengeModal.tsx', import.meta.url), 'utf8');
        expect(source).toMatch(/<select[\s\S]*onInvalid[\s\S]*required[\s\S]*aria-errormessage/);
        expect(source).toMatch(/if \(submittingRef.current\) return[\s\S]*groupSelectRef.current\?\.focus\(\)/);
        expect(source.match(/if \(submittingRef.current\) return/g)).toHaveLength(2);
        expect(source).toMatch(/status === 'unavailable'[\s\S]*groups.length === 0/);
        expect(source).toContain("throw new Error(t('createFailed'))");
        expect(source).toMatch(/setType\('INDIVIDUAL'\)[\s\S]*setGroupId\(''\)/);
    });
});
