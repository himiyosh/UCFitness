import { describe, expect, it } from 'vitest';

import { evaluateMission, generateDailyMissions } from './mission-utils';

describe('generateDailyMissions', () => {
    it('直近平均が1000歩未満の場合、100歩と500歩を選ぶ', () => {
        const missions = generateDailyMissions('2026-07-12', 0);

        expect(missions.map((mission) => mission.type)).toEqual([
            'LOGIN',
            'WALK_100',
            'WALK_500',
        ]);
    });

    it('直近平均が3000歩未満の場合、500歩と1000歩を選ぶ', () => {
        const missions = generateDailyMissions('2026-07-12', 2_500);

        expect(missions.map((mission) => mission.type)).toEqual([
            'LOGIN',
            'WALK_500',
            'WALK_1K',
        ]);
    });

    it('直近平均が8000歩以上の場合、難易度の異なる歩数ミッションを選ぶ', () => {
        const missions = generateDailyMissions('2026-07-12', 9_000);
        const walkTypes = missions.slice(1).map((mission) => mission.type);

        expect(walkTypes.some((type) => ['WALK_1K', 'WALK_3K', 'WALK_5K'].includes(type))).toBe(true);
        expect(walkTypes.some((type) => ['WALK_8K', 'WALK_10K', 'WALK_15K'].includes(type))).toBe(true);
        expect(walkTypes).not.toContain('WALK_100');
        expect(walkTypes).not.toContain('WALK_500');
    });
});

describe('evaluateMission', () => {
    it('500歩ミッションで閾値以上の場合、達成として返す', () => {
        expect(evaluateMission('WALK_500', 500)).toBe(true);
    });
});
