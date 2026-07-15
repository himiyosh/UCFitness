import { describe, expect, it } from 'vitest';

import {
    getAuthErrorMessageKey,
    getLocaleSwitchQuery,
    getPostLoginRedirect,
    getPostSetupReturnPath,
    getSafeAuthCallbackPath,
} from './auth-flow';

describe('getAuthErrorMessageKey', () => {
    it('公開可能な認証エラー種別だけへ正規化する', () => {
        expect(getAuthErrorMessageKey('AccessDenied')).toBe('accessDenied');
        expect(getAuthErrorMessageKey('OAuthAccountNotLinked')).toBe('accountMismatch');
        expect(getAuthErrorMessageKey('Configuration')).toBe('unavailable');
        expect(getAuthErrorMessageKey('OAuthCallbackError')).toBe('retry');
    });

    it('エラーがない場合は通知を表示しない', () => {
        expect(getAuthErrorMessageKey(null)).toBeNull();
        expect(getAuthErrorMessageKey('')).toBeNull();
    });
});

describe('getSafeAuthCallbackPath', () => {
    it('同一オリジンのアプリ内パスを保持する', () => {
        expect(getSafeAuthCallbackPath('/en/settings?source=google-health#connection', 'en'))
            .toBe('/en/settings?source=google-health#connection');
    });

    it('戻り先のロケールを現在の表示言語へ揃える', () => {
        expect(getSafeAuthCallbackPath('/ja/settings?source=google-health#connection', 'en'))
            .toBe('/en/settings?source=google-health#connection');
    });

    it.each([
        'https://example.com/steal',
        '//example.com/steal',
        '/\\example.com/steal',
        null,
    ])('外部または不正な戻り先 %s をロケールのホームへ置換する', (nextPath) => {
        expect(getSafeAuthCallbackPath(nextPath, 'en')).toBe('/en');
    });

    it('未知のロケールを既定言語へ制限する', () => {
        expect(getSafeAuthCallbackPath(null, '../../outside')).toBe('/ja');
    });
});

describe('getLocaleSwitchQuery', () => {
    it('認証必須の戻り先を切替後の言語へ揃え、他のqueryを保持する', () => {
        expect(getLocaleSwitchQuery(
            'auth=required&next=%2Fja%2Fleaderboard&error=AccessDenied',
            'en',
        )).toBe('auth=required&next=%2Fen%2Fleaderboard&error=AccessDenied');
    });

    it('戻り先がないqueryをそのまま保持する', () => {
        expect(getLocaleSwitchQuery('error=AccessDenied', 'ja')).toBe('error=AccessDenied');
    });
});

describe('getPostLoginRedirect', () => {
    it('認証済み新規ユーザーをsetupへ送る', () => {
        expect(getPostLoginRedirect(false, null)).toBe('/setup');
        expect(getPostLoginRedirect(false, '   ')).toBe('/setup');
    });

    describe('getPostSetupReturnPath', () => {
        it('セットアップ後も認証開始前の保護画面へ戻れる', () => {
            expect(getPostSetupReturnPath('/ja/leaderboard?period=WEEKLY', 'en'))
                .toBe('/en/leaderboard?period=WEEKLY');
        });

        it.each(['/setup', '/ja/setup', '/en/setup'])(
            'セットアップ自身への循環 %s を拒否する',
            (path) => {
                expect(getPostSetupReturnPath(path, 'ja')).toBeNull();
            },
        );

        it('保存済み戻り先がなければ通常のActivation導線を維持する', () => {
            expect(getPostSetupReturnPath(null, 'ja')).toBeNull();
        });
    });

    it('セットアップ済みユーザーはホームを継続する', () => {
        expect(getPostLoginRedirect(false, 'walker')).toBeNull();
    });

    it('ユーザーDB障害を未設定へ偽装しない', () => {
        expect(getPostLoginRedirect(true, null)).toBeNull();
    });
});
