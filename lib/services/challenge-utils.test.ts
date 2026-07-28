import { describe, expect, it } from 'vitest';

import {
    getChallengeBoundaryTimerDelay,
    getChallengePriorityMetrics,
    getChallengeScheduleMetrics,
    isActionableChallenge,
    MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS,
    sortChallengesForAction,
} from '@/lib/services/challenge-utils';

const NOW = Date.parse('2026-07-15T00:00:00+09:00');

function challenge(
    id: string,
    options: Partial<{
        joined: boolean;
        active: boolean;
        target: number;
        startDate: string;
        endDate: string;
        reward: number;
    }> = {},
) {
    return {
        id,
        is_active: options.active ?? true,
        is_joined: options.joined ?? false,
        target_steps: options.target ?? 10_000,
        start_date: options.startDate ?? '2026-07-10',
        end_date: options.endDate ?? '2026-07-20',
        reward_uc: options.reward ?? 500,
    };
}

describe('sortChallengesForAction', () => {
    it('参加済みを優先し、期限・残り歩数・報酬の順で並べる', () => {
        const challenges = [
            challenge('unjoined-urgent', { endDate: '2026-07-16', reward: 2_000 }),
            challenge('joined-far', { joined: true, endDate: '2026-07-20' }),
            challenge('joined-urgent-more', { joined: true, endDate: '2026-07-16' }),
            challenge('joined-urgent-less', { joined: true, endDate: '2026-07-16' }),
        ];
        const progress = {
            'joined-far': 9_000,
            'joined-urgent-more': 2_000,
            'joined-urgent-less': 8_000,
        };

        expect(sortChallengesForAction(challenges, progress, NOW).map((item) => item.id))
            .toEqual([
                'joined-far',
                'joined-urgent-less',
                'joined-urgent-more',
                'unjoined-urgent',
            ]);
    });

    it('参加済み進捗が取得不能な場合、成功データより後へ分離する', () => {
        const challenges = [
            challenge('unavailable', { joined: true, endDate: '2026-07-16' }),
            challenge('available', { joined: true, endDate: '2026-07-20' }),
        ];

        expect(sortChallengesForAction(
            challenges,
            { unavailable: null, available: 1_000 },
            NOW,
        ).map((item) => item.id)).toEqual(['available', 'unavailable']);
    });
});

describe('getChallengeScheduleMetrics', () => {
    it('viewer timezoneが異なっても開始・終了境界とpriority値を同じJST時刻で返す', () => {
        const scheduledChallenge = challenge('timezone', {
            joined: true,
            startDate: '2026-07-20',
            endDate: '2026-07-25',
        });
        const startAt = Date.parse('2026-07-20T00:00:00+09:00');
        const endBoundaryAt = Date.parse('2026-07-26T00:00:00+09:00');
        const checkpoints = [
            startAt - 1,
            startAt,
            endBoundaryAt - 1,
            endBoundaryAt,
            endBoundaryAt + 1,
        ];
        const originalTimezone = process.env.TZ;

        try {
            const results = [
                'Asia/Tokyo',
                'UTC',
                'America/New_York',
            ].map((timezone) => {
                process.env.TZ = timezone;
                return checkpoints.map((now) => {
                    const scheduleMetrics = getChallengeScheduleMetrics(
                        scheduledChallenge,
                        now,
                    );
                    expect(getChallengePriorityMetrics(scheduledChallenge, 1_000, now))
                        .toMatchObject(scheduleMetrics);
                    return scheduleMetrics;
                });
            });

            expect(results[1]).toEqual(results[0]);
            expect(results[2]).toEqual(results[0]);
            expect(results[0]).toEqual([
                {
                    daysLeft: 7,
                    hasStarted: false,
                    millisecondsUntilStart: 1,
                    millisecondsUntilNextBoundary: 1,
                    isExpired: false,
                },
                {
                    daysLeft: 6,
                    hasStarted: true,
                    millisecondsUntilStart: null,
                    millisecondsUntilNextBoundary: 6 * 24 * 60 * 60 * 1000,
                    isExpired: false,
                },
                {
                    daysLeft: 1,
                    hasStarted: true,
                    millisecondsUntilStart: null,
                    millisecondsUntilNextBoundary: 1,
                    isExpired: false,
                },
                {
                    daysLeft: 0,
                    hasStarted: true,
                    millisecondsUntilStart: null,
                    millisecondsUntilNextBoundary: null,
                    isExpired: true,
                },
                {
                    daysLeft: 0,
                    hasStarted: true,
                    millisecondsUntilStart: null,
                    millisecondsUntilNextBoundary: null,
                    isExpired: true,
                },
            ]);
        } finally {
            if (originalTimezone === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = originalTimezone;
            }
        }
    });

    it('欠落・不正・逆転scheduleは次境界を作らず終了状態へ分離する', () => {
        const invalidSchedules = [
            { start_date: undefined, end_date: '2026-07-20' },
            { start_date: '2026-02-30', end_date: '2026-07-20' },
            { start_date: '2026-07-10', end_date: 'not-a-date' },
            { start_date: '2026-07-21', end_date: '2026-07-20' },
        ];

        for (const schedule of invalidSchedules) {
            expect(getChallengeScheduleMetrics(schedule, NOW)).toEqual({
                daysLeft: 0,
                hasStarted: false,
                millisecondsUntilStart: null,
                millisecondsUntilNextBoundary: null,
                isExpired: true,
            });
        }
    });
});

describe('getChallengePriorityMetrics', () => {
    it('JST開始日の直前は開始前、開始日と等しい時点は開始済みと判定する', () => {
        const startAt = Date.parse('2026-07-20T00:00:00+09:00');
        const futureChallenge = challenge('future', {
            startDate: '2026-07-20',
            endDate: '2026-07-25',
        });

        expect(getChallengePriorityMetrics(futureChallenge, null, startAt - 1))
            .toMatchObject({
                hasStarted: false,
                millisecondsUntilStart: 1,
                millisecondsUntilNextBoundary: 1,
            });
        expect(getChallengePriorityMetrics(futureChallenge, null, startAt))
            .toMatchObject({
                hasStarted: true,
                millisecondsUntilStart: null,
                millisecondsUntilNextBoundary: 6 * 24 * 60 * 60 * 1000,
            });
    });

    it('JST終了日の23時59分59秒までは開催中、翌日0時から終了済みと判定する', () => {
        const endBoundaryAt = Date.parse('2026-07-21T00:00:00+09:00');
        const finalSecondAt = Date.parse('2026-07-20T23:59:59+09:00');
        const endingChallenge = challenge('ending', {
            startDate: '2026-07-10',
            endDate: '2026-07-20',
        });

        expect(getChallengePriorityMetrics(endingChallenge, null, finalSecondAt))
            .toMatchObject({
                daysLeft: 1,
                isExpired: false,
                millisecondsUntilNextBoundary: 1_000,
            });
        expect(getChallengePriorityMetrics(endingChallenge, null, endBoundaryAt - 1))
            .toMatchObject({
                daysLeft: 1,
                isExpired: false,
                millisecondsUntilNextBoundary: 1,
            });
        expect(getChallengePriorityMetrics(endingChallenge, null, endBoundaryAt))
            .toMatchObject({
                daysLeft: 0,
                isExpired: true,
                millisecondsUntilNextBoundary: null,
            });
    });

    it('日付または現在時刻が不正な場合、次境界を作らず操作不可として扱う', () => {
        const invalidSchedules = [
            challenge('invalid-start', { startDate: '2026-02-30' }),
            challenge('invalid-end', { endDate: 'not-a-date' }),
            challenge('reversed', {
                startDate: '2026-07-21',
                endDate: '2026-07-20',
            }),
        ];

        for (const invalidChallenge of invalidSchedules) {
            expect(getChallengePriorityMetrics(invalidChallenge, null, NOW))
                .toMatchObject({
                    daysLeft: 0,
                    hasStarted: false,
                    millisecondsUntilStart: null,
                    millisecondsUntilNextBoundary: null,
                    isExpired: true,
                });
        }
        expect(getChallengePriorityMetrics(challenge('invalid-now'), null, Number.NaN))
            .toMatchObject({
                daysLeft: 0,
                hasStarted: false,
                millisecondsUntilStart: null,
                millisecondsUntilNextBoundary: null,
                isExpired: true,
            });
    });

    it('JSTの終了日から残り日数と残り歩数を算出する', () => {
        expect(getChallengePriorityMetrics(
            challenge('joined', {
                joined: true,
                target: 12_000,
                endDate: '2026-07-16',
            }),
            9_500,
            NOW,
        )).toEqual({
            daysLeft: 2,
            remainingSteps: 2_500,
            progressUnavailable: false,
            hasStarted: true,
            millisecondsUntilStart: null,
            millisecondsUntilNextBoundary: 2 * 24 * 60 * 60 * 1000,
            isExpired: false,
            isCompleted: false,
            nextStepTarget: 500,
        });
    });

    it('終了済み・達成済み・進捗不明を次の行動対象から除外する', () => {
        const active = challenge('active', { joined: true, endDate: '2026-07-16' });
        const expired = challenge('expired', { joined: true, endDate: '2026-07-14' });

        expect(isActionableChallenge(active, 9_500, NOW)).toBe(true);
        expect(isActionableChallenge(active, 10_000, NOW)).toBe(false);
        expect(isActionableChallenge(active, null, NOW)).toBe(false);
        expect(isActionableChallenge(expired, 9_500, NOW)).toBe(false);
        expect(isActionableChallenge(
            challenge('inactive', { joined: true, active: false }),
            9_500,
            NOW,
        )).toBe(false);
        expect(isActionableChallenge(
            challenge('future', {
                joined: true,
                startDate: '2026-07-20',
                endDate: '2026-07-25',
            }),
            0,
            NOW,
        )).toBe(false);
    });
});

describe('getChallengeBoundaryTimerDelay', () => {
    it('長期境界はsetTimeout上限へ制限し、短期境界には境界bufferを加える', () => {
        expect(getChallengeBoundaryTimerDelay(MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS + 1))
            .toBe(MAX_CHALLENGE_BOUNDARY_TIMER_DELAY_MS);
        expect(getChallengeBoundaryTimerDelay(1)).toBe(51);
    });

    it('境界なし・負数・非有限値はtimerを作らない', () => {
        expect(getChallengeBoundaryTimerDelay(null)).toBeNull();
        expect(getChallengeBoundaryTimerDelay(-1)).toBeNull();
        expect(getChallengeBoundaryTimerDelay(Number.NaN)).toBeNull();
        expect(getChallengeBoundaryTimerDelay(Number.POSITIVE_INFINITY)).toBeNull();
    });
});
