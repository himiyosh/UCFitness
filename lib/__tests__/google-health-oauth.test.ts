import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLoginRequiredRedirect } from '@/lib/auth-redirect';
import {
    createGoogleHealthOAuthState,
    isMatchingGoogleHealthOAuthState,
    normalizeGoogleHealthReturnPath,
    parseGoogleHealthNotice,
} from '@/lib/google-health-oauth';

describe('google-health-oauth', () => {
    const previousNextAuthSecret = process.env.NEXTAUTH_SECRET;

    beforeEach(() => {
        process.env.NEXTAUTH_SECRET = 'test-next-auth-secret';
    });

    afterEach(() => {
        vi.useRealTimers();
        if (previousNextAuthSecret === undefined) {
            delete process.env.NEXTAUTH_SECRET;
        } else {
            process.env.NEXTAUTH_SECRET = previousNextAuthSecret;
        }
    });

    it('OAuth stateを生成した場合、ユーザー署名付きのURLセーフ値を返す', async () => {
        const first = await createGoogleHealthOAuthState('user-1');
        const second = await createGoogleHealthOAuthState('user-1');

        expect(first).toMatch(
            /^v1\.[a-z0-9]+\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/,
        );
        expect(second).not.toBe(first);
    });

    it('OAuth stateが一致し、開始ユーザーも同じ場合のみ検証に成功する', async () => {
        const state = await createGoogleHealthOAuthState('user-1');

        await expect(
            isMatchingGoogleHealthOAuthState(state, state, 'user-1'),
        ).resolves.toBe(true);
        await expect(
            isMatchingGoogleHealthOAuthState(state, state, 'user-2'),
        ).resolves.toBe(false);
        await expect(
            isMatchingGoogleHealthOAuthState(`${state}x`, state, 'user-1'),
        ).resolves.toBe(false);
        await expect(
            isMatchingGoogleHealthOAuthState('', '', 'user-1'),
        ).resolves.toBe(false);
    });

    it('有効期限を過ぎたOAuth stateを拒否する', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-17T00:00:00.000Z'));
        const state = await createGoogleHealthOAuthState('user-1');
        vi.setSystemTime(new Date('2026-06-17T00:11:00.000Z'));

        await expect(
            isMatchingGoogleHealthOAuthState(state, state, 'user-1'),
        ).resolves.toBe(false);
    });

    it('戻り先が設定画面の場合、そのロケール付きパスを保持する', () => {
        expect(normalizeGoogleHealthReturnPath('/ja/settings')).toBe('/ja/settings');
        expect(normalizeGoogleHealthReturnPath('/en/settings')).toBe('/en/settings');
    });

    it('戻り先が外部URLまたは未許可パスの場合、安全な設定画面へ制限する', () => {
        expect(normalizeGoogleHealthReturnPath('https://attacker.example')).toBe('/ja/settings');
        expect(normalizeGoogleHealthReturnPath('/ja/settings/profile')).toBe('/ja/settings');
        expect(normalizeGoogleHealthReturnPath(null)).toBe('/ja/settings');
    });

    it('通知値が許可リスト内の場合のみ、画面表示用の値として受け入れる', () => {
        expect(parseGoogleHealthNotice('connected')).toBe('connected');
        expect(parseGoogleHealthNotice('invalid_state')).toBe('invalid_state');
        expect(parseGoogleHealthNotice('reauthorization_required')).toBe(
            'reauthorization_required',
        );
        expect(parseGoogleHealthNotice('<script>')).toBeNull();
        expect(parseGoogleHealthNotice(undefined)).toBeNull();
    });

    it('再認証通知付き設定画面でセッションが切れた場合、ログイン後の戻り先へ通知を保持する', () => {
        const notice = parseGoogleHealthNotice('reauthorization_required');
        const nextPath = notice
            ? `/settings?health=${notice}`
            : '/settings';

        expect(createLoginRequiredRedirect('ja', nextPath)).toBe(
            '/ja?auth=required&next=%2Fja%2Fsettings%3Fhealth%3Dreauthorization_required',
        );
    });
});
