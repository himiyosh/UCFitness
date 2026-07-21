import { describe, expect, it } from 'vitest';

import {
    buildProfileTimeline,
    getProfileTimelineWindow,
    groupProfileTimelineEntries,
} from '@/lib/profile-timeline';
const challenge = {
    id: 'challenge-1', title: 'July Quest', type: 'INDIVIDUAL',
    target_steps: 10_000, start_date: '2026-07-01',
    end_date: '2026-07-10', reward_uc: 25,
};

describe('buildProfileTimeline', () => {
    it('relation形状を正規化し、DBフラグだけで達成を判定する', () => {
        const result = buildProfileTimeline([
            {
                id: 'p1', challenge, progress_steps: 10_000,
                is_completed: false, completed_at: null,
            },
            {
                id: 'p2', challenge: [{ ...challenge, title: 'Finished Quest' }],
                progress_steps: 10_000, is_completed: true,
                completed_at: '2026-07-01T15:30:00.000Z',
            },
        ], [], '2026-07-15');

        expect(result.entries).toMatchObject([
            { title: 'July Quest', status: 'ended', occurredOn: '2026-07-10' },
            { title: 'Finished Quest', status: 'completed', occurredOn: '2026-07-02' },
        ]);
        expect(result.malformedChallengeCount).toBe(0);
    });
    it('不明な達成・獲得日時に偽の日付を作らない', () => {
        const result = buildProfileTimeline([{
            id: 'p1', challenge, progress_steps: 10_000,
            is_completed: true, completed_at: null,
        }], [{
            badge_code: 'STREAK_7', period_date: '2026-07-01',
            awarded_at: null, badges: { name: 'Seven day streak' },
        }], '2026-07-15');

        expect(result.entries.every((entry) => entry.occurredOn === null)).toBe(true);
        expect(groupProfileTimelineEntries(result.entries)[0].monthKey).toBeNull();
    });
    it('進行中行を除外し、不正形状だけを計数する', () => {
        const result = buildProfileTimeline([
            { id: 'active', challenge: { ...challenge, end_date: '2026-07-20' }, is_completed: false },
            { id: 'invalid', challenge, is_completed: 'false' },
        ], [{ badge_code: 'STREAK_7' }], '2026-07-15');
        expect(result.entries).toEqual([]);
        expect(result.malformedChallengeCount).toBe(1);
        expect(result.malformedBadgeCount).toBe(1);
    });
});
it('成長タイムラインを初期10件から10件ずつ段階開示する', () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
        id: `badge:${index}`, kind: 'badge' as const, badgeCode: `B${index}`,
        occurredOn: '2026-07-01', title: `Badge ${index}`,
    }));
    expect(getProfileTimelineWindow(entries, 10)).toMatchObject({
        visibleEntries: { length: 10 }, remainingCount: 15, nextBatchCount: 10,
    });
    expect(getProfileTimelineWindow(entries, 20)).toMatchObject({
        visibleEntries: { length: 20 }, remainingCount: 5, nextBatchCount: 5,
    });
});
