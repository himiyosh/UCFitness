import { describe, expect, it } from 'vitest';

import { getThemeFromItemCode, isTheme } from './theme';

describe('isTheme', () => {
    it('対応テーマの場合、trueを返す', () => {
        expect(isTheme('midnight')).toBe(true);
    });

    it('未対応値の場合、falseを返す', () => {
        expect(isTheme('unknown-theme')).toBe(false);
    });
});

describe('getThemeFromItemCode', () => {
    it('ショップの商品コードの場合、対応テーマを返す', () => {
        expect(getThemeFromItemCode('theme_sakura')).toBe('sakura');
    });

    it('未対応の商品コードの場合、nullを返す', () => {
        expect(getThemeFromItemCode('theme_unknown')).toBeNull();
    });
});
