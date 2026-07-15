import { describe, expect, it } from 'vitest';

import {
    getChallengePriorityMetrics,
    isActionableChallenge,
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

describe('getChallengePriorityMetrics', () => {
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
