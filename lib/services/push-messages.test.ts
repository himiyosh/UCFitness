import { describe, expect, it } from 'vitest';

import {
    badgeUnlockedBody,
    badgeUnlockedTitle,
    formatLocalizedBadgeNames,
    normalizePushLocale,
    stepReminderBody,
    testNotificationBody,
    testNotificationTitle,
} from '@/lib/services/push-messages';

describe('normalizePushLocale', () => {
    it('英語設定の場合、英語を返す', () => {
        expect(normalizePushLocale('en')).toBe('en');
    });

    it('未設定または未知の言語の場合、日本語を返す', () => {
        expect(normalizePushLocale(null)).toBe('ja');
        expect(normalizePushLocale('fr')).toBe('ja');
    });
});

describe('formatLocalizedBadgeNames', () => {
    it('日本語ユーザーの場合、バッジコードを日本語名へ変換する', () => {
        expect(formatLocalizedBadgeNames('ja', [
            'STREAK_3',
            'MILESTONE_100K',
        ])).toEqual({
            label: '「3日連続ストリーク」、「累計10万歩達成」',
            count: 2,
        });
    });

    it('英語ユーザーの場合、重複を除いて3件と残数を要約する', () => {
        expect(formatLocalizedBadgeNames('en', [
            'STREAK_3',
            'MILESTONE_100K',
            'GLOBAL_DAILY_1',
            'GROUP_DAILY_1',
            'STREAK_3',
        ])).toEqual({
            label: '3-Day Streak, 100K Steps Milestone, Global Daily 1st, and 1 more',
            count: 4,
        });
    });
});

describe('badge notification messages', () => {
    it('複数バッジの場合、言語別に件数を含む1通の文言を生成する', () => {
        expect(badgeUnlockedTitle('ja', 3)).toBe('🎉 バッジを3個獲得！🏆');
        expect(badgeUnlockedBody('ja', '「A」、「B」、「C」', 3))
            .toBe('おめでとう！「A」、「B」、「C」をまとめて獲得しました ✨');
        expect(badgeUnlockedTitle('en', 3)).toBe('🎉 3 New Badges! 🏆');
        expect(badgeUnlockedBody('en', 'A, B, C', 3))
            .toBe('Congratulations! You earned A, B, C ✨');
    });
});

describe('localized utility notifications', () => {
    it('テスト通知と歩数リマインダーをユーザー言語で生成する', () => {
        expect(testNotificationTitle('ja')).toBe('🔔 通知テスト');
        expect(testNotificationBody('en'))
            .toBe('You can receive notifications from UCFitness.');
        expect(stepReminderBody('ja', 3200, 10000, 32, 6800))
            .toContain('あと 6,800 歩');
        expect(stepReminderBody('en', 3200, 10000, 32, 6800))
            .toContain('6,800 steps to go');
    });
});
