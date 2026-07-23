import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
    order: vi.fn(),
    reportError: vi.fn(),
}));

vi.mock('@/lib/errors', () => ({
    reportError: mocks.reportError,
}));

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        from: mocks.from,
    },
}));

import { getPersonalAnalytics } from './analytics-service';

function getCurrentAndPreviousMonthDates(): {
    currentDate: string;
    previousDate: string;
} {
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const currentYear = jstNow.getUTCFullYear();
    const currentMonth = jstNow.getUTCMonth();
    const previousMonth = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    return {
        currentDate: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-02`,
        previousDate: `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}-02`,
    };
}

describe('getPersonalAnalytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.from.mockReturnValue({
            select: () => ({
                eq: () => ({
                    gte: () => ({
                        lte: () => ({
                            order: mocks.order,
                        }),
                    }),
                }),
            }),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('記録済み0歩がある場合、記録日平均へ含めて活動日から除外する', async () => {
        mocks.order.mockResolvedValue({
            data: [
                { date: '2026-07-06', steps: 0 },
                { date: '2026-07-13', steps: 10_000 },
            ],
            error: null,
        });

        const result = await getPersonalAnalytics('user-1');

        expect(result.dailyAverage).toBe(5_000);
        expect(result.weekdayAverages[1]).toBe(5_000);
        expect(result.monthlyTotals[0]).toMatchObject({
            avgSteps: 5_000,
            activeDays: 1,
        });
    });

    it('すべて0歩の場合、ベストデーを返さない', async () => {
        mocks.order.mockResolvedValue({
            data: [
                { date: '2026-07-06', steps: 0 },
                { date: '2026-07-07', steps: 0 },
            ],
            error: null,
        });

        const result = await getPersonalAnalytics('user-1');

        expect(result.bestDay).toBeNull();
        expect(result.dailyAverage).toBe(0);
    });

    it('前月が0歩の場合、比較率を返さない', async () => {
        const { currentDate, previousDate } = getCurrentAndPreviousMonthDates();
        mocks.order.mockResolvedValue({
            data: [
                { date: previousDate, steps: 0 },
                { date: currentDate, steps: 1_000 },
            ],
            error: null,
        });

        const result = await getPersonalAnalytics('user-1');

        expect(result.currentMonthVsPrev).toBeNull();
    });

    it('月途中の場合、前月同日までの歩数と比較する', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-12T00:00:00Z'));
        mocks.order.mockResolvedValue({
            data: [
                { date: '2026-06-05', steps: 1_000 },
                { date: '2026-06-20', steps: 9_000 },
                { date: '2026-07-05', steps: 2_000 },
            ],
            error: null,
        });

        const result = await getPersonalAnalytics('user-1');

        expect(result.currentMonthVsPrev).toEqual({
            current: 2_000,
            previous: 1_000,
            changePercent: 100,
        });
    });
});
