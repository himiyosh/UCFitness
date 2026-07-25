import { describe, expect, it } from 'vitest';

import { getPushEndpointOwnershipKey } from '@/lib/push-endpoint';

const ORIGIN = 'https://fcm.googleapis.com';

function endpointWithLength(length: number): string {
    const prefix = `${ORIGIN}/`;
    return `${prefix}${'x'.repeat(length - prefix.length)}`;
}

describe('getPushEndpointOwnershipKey', () => {
    it('host case・default port・fragmentをcanonical keyへ正規化する', () => {
        expect(getPushEndpointOwnershipKey(
            'https://FCM.GOOGLEAPIS.COM:443/fcm/send/device#queued',
        )).toBe(`${ORIGIN}/fcm/send/device`);
    });

    it('ASCII unreservedだけを復号しreservedとUTF-8を大文字percentで保持する', () => {
        expect(getPushEndpointOwnershipKey(
            `${ORIGIN}/A/%41/~/%7e/a%2fb/%e3%81%82?b=%7e&a=%2f`,
        )).toBe(`${ORIGIN}/A/A/~/~/a%2Fb/%E3%81%82?b=~&a=%2F`);
    });

    it('percent encoded slashをmaterial slashと別authorityに保つ', () => {
        expect(getPushEndpointOwnershipKey(`${ORIGIN}/a%2fb`))
            .toBe(getPushEndpointOwnershipKey(`${ORIGIN}/a%2Fb`));
        expect(getPushEndpointOwnershipKey(`${ORIGIN}/a%2Fb`))
            .not.toBe(getPushEndpointOwnershipKey(`${ORIGIN}/a/b`));
    });

    it('query順序と空query markerを変更しない', () => {
        expect(getPushEndpointOwnershipKey(`${ORIGIN}/x?b=2&a=1`))
            .toBe(`${ORIGIN}/x?b=2&a=1`);
        expect(getPushEndpointOwnershipKey(`${ORIGIN}/x`)).toBe(`${ORIGIN}/x`);
        expect(getPushEndpointOwnershipKey(`${ORIGIN}/x?`)).toBe(`${ORIGIN}/x?`);
    });

    it.each([
        `https://user@fcm.googleapis.com/x`,
        `https://user:password@fcm.googleapis.com/x`,
    ])('credentialsを含むendpoint %sを拒否する', (endpoint) => {
        expect(getPushEndpointOwnershipKey(endpoint)).toBeNull();
    });

    it.each([
        'http://fcm.googleapis.com/x',
        'https://example.com/x',
        'https://',
        '',
        null,
    ])('不許可endpoint %sを拒否する', (endpoint) => {
        expect(getPushEndpointOwnershipKey(endpoint)).toBeNull();
    });

    it('canonical長2048を受理し2049を拒否する', () => {
        const accepted = endpointWithLength(2048);
        expect(getPushEndpointOwnershipKey(accepted)).toBe(accepted);
        const encoded = `${ORIGIN}/${'%78'.repeat(accepted.length - `${ORIGIN}/`.length)}`;
        expect(encoded.length).toBeGreaterThan(2048);
        expect(getPushEndpointOwnershipKey(encoded)).toBe(accepted);
        expect(getPushEndpointOwnershipKey(`${accepted}#${'x'.repeat(2049)}`)).toBe(accepted);
        expect(getPushEndpointOwnershipKey(endpointWithLength(2049))).toBeNull();
    });
});
