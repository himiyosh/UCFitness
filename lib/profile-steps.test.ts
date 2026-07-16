import { describe, expect, it } from 'vitest';

import { summarizeProfileSteps } from '@/lib/profile-steps';

describe('summarizeProfileSteps', () => {
    it('記録済み0歩を未記録と区別して期間合計へ含める', () => {
        const result = summarizeProfileSteps([
            { date: '2026-07-13', steps: 1_000 },
            { date: '2026-07-14', steps: 0 },
            { date: '2026-07-15', steps: 0 },
        ], '2026-07-15', '2026-07-13', '2026-07-01');

        expect(result).toEqual({
            daily: 0,
            weekly: 1_000,
            monthly: 1_000,
            averageSteps: 333,
            activeDays: 1,
            recordedDays: 3,
        });
    });

    it('記録がない期間は0ではなくnullを返す', () => {
        const result = summarizeProfileSteps(
            [],
            '2026-07-15',
            '2026-07-13',
            '2026-07-01',
        );

        expect(result).toEqual({
            daily: null,
            weekly: null,
            monthly: null,
            averageSteps: null,
            activeDays: 0,
            recordedDays: 0,
        });
    });

    it('未来日の記録を現在期間へ含めない', () => {
        const result = summarizeProfileSteps([
            { date: '2026-07-15', steps: 500 },
            { date: '2026-07-16', steps: 9_000 },
        ], '2026-07-15', '2026-07-13', '2026-07-01');

        expect(result.daily).toBe(500);
        expect(result.weekly).toBe(500);
        expect(result.monthly).toBe(500);
        expect(result.recordedDays).toBe(1);
    });
});
