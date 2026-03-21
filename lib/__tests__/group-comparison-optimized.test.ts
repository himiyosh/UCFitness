import { describe, it, expect } from 'vitest';

describe('Performance optimization test', () => {
    it('Should match the original logic correctly', () => {
        const map = new Map<string, any>();
        const currentDate = new Date('2024-01-01');
        const mapKeysStr: string[] = [];
        for (let i = 0; i < 52; i++) {
            const k = currentDate.toISOString().split('T')[0];
            map.set(k, {});
            mapKeysStr.push(k);
            currentDate.setDate(currentDate.getDate() + 7);
        }

        const datesToTest = [
            '2024-01-01', '2024-01-02', '2024-01-07', '2024-01-08',
            '2024-02-28', '2024-02-29', '2024-03-01', '2024-12-25',
            '2024-12-31', '2025-01-01', '2023-12-31'
        ];

        datesToTest.forEach(rowDateStr => {
            const rowDate = new Date(rowDateStr);
            let bestKeyOriginal = null;
            for (const k of map.keys()) {
                const weekStartDate = new Date(k);
                const weekEndDate = new Date(weekStartDate);
                weekEndDate.setDate(weekEndDate.getDate() + 6);

                if (rowDate >= weekStartDate && rowDate <= weekEndDate) {
                    bestKeyOriginal = k;
                    break;
                }
            }

            let bestKeyOptimized = null;
            if (mapKeysStr.length > 0) {
                const firstWeekStr = mapKeysStr[0];
                const firstWeekMs = Date.UTC(parseInt(firstWeekStr.substring(0,4), 10), parseInt(firstWeekStr.substring(5,7), 10)-1, parseInt(firstWeekStr.substring(8,10), 10));
                const weekMs = 7 * 24 * 60 * 60 * 1000;

                const rY = parseInt(rowDateStr.substring(0,4), 10);
                const rM = parseInt(rowDateStr.substring(5,7), 10) - 1;
                const rD = parseInt(rowDateStr.substring(8,10), 10);
                const rowMs = Date.UTC(rY, rM, rD);

                const diffMs = rowMs - firstWeekMs;

                if (diffMs >= 0) {
                    const weekIndex = Math.floor(diffMs / weekMs);
                    if (weekIndex >= 0 && weekIndex < mapKeysStr.length) {
                        bestKeyOptimized = mapKeysStr[weekIndex];
                    }
                }
            }

            expect(bestKeyOptimized).toBe(bestKeyOriginal);
        });
    });
});
