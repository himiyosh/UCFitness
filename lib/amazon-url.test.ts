import { describe, expect, it } from 'vitest';

import { isOfficialAmazonHost, isOfficialAmazonUrl } from './amazon-url';

describe('isOfficialAmazonHost', () => {
    it.each([
        'amazon.com',
        'www.amazon.co.jp',
        'smile.amazon.co.uk',
        'amzn.to',
    ])('公式ホストの場合、trueを返す: %s', (hostname) => {
        expect(isOfficialAmazonHost(hostname)).toBe(true);
    });

    it.each([
        'amazon.evil.example',
        'amazon.co.jp.evil.example',
        'notamazon.com',
    ])('Amazon風の非公式ホストの場合、falseを返す: %s', (hostname) => {
        expect(isOfficialAmazonHost(hostname)).toBe(false);
    });
});

describe('isOfficialAmazonUrl', () => {
    it('公式HTTPS URLの場合、trueを返す', () => {
        expect(isOfficialAmazonUrl(new URL('https://www.amazon.co.jp/dp/ABCDEFGHIJ'))).toBe(true);
    });

    it('公式ホストでもHTTP URLの場合、falseを返す', () => {
        expect(isOfficialAmazonUrl(new URL('http://www.amazon.co.jp/dp/ABCDEFGHIJ'))).toBe(false);
    });
});
