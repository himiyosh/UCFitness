import { describe, expect, it } from 'vitest';

import {
    getWalkingRouteDurationAria,
    parseWalkingRouteDuration,
} from './WalkingRoutes';

describe('parseWalkingRouteDuration', () => {
    it.each([
        ['1e2', undefined],
        ['1.5', undefined],
        ['3abc', undefined],
        [' ', undefined],
        ['-1', undefined],
        ['', null],
        ['0', 0],
        ['3', 3],
        ['+3', 3],
    ])('入力"%s"を部分変換せず検証する', (value, expected) => {
        expect(parseWalkingRouteDuration(value)).toBe(expected);
    });
});

describe('getWalkingRouteDurationAria', () => {
    it('入力が不正な場合、エラー説明と無効状態を関連付ける', () => {
        expect(getWalkingRouteDurationAria(true)).toEqual({
            'aria-describedby': 'walking-route-duration-error',
            'aria-invalid': true,
        });
    });

    it('入力エラーを表示していない場合、ARIAエラー状態を付けない', () => {
        expect(getWalkingRouteDurationAria(false)).toEqual({});
    });
});
