import { describe, expect, it } from 'vitest';

import { AFFILIATE_EXPERIMENT_ID, createAffiliateAssignment, isJapaneseAmazonUrl, parseAffiliateAssignment, parseAffiliateEvent } from '@/lib/affiliate-experiment';
const validEvent = {
  schema: 1, event: 'impression', experiment: AFFILIATE_EXPERIMENT_ID,
  positionVariant: 'A', copyVariant: 'B', surface: 'shop', targetType: 'product', targetId: 'B012345678',
};
describe('createAffiliateAssignment', () => {
  it('境界未満と以上の乱数を渡した場合、独立したA/Bを返す', () => {
    expect(createAffiliateAssignment(new Uint8Array([127, 128])))
      .toEqual({ schema: 1, positionVariant: 'A', copyVariant: 'B', measurementEnabled: true });
  });
});
describe('parseAffiliateAssignment', () => {
  it('保存値が正常な場合、計測可能な割当を返す', () => {
    expect(parseAffiliateAssignment(JSON.stringify({ schema: 1, positionVariant: 'B', copyVariant: 'A' })))
      .toEqual({ schema: 1, positionVariant: 'B', copyVariant: 'A', measurementEnabled: true });
  });
  it('保存値が破損している場合、nullを返す', () => {
    expect(parseAffiliateAssignment('{broken')).toBeNull();
  });
});
describe('isJapaneseAmazonUrl', () => {
  it('HTTPSのAmazon.co.jpの場合、許可する', () => {
    expect(isJapaneseAmazonUrl('https://www.amazon.co.jp/dp/B012345678')).toBe(true);
  });
  it.each([
    'https://amazon.co.jp.example.com/item',
    'http://amazon.co.jp/item',
    'https://amazon.com/item',
    'https://user@amazon.co.jp/item',
    'https://amazon.co.jp:8443/item',
    'not-a-url',
  ])('Amazon.co.jpの安全なURLでない場合、拒否する: %s', (href) => {
    expect(isJapaneseAmazonUrl(href)).toBe(false);
  });
});
describe('parseAffiliateEvent', () => {
  it('最小化されたイベントの場合、受理する', () => {
    expect(parseAffiliateEvent(validEvent)).toEqual(validEvent);
  });
  it('PII候補の追加フィールドがある場合、拒否する', () => {
    expect(parseAffiliateEvent({ ...validEvent, userId: 'user-1' })).toBeNull();
    expect(parseAffiliateEvent({ ...validEvent, url: 'https://example.com' })).toBeNull();
  });
  it('targetIdが不正な場合、拒否する', () => {
    expect(parseAffiliateEvent({ ...validEvent, targetId: 'search term with spaces' })).toBeNull();
  });
});
