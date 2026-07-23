import { describe, expect, it } from 'vitest';

import { parseWalkingRouteDuration } from './WalkingRoutes';

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
