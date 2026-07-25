import { describe, expect, it } from 'vitest';

import { getPushEndpointOwnershipKey } from '@/lib/push-endpoint';

const ORIGIN = 'https://fcm.googleapis.com';

const endpointWithLength = (length: number): string =>
    `${ORIGIN}/${'x'.repeat(length - `${ORIGIN}/`.length)}`;

describe('getPushEndpointOwnershipKey', () => {
    it.each([
        ['https://FCM.GOOGLEAPIS.COM:443/fcm/send/device#queued', `${ORIGIN}/fcm/send/device`],
        [`${ORIGIN}/A/%41/~/%7e/a%2fb/%e3%81%82?b=%7e&a=%2f`,
            `${ORIGIN}/A/A/~/~/a%2Fb/%E3%81%82?b=~&a=%2F`],
        [`${ORIGIN}/x?b=2&a=1`, `${ORIGIN}/x?b=2&a=1`],
        [`${ORIGIN}/x`, `${ORIGIN}/x`],
        [`${ORIGIN}/x?`, `${ORIGIN}/x?`],
    ])('%sをcanonical key %sへ正規化する', (input, expected) => {
        expect(getPushEndpointOwnershipKey(input)).toBe(expected);
    });

    it('percent encoded slashをmaterial slashと別authorityに保つ', () => {
        const encoded = getPushEndpointOwnershipKey(`${ORIGIN}/a%2Fb`);
        expect(getPushEndpointOwnershipKey(`${ORIGIN}/a%2fb`)).toBe(encoded);
        expect(encoded).not.toBe(getPushEndpointOwnershipKey(`${ORIGIN}/a/b`));
    });

    it.each([
        `https://user@fcm.googleapis.com/x`, `https://user:password@fcm.googleapis.com/x`,
        'http://fcm.googleapis.com/x', 'https://example.com/x', 'https://', '', null,
    ])('不許可endpoint %sを拒否する', (endpoint) => {
        expect(getPushEndpointOwnershipKey(endpoint)).toBeNull();
    });

    it('canonical長2048を受理し2049を拒否する', () => {
        const accepted = endpointWithLength(2048);
        const encoded = `${ORIGIN}/${'%78'.repeat(accepted.length - `${ORIGIN}/`.length)}`;
        expect([getPushEndpointOwnershipKey(accepted), getPushEndpointOwnershipKey(encoded),
            getPushEndpointOwnershipKey(`${accepted}#${'x'.repeat(2049)}`),
            getPushEndpointOwnershipKey(endpointWithLength(2049))])
            .toEqual([accepted, accepted, accepted, null]);
    });
});
