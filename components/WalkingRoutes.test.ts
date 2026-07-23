import { build } from 'esbuild';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

import { getWalkingRouteDurationAria, parseWalkingRouteDuration } from './WalkingRoutes';
describe('WalkingRoutes duration validation', () => {
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
    it('native badInputを送信せず、エラーDOM反映後に毎回入力へfocusする', async () => {
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
            await page.setContent('<div id="root"></div>');
            await page.addScriptTag({ content: bundle.outputFiles[0].text });
            await page.getByRole('button', { name: 'addRoute' }).click();
            expect(pageErrors).toEqual([]);
            await page.getByRole('textbox', { name: 'namePlaceholder' }).fill('Route');
            const duration = page.getByRole('spinbutton', { name: 'durationPlaceholder' });
            expect(await duration.getAttribute('class')).toContain('min-h-[44px]');
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
        } finally {
            await browser.close();
        }
    });
});
