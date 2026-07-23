import { build } from 'esbuild';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

import {
    getWalkingRouteDistanceAria,
    getWalkingRouteDurationAria,
    parseWalkingRouteDistance,
    parseWalkingRouteDuration,
} from './WalkingRoutes';

describe('WalkingRoutes field validation', () => {
    it.each([
        ['1e2', undefined], ['1E2', undefined], ['1.', undefined], ['.5', undefined],
        ['+1', undefined], ['-1', undefined], ['3abc', undefined], [' ', undefined],
        ['1\n', undefined], ['\t1', undefined], ['NaN', undefined], ['Infinity', undefined],
        ['9'.repeat(400), undefined],
        ['', null], ['0', 0], ['0.0', 0], ['1.5', 1.5], ['001.50', 1.5],
    ])('距離入力"%s"を非負10進数全文として検証する', (value, expected) => {
        expect(parseWalkingRouteDistance(value)).toBe(expected);
    });
    it.each([
        ['1e2', undefined], ['1.5', undefined], ['3abc', undefined], [' ', undefined],
        ['-1', undefined], ['', null], ['0', 0], ['3', 3], ['+3', 3],
    ])('入力"%s"を部分変換せず検証する', (value, expected) => {
        expect(parseWalkingRouteDuration(value)).toBe(expected);
    });
    it.each([
        [true, { 'aria-describedby': 'walking-route-duration-error', 'aria-invalid': true }], [false, {}],
    ])('入力エラー状態が%sの場合にARIAを同期する', (invalid, expected) => {
        expect(getWalkingRouteDurationAria(invalid)).toEqual(expected);
    });
    it.each([
        [true, { 'aria-describedby': 'walking-route-distance-error', 'aria-invalid': true }], [false, {}],
    ])('距離入力エラー状態が%sの場合にARIAを同期する', (invalid, expected) => {
        expect(getWalkingRouteDistanceAria(invalid)).toEqual(expected);
    });
    it('距離と時間のnative badInputを送信せず、エラーDOM反映後に毎回入力へfocusする', async () => {
        const bundle = await build({
            stdin: {
                contents: `
                    import {createRoot} from 'react-dom/client'; import WalkingRoutes from './components/WalkingRoutes';
                    document.body.dataset.postCount = '0';
                    globalThis.fetch = async (_input, init) => {
                        if (init?.method === 'POST') document.body.dataset.postCount++;
                        return {ok: true, json: async () => ({routes: []})};
                    };
                    createRoot(document.querySelector('#root')).render(<WalkingRoutes />);`,
                loader: 'tsx', resolveDir: process.cwd(),
            },
            bundle: true, format: 'iife', jsx: 'automatic', platform: 'browser', write: false,
            plugins: [{
                name: 'test-resolver',
                setup(context) {
                    context.onResolve({ filter: /^@\// }, ({ path: importPath }) =>
                        ({ path: `${process.cwd()}/${importPath.slice(2)}.ts` }));
                    context.onResolve({ filter: /^next-intl$/ }, () => ({
                        path: 'next-intl', namespace: 'test-mock',
                    }));
                    context.onLoad({ filter: /.*/, namespace: 'test-mock' }, () =>
                        ({ contents: 'export const useTranslations = () => (key) => key;' }));
                },
            }],
        });
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
            const pageErrors: string[] = []; page.on('pageerror', (error) => pageErrors.push(error.message));
            await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
            await page.getByRole('button', { name: 'addRoute' }).click();
            expect(pageErrors).toEqual([]);
            await page.getByRole('textbox', { name: 'namePlaceholder' }).fill('Route');
            const duration = page.getByRole('spinbutton', { name: 'durationPlaceholder' });
            expect(await duration.getAttribute('class')).toContain('min-h-[44px]');
            expect(await duration.getAttribute('class')).toContain('focus:ring-[var(--color-primary)]');
            expect(await duration.getAttribute('class')).toContain('focus:outline-[var(--color-primary)]');
            await duration.pressSequentially('-');
            expect(await duration.evaluate((input) => [
                (input as HTMLInputElement).validity.badInput, (input as HTMLInputElement).value,
            ])).toEqual([true, '']);
            await duration.evaluate((input) => {
                document.body.dataset.focusCount = '0';
                input.addEventListener('focus', () => {
                    document.body.dataset.focusCount = String(Number(document.body.dataset.focusCount) + 1);
                    document.body.dataset.focusSnapshot = [
                        input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby'),
                        Boolean(document.getElementById('walking-route-duration-error')),
                    ].join('|');
                });
            });
            const save = page.getByRole('button', { name: 'save' });
            for (const expectedFocusCount of ['1', '2']) {
                await save.click();
                await page.waitForFunction((count) => document.body.dataset.focusCount === count, expectedFocusCount);
                expect(await page.locator('body').getAttribute('data-focus-snapshot')).toBe(
                    'true|walking-route-duration-error|true');
                expect(await page.locator('body').getAttribute('data-post-count')).toBe('0');
            }
            await duration.press('Backspace');
            expect(await duration.evaluate((input) => [
                (input as HTMLInputElement).validity.badInput, input.getAttribute('aria-invalid'),
                input.getAttribute('aria-describedby'), Boolean(document.getElementById('walking-route-duration-error')),
            ])).toEqual([false, null, null, false]);

            const distance = page.getByRole('spinbutton', { name: 'distancePlaceholder' });
            expect(await distance.getAttribute('class')).toContain('min-h-[44px]');
            expect(await distance.getAttribute('class')).toContain('focus:ring-[var(--color-primary)]');
            expect(await distance.getAttribute('class')).toContain('focus:outline-[var(--color-primary)]');
            expect(await distance.locator('xpath=../..').getAttribute('class')).toContain('flex-col');
            await distance.fill('1e2');
            await distance.evaluate((input) => {
                document.body.dataset.distanceFocusCount = '0';
                input.addEventListener('focus', () => {
                    document.body.dataset.distanceFocusCount = String(
                        Number(document.body.dataset.distanceFocusCount) + 1,
                    );
                    document.body.dataset.distanceFocusSnapshot = [
                        input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby'),
                        Boolean(document.getElementById('walking-route-distance-error')),
                    ].join('|');
                });
            });
            await save.click();
            await page.waitForFunction(() => document.body.dataset.distanceFocusCount === '1');
            expect(await page.locator('body').getAttribute('data-distance-focus-snapshot')).toBe(
                'true|walking-route-distance-error|true');
            expect(await page.locator('body').getAttribute('data-post-count')).toBe('0');

            await distance.fill('');
            expect(await distance.evaluate((input) => [
                input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby'),
                Boolean(document.getElementById('walking-route-distance-error')),
            ])).toEqual([null, null, false]);
            await distance.pressSequentially('-');
            expect(await distance.evaluate((input) => [
                (input as HTMLInputElement).validity.badInput, (input as HTMLInputElement).value,
            ])).toEqual([true, '']);
            for (const expectedFocusCount of ['2', '3']) {
                await save.click();
                await page.waitForFunction(
                    (count) => document.body.dataset.distanceFocusCount === count,
                    expectedFocusCount,
                );
                expect(await page.locator('body').getAttribute('data-distance-focus-snapshot')).toBe(
                    'true|walking-route-distance-error|true');
                expect(await page.locator('body').getAttribute('data-post-count')).toBe('0');
            }
            await distance.press('Backspace');
            expect(await distance.evaluate((input) => [
                (input as HTMLInputElement).validity.badInput, input.getAttribute('aria-invalid'),
                input.getAttribute('aria-describedby'), Boolean(document.getElementById('walking-route-distance-error')),
            ])).toEqual([false, null, null, false]);
        } finally {
            await browser.close();
        }
    }, 15_000);
});
