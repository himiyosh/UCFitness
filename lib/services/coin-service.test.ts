import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: {} }));

import { calculateStreakDays } from '@/lib/services/coin-service';

describe('calculateStreakDays', () => {
    it('複数のシールド利用日を含む365日ストリークを維持する', () => {
        const currentDate = new Date('2026-07-17T00:00:00Z');
        const shieldOffsets = new Set([30, 200]);
        const shieldDates = new Set<string>();
        const history = Array.from({ length: 365 }, (_, offset) => {
            const date = new Date(currentDate);
            date.setUTCDate(date.getUTCDate() - offset);
            const dateStr = date.toISOString().split('T')[0];
            if (shieldOffsets.has(offset)) shieldDates.add(dateStr);
            return { date: dateStr, steps: shieldOffsets.has(offset) ? 0 : 10_000 };
        });

        expect(calculateStreakDays(history, shieldDates, '2026-07-17', 10_000))
            .toBe(365);
        shieldDates.delete(history[30].date);
        expect(calculateStreakDays(history, shieldDates, '2026-07-17', 10_000))
            .toBe(30);
    });
});
