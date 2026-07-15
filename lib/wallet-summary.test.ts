import { describe, expect, it } from 'vitest';

import {
    getNextWalletReward,
    summarizeWalletTransactions,
} from '@/lib/wallet-summary';

describe('summarizeWalletTransactions', () => {
    const transactions = [
        { date: '2026-07-15', amount: 1_000 },
        { date: '2026-07-15', amount: 200 },
        { date: '2026-07-15', amount: -500 },
        { date: '2026-07-14', amount: 300 },
    ];

    it('今日の獲得・支出・純増減を分離する', () => {
        expect(summarizeWalletTransactions(transactions, '2026-07-15')).toEqual({
            earned: 1_200,
            spent: 500,
            net: 700,
        });
    });

    it('購入だけの日を入金マイナスとして扱わない', () => {
        expect(summarizeWalletTransactions([
            { date: '2026-07-15', amount: -800 },
        ], '2026-07-15')).toEqual({
            earned: 0,
            spent: 800,
            net: -800,
        });
    });
});

describe('getNextWalletReward', () => {
    it('目標まで100歩以上なら次の100歩を返す', () => {
        expect(getNextWalletReward(7_500, 10_000)).toEqual({
            steps: 100,
            baseUc: 100,
            goalBonusUc: 0,
        });
    });

    it('目標直前は到達までの歩数と目標ボーナスを返す', () => {
        expect(getNextWalletReward(9_950, 10_000)).toEqual({
            steps: 50,
            baseUc: 50,
            goalBonusUc: 2_000,
        });
    });

    it('目標達成後も次の100歩の基本UCを返す', () => {
        expect(getNextWalletReward(12_000, 10_000)).toEqual({
            steps: 100,
            baseUc: 100,
            goalBonusUc: 0,
        });
    });

    it('歩数または目標が取得不能ならnullを返す', () => {
        expect(getNextWalletReward(null, 10_000)).toBeNull();
        expect(getNextWalletReward(1_000, null)).toBeNull();
    });
});
