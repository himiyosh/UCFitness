import { describe, expect, it } from 'vitest';

import {
    getCommunityDestination,
    getNextSetupStep,
    getPreviousSetupStep,
    getSetupProgressPercent,
    parseCommunityIntent,
    SETUP_STEPS,
    SETUP_TOTAL_STEPS,
} from '@/lib/setup-flow';

describe('setup-flow', () => {
    it('3ステップを33%・67%・100%の順で進める', () => {
        expect(SETUP_STEPS).toEqual([1, 2, 3]);
        expect(SETUP_TOTAL_STEPS).toBe(3);
        expect(SETUP_STEPS.map(getSetupProgressPercent)).toEqual([33, 67, 100]);
        expect(getNextSetupStep(1)).toBe(2);
        expect(getNextSetupStep(2)).toBe(3);
        expect(getNextSetupStep(3)).toBe(3);
    });

    it('戻る操作を最初の画面より前へ進めない', () => {
        expect(getPreviousSetupStep(3)).toBe(2);
        expect(getPreviousSetupStep(2)).toBe(1);
        expect(getPreviousSetupStep(1)).toBe(1);
    });

    it('グループ・チャレンジ・後での完了導線を安全に解決する', () => {
        expect(parseCommunityIntent('groups')).toBe('groups');
        expect(parseCommunityIntent('challenges')).toBe('challenges');
        expect(parseCommunityIntent('unexpected')).toBe('later');
        expect(parseCommunityIntent(undefined)).toBe('later');
        expect(getCommunityDestination('groups')).toBe('/groups');
        expect(getCommunityDestination('challenges')).toBe('/challenges');
        expect(getCommunityDestination('later')).toBeNull();
    });
});
